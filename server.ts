import fetch from 'node-fetch';
import { Request as NFRequest, Response as NFResponse } from 'node-fetch';
import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import * as fs from 'fs';
import { exec } from 'child_process'
import { WebSocket } from 'ws';

import { read, plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core'
import * as paper from 'paper'

type Filepath = string;
type Layer = 'top' | 'drill' | 'outline';
type Filetype = 'gerber' | 'plot' | 'gcode';
type Side = 'front' | 'back';
type OverlayCommandType = 'step' | 'calibration' | 'standby';
type MarkType = 'arrow' | 'crosshair' | 'box' | 'circle' | 'text' | 'mutableBox'

interface OverlayCommand {
    name: string;
    type: OverlayCommandType;
    marks: Mark[];
}

interface Mark {
    type: MarkType;
    location: { x: number, y: number };
    text: string;
    innerPath: paper.Path;
}

function isFiletype(maybeFiletype: any): maybeFiletype is Filetype {
    return maybeFiletype === 'gerber' ||
           maybeFiletype === 'plot' ||
           maybeFiletype === 'gcode'
}

function isLayer(maybeLayer: any): maybeLayer is Layer {
    return maybeLayer === 'top' ||
           maybeLayer === 'drill' ||
           maybeLayer === 'outline'
}

function isSide(maybeSide: any): maybeSide is Side {
    return maybeSide === 'front' || maybeSide === 'back';
}

const app = express();
app.use(express.json({
    limit: '5mb'
}));
app.use(cors());
const port = 3000;

const duetHostname = "192.168.1.2";
const forwardingPrefix = '/duet'

let pcbName = 'Tiny44';
let LATEST_REGENERATE_TIME = Date.now();
let NEEDS_REGENERATE = false;
let latestOverlayCommand: OverlayCommand | null = null;

interface MillState {
    type: 'fabricatorData';
    x: number;
    y: number;
    z: number;
    status: number;
    timestampe: string;
};
let latestMillState: MillState | null = null;

function generateShopbotSocket() {
    const url = "wss://machineagency-shopbot-server.herokuapp.com";
    const protocol = "drawing";
    return new Promise<WebSocket>((resolve, reject) => {
      let socket = new WebSocket(url, protocol);
      socket.on("close", (event) => {
        console.log("Shopbot Socket Opened.")
      });
      socket.on("message", (data) => {
        let receivedString = data.toString();
        try {
            let parsedMessage = JSON.parse(receivedString);
            if (parsedMessage['type'] === 'fabricatorData') {
                latestMillState = parsedMessage;
            }
        }
        catch {

        }
      });
      socket.on("open", () => {
        console.log("Shopbot Socket Opened.")
        resolve(socket);
      });
      socket.on("error", (error) => {
        reject(error);
      });
    });
  }

let socket: WebSocket | null = null;
generateShopbotSocket().then(s => socket = s); 

app.get('/overlay/poll', (req, res) => {
    if (!latestOverlayCommand) {
        let standbyCommand: OverlayCommand = {
            name: 'standby',
            type: 'standby',
            marks: []
        };
        res.status(200).send(standbyCommand);
    }
    else {
        res.status(200).send(latestOverlayCommand);
        latestOverlayCommand = null;
    }
});

app.put('/overlay/command', (req, res) => {
    let validateCommand = (c: any) => {
        return !!(c && (c.type === 'step' || c.type === 'calibration'
                        || c.type === 'standby'));
    };
    let cmd = req.body;
    if (!validateCommand(cmd)) {
        res.status(500).send({
            message: `Invalid overlay command: ${JSON.stringify(cmd)}`
        });
    }
    else {
        latestOverlayCommand = cmd;
        res.status(200).send({
            message: 'Overlay command saved to server.'
        });
    }
});

function pcbPath(): Filepath {
    return `${__dirname}/defaults/${pcbName}.kicad_pcb`;
}

function gerberPath(layer: Layer): Filepath {
    const gerberSuffixes: Record<Layer, string> = {
        top: '-CuTop.gtl',
        drill: '.drl',
        outline: '-EdgeCuts.gm1'
    };
    const suffix = gerberSuffixes[layer];
    return `${__dirname}/tmp/${pcbName}${suffix}`;
}

function plotPath(side: Side): Filepath {
    const plotSuffixes: Record<Side, string> = {
        front: '-PlotFront.svg',
        back: '-PlotBack.svg'
    };
    const suffix = plotSuffixes[side];
    return `${__dirname}/tmp/${pcbName}${suffix}`;
}

function gcodePath(layer: Layer): Filepath {
    const gcodeSuffixes: Record<Layer, string> = {
        top: '-CuTop.ngc',
        drill: '-Drill.ngc',
        outline: '-EdgeCuts.ngc'
    };
    const suffix = gcodeSuffixes[layer];
    return `${__dirname}/tmp/${pcbName}${suffix}`;
}

const doFetch = () => {
    return new Promise((resolve, reject) => {
        fetch('http://192.168.1.2/rr_model?flags=d99fn')
            .then((response) => {
                response.json()
                    .then(data => resolve(data))
                    .catch(err => reject(err));
            })
            .catch((err: Error) => {
                reject(err);
            });
    });
};

const forward = (originalReq: Request) => {
    return new Promise<NFResponse>((resolve, reject) => {
        let path = originalReq.url.slice(forwardingPrefix.length);
        let url = 'http://' + duetHostname + path;
        let method = originalReq.method;
        let body = originalReq.body;
        // Skipping forwarding headers for now
        let params;
        if (method === 'POST') {
            params = { method, body };
        }
        else {
            params = { method };
        }
        fetch(url, params)
            .then((proxyResponse) => {
                resolve(proxyResponse);
            })
            .catch((err) => {
                console.error("Could not talk to the Duet.");
                reject(err)
            });
    });
};

app.all(`${forwardingPrefix}/*`, (req, res) => {
    forward(req).then((proxyResponse) => {
        // proxyResponse.json()
        proxyResponse.text()
            .then((proxyResponseData) => {
                try {
                    let parsedBody = JSON.parse(proxyResponseData);
                    res.status(proxyResponse.status)
                       .json(parsedBody);
                }
                catch (Error) {
                    res.status(proxyResponse.status)
                       .send(proxyResponseData);
                }
            })
            .catch((err) => {
                console.error("Got a response from the Duet, but could not parse it as a JSON.");
                console.error(err);
                res.sendStatus(500);
            });
    }).catch((err) => {
        console.error("Did not get a proper response from the Duet.");
        console.error(err);
        res.sendStatus(500);
    });
});

app.get('/file/:filetype/:layerOrSide', (req, res) => {
    let filetype = req.params.filetype;
    let layerOrSide = req.params.layerOrSide;
    if (isFiletype(filetype)) {
        if (filetype === 'plot') {
            if (isSide(layerOrSide)) {
                let side = layerOrSide;
                let path = plotPath(side);
                let fileString = fs.readFileSync(path).toString();
                res.status(200).send(fileString);
            }
            else {
                // error: invalid side
                res.status(400).send({
                    error: `Side (${layerOrSide}) must be: front, back.`
                });
            }
        }
        else if (isLayer(layerOrSide)) {
            let layer = layerOrSide;
            let pathFn = filetype === 'gerber' ? gerberPath : gcodePath;
            let path = pathFn(layer);
            let fileString = fs.readFileSync(path).toString();
            res.status(200).send(fileString);
        }
        else {
            // error: valid filetype, but not plot and invalid layer
            res.status(400).send({
                error: `Layer (${layerOrSide}) must be: top, outline, drill.`
            });
        }
    }
    else {
        // error: invalid filetype
        res.status(400).send({
            error: `Filetype (${layerOrSide}) must be: gerber, plot, gcode.`
        });
    }
});

app.post('/pcb/watchfile', (req, res) => {
    // TODO: change the currently watched KiCAD file
    res.sendStatus(200);
});

app.get('/pcb/poll', (req, res) => {
    res.status(200).send({
        status: NEEDS_REGENERATE ? 'regeneratingFiles' : 'stable',
        lastUpdate: LATEST_REGENERATE_TIME
    });
});

const filePath = './overlay/public/latest-svg.svg';

app.put('/overlay/latestSvg', (req, res) => {
    const svgData = req.body;

    fs.writeFile(filePath, svgData, (err) => {
        if (err) {
            console.error('Error writing SVG file:', err);
            res.status(500).send({
                message: 'Error writing SVG file'
            });
        } else {
            console.log('SVG file saved successfully');
            res.status(200).send({
                message: 'SVG file saved successfully'
            });
        }
    });
});


app.get('/overlay/homography', (req, res) => {
    try {
        let h = fs.readFileSync('./tmp/homography.json').toString();
        res.status(200).send({
            homography: h
        });
    }
    catch (error) {
        res.status(500).send({
            message: 'Could not read homography on the server.'
        });
    }
});

app.put('/overlay/homography', (req, res) => {
    let validateHomography = (maybeHomography: any) => {
        // TODO: improve this validation
        return maybeHomography.srcPts && maybeHomography.dstPts;
    };
    try {
        let deflatedHomography = req.body;
        if (!validateHomography(deflatedHomography)) {
            res.status(400).send({
                message: 'Invalid homography: valid JSON, but not valid attributes.'
            })
        }
        else {
            let serializedH = JSON.stringify(deflatedHomography);
            fs.writeFileSync('./tmp/homography.json', serializedH);
            res.status(200).send({
                message: 'Saved homography.'
            });
        }
    }
    catch (error) {
        res.status(400).send({
            message: 'Invalid homography: invalid JSON or unable to save file.'
        })
    }
});

let latestCommand: any = null;
let latestSbp: string | null = null;

app.get('/fusion360/poll', (req, res) => {
    if (!latestCommand) {
        res.status(200).send({
            status: 'standby',
        });
    }
    else {
        res.status(200).send(latestCommand);
        latestCommand = null;
    }
});

app.put('/fusion360/command', (req, res) => {
    latestCommand = req.body;
    res.status(200).send({
        message: "Saved the command."
    })
});

app.get('/fusion360/sbp/:filename', (req, res) => {
    try {
        let path = `./fusion360/${req.params.filename}.sbp`;
        let sbpFile = fs.readFileSync(path);
        let stats = fs.statSync(path);
        if (sbpFile) {
            let generatedAt = stats.ctimeMs;
            let msToHours = 2.77778e-7;
            let ageInHours = (Date.now() - generatedAt) * msToHours;
            let maxHourThreshold = 1;
            if (ageInHours > maxHourThreshold) {
                res.status(500).send({
                    message: `The toolpath is ${ageInHours} hour(s) old, over the limit`
                              + ` of ${maxHourThreshold} hour(s) old. Please regenerate.`
                });
            }
            else {
                let instructions = sbpFile.toString().split('\r\n');
                res.status(200).send({
                    instructions, ageInHours
                });
            }
        }
    }
    catch {
        res.status(500).send({
            message: `Could not find an SBP file with the name ${req.params.filename}.sbp.`
        }) 
    }
});

app.get('/fusion360/get_svg', (req, res) => {
    fs.readFile('./fusion360/SVGExport.svg', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        if (err.code === 'ENOENT') {
          // File not found, send 404
          res.status(404).send('SVG file not found');
        } else {
          // Other error, send 500
          res.status(500).send('Error reading SVG file');
        }
        return;
      }
      res.header('Content-Type', 'image/svg+xml');
      res.send(data);
    });
});

