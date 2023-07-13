import fetch from 'node-fetch';
import { Request as NFRequest, Response as NFResponse } from 'node-fetch';
import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process'

import { read, plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core'
import * as paper from 'paper'

type Filepath = string;
type Layer = 'top' | 'drill' | 'outline';
type Filetype = 'gerber' | 'plot' | 'gcode';
type Side = 'front' | 'back';

interface Step {
    name: string;
    marks: Mark[];
}

interface Mark {
    type: MarkType;
    location: { x: number, y: number };
    text: string;
    innerPath: paper.Path;
}

type MarkType = 'arrow' | 'crosshair' | 'box' | 'circle' | 'text' | 'mutableBox'

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
app.use(express.text());
app.use(cors());
const port = 3000;

const duetHostname = "192.168.1.2";
const forwardingPrefix = '/duet'

let pcbName = 'Tiny44';
let LATEST_REGENERATE_TIME = Date.now();
let NEEDS_REGENERATE = false;

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

app.get('/overlay/poll', (req, res) => {
    res.status(200).send({
        message: 'hi'
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

let latestStep = {
    name: 'todo',
    marks: [
        {
            type: 'crosshair',
            location: {
                x: 120,
                y: 130
            }
        },
        {
            type: 'text',
            location: {
                x: 100,
                y: 100
            },
            text: 'hello'
        },
        {
            type: 'box',
            location: {
                x: 200,
                y: 250
            },
            dimensions: {
                width: 100,
                height: 75
            }
        }
    ]
};

app.get('/overlay/step', (req, res) => {
    res.status(200).send(latestStep);
});

app.get('/fusion360/poll', (req, res) => {
    res.status(200).send({
        
        "create_param": [
            {
                "name": "Length",
                "value": 15.0,
                "unit": "mm"
            },
            {
                "name": "Width",
                "value": 10.0,
                "unit": "mm"
            }
        ],
        "setup_cam": 
            ["SpoilBoard",
            "FoamSurface"]
        
    });
});

app.put('/fusion360/stepNumber', (req, res) => {
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
