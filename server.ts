import fetch from 'node-fetch';
import { Request as NFRequest, Response as NFResponse } from 'node-fetch';
import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process'

import { read, plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core'

type Filepath = string;
type Layer = 'top' | 'drill' | 'outline';

const app = express();
app.use(express.text());
app.use(cors());
const port = 3000;

const duetHostname = "192.168.1.2";

let pcbName = 'Tiny44';
let filesLastUpdated = Date.now();

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
        let path = originalReq.url;
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

app.all('/duet', (req, res) => {
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

app.get('/gerbers/plot', (req, res) => {
    generateGerberPlots().then((frontSvg) => {
        res.status(200).send(frontSvg);
    }).catch((err) => {
        res.status(500).send(err);
    });
});

app.get('/gerbers/gcodes', (req, res) => {
    // TODO: don't call generate here, just wait on stale flag
    generateGCodes().then((frontGCode) => {
        res.status(200).send(frontGCode);
    }).catch((err) => {
        res.status(500).send(err);
    });
});

app.get('/pcb/gerbers', (req, res) => {
    generateGerbers().then((frontGerber) => {
        res.status(200).send(frontGerber);
    }).catch((err) => {
        res.status(500).send(err);
    });
});

app.post('/pcb/watchfile', (req, res) => {
    // TODO: change the currently watched KiCAD file
    res.sendStatus(200);
});

app.post('/pcb/compile', (req, res) => {
    compilePCB().then((idk) => {
        console.log(idk);
        res.sendStatus(200);
    }).catch((error) => {
        res.status(500).send(error);
    });
});

function watchKicadPcbFile(filepath: Filepath) {
    fs.watchFile(filepath, (curr, prev) => {
        // TODO: compile to gerber, visualize gerber, gerber -> G-Code
    });
    console.log(`Watching KiCAD PCB file: ${pcbPath()}`);
}

function compilePCB() {
    return generateGerbers().then(gerberFile => {
        return Promise.all([
            generateGerberPlots(),
            generateGCodes()
        ]);
    }).catch((error) => {
        return error;
    });
}

function generateGerbers() {
    return new Promise<string>((resolve, reject) => {
        exec(`kikit export gerber ${pcbPath()} .`, {
            cwd: __dirname + '/tmp'
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                console.log(`stdout: ${stdout}`);
                console.error(`stderr: ${stderr}`);
                reject(stderr);
            }
            let front = fs.readFileSync(gerberPath('top')).toString();
            resolve(front);
        });
    });
}

function generateGerberPlots() {
    return new Promise<string>((resolve, reject) => {
        let files = [
            gerberPath('top'), gerberPath('drill'), gerberPath('outline')
        ];
        read(files).then((readResult) => {
            const plotResult = plot(readResult);
            const renderLayersResult = renderLayers(plotResult);
            const renderBoardResult = renderBoard(renderLayersResult);
            console.log(Object.values(renderLayersResult.rendersById).map(idk => idk.children));
            const topSvg = stringifySvg(renderBoardResult.top);
            resolve(topSvg);
        }).catch((error) => {
            console.log(error);
            reject(error);
        });
    });
}

function generateGCodes() {
    return new Promise<string>((resolve, reject) => {
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
            let gcode = fs.readFileSync(gcodePath('top')).toString();
            resolve(gcode);
        });
    });
}

app.listen(port, () => {
    console.log(`Exprimer Server listening on port ${port}`);
    watchKicadPcbFile(pcbPath());
});