app.get('/mill/state', (req, res) => {
    if (!latestMillState) {
        res.status(500).send({
            message: 'No mill state.'
        });
    }
    else {
        // TODO: explicitly prompt the shopbot server for fresh state,
        // rather than relying on the last retrieved state.
        res.status(200).send(latestMillState);
    }
});

// testing the backend server
app.get('/connection/test', (req, res) => {
    res.status(200).send('Server connected and running');
});

app.post('/mill/instructions', (req, res) => {
    let insts = req.body.instructions;
    if (!insts) {
        res.status(400).send({
            message: 'Invalid instruction format.'
        });
    }
    else {
        if (!socket || socket.readyState !== socket.OPEN) {
            res.status(500).send({
                message: 'Cannot talk to the mill because the socket is not open.'
            });
        }
        else {
            let message = {
                type: 'gcode',
                data: insts
            };
            socket.send(JSON.stringify(message));
            res.status(200).send({
                message: 'Sent instructions to the mill.'
            });
        }
    }
});

function watchKicadPcbFile(filepath: Filepath) {
    fs.watchFile(filepath, (curr, prev) => {
        NEEDS_REGENERATE = true;
        compilePCB();
    });
    console.log(`Watching KiCAD PCB file: ${pcbPath()}`);
}

function compilePCB() {
    return new Promise<void>((resolve, reject) => {
        console.log(`Compiling PCB at ${new Date().toLocaleTimeString()}...`)
        generateGerbers().then(() => {
            Promise.all([
                generateGerberPlots(),
                generateGCodes()
            ]).then(() => {
                resolve();
            }).catch((error) => {
                console.log(error);
                reject(error);
            });
        }).catch((error) => {
            console.log(error);
            reject(error);
        }).finally(() => {
            LATEST_REGENERATE_TIME = Date.now();
            NEEDS_REGENERATE = false;
            console.log('... done.')
        });
    });
}

function generateGerbers() {
    return new Promise<void>((resolve, reject) => {
        exec(`kikit export gerber ${pcbPath()} .`, {
            cwd: __dirname + '/tmp'
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                console.log(`stdout: ${stdout}`);
                console.error(`stderr: ${stderr}`);
                reject(stderr);
            }
            resolve();
        });
    });
}

function generateGerberPlots() {
    return new Promise<void>((resolve, reject) => {
        let files = [
            gerberPath('top'), gerberPath('drill'), gerberPath('outline')
        ];
        read(files).then((readResult) => {
            const plotResult = plot(readResult);
            const renderLayersResult = renderLayers(plotResult);
            const renderBoardResult = renderBoard(renderLayersResult);
            const frontSvg = stringifySvg(renderBoardResult.top);
            const backSvg = stringifySvg(renderBoardResult.bottom);
            fs.writeFileSync(plotPath('front'), frontSvg);
            fs.writeFileSync(plotPath('back'), backSvg);
        }).catch((error) => {
            reject(error);
        });
    });
}

function generateGCodes() {
    return new Promise<void>((resolve, reject) => {
        let configPath = __dirname + '/config/millproject';
        exec(`pcb2gcode --config ${configPath} \
              --front ${gerberPath('top')} \
              --drill ${gerberPath('drill')} \
              --outline ${gerberPath('outline')} \
              --front-output ${gcodePath('top')} \
              --outline-output ${gcodePath('outline')}\
              --drill-output ${gcodePath('drill')}`, {
            cwd: __dirname + '/tmp'
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                console.log(`stdout: ${stdout}`);
                console.error(`stderr: ${stderr}`);
                reject(stderr);
            }
        });
    });
}

app.listen(port, () => {
    console.log(`Exprimer Server listening on port ${port}`);
    //watchKicadPcbFile(pcbPath());
    //compilePCB();
});
