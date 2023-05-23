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

const duetHostname = "192.168.1.2";
const testGerberName = 'Tiny44';
const testGerberFilepath = `/Users/jaspero/Downloads/${testGerberName}.kicad_pcb`;

const app = express();
app.use(express.text());
app.use(cors());
const port = 3000;

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
    let files = [
        __dirname + `/tmp/${testGerberName}-CuTop.gtl`,
        __dirname + `/tmp/${testGerberName}.drl`,
        __dirname + `/tmp/${testGerberName}-EdgeCuts.gm1`,
    ];
    read(files).then((readResult) => {
        const plotResult = plot(readResult);
        const renderLayersResult = renderLayers(plotResult);
        const renderBoardResult = renderBoard(renderLayersResult);
        console.log(Object.values(renderLayersResult.rendersById).map(idk => idk.children));
        const svg = stringifySvg(renderBoardResult.top);
        res.send(svg).status(200);
    }).catch((error) => {
        console.log(error);
        res.sendStatus(500);
    });
});

app.get('/gerbers/gcode', (req, res) => {
    // TODO: run for every relevant generated gerber file
    let configPath = __dirname + '/config/millproject';
    let front = __dirname + `/tmp/${testGerberName}-CuTop.gtl`;
    exec(`pcb2gcode --front ${front} --config ${configPath}`, {
        cwd: __dirname + '/tmp'
    }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            res.status(500).send(stderr);
            return;
        }
        let gcodeFilepath = __dirname + `/tmp/${testGerberName}-CuTop.ngc`;
        let gcode = fs.readFileSync(gcodeFilepath).toString();
        res.status(200).send(gcode);
    });
});

app.get('/pcb/gerbers', (req, res) => {
    exec(`kikit export gerber ${testGerberFilepath} .`, {
        cwd: __dirname + '/tmp'
    }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            res.status(500).send(stderr);
        }
        let frontGerber = __dirname + `/tmp/${testGerberName}-CuTop.gtl`;
        let front = fs.readFileSync(frontGerber).toString();
        res.status(200).send(front);
    });
});

app.post('/pcb/watchfile', (req, res) => {
    // TODO: change the currently watched KiCAD file
    res.sendStatus(200);
});

function watchKicadPcbFile(filepath: Filepath) {
    fs.watchFile(filepath, (curr, prev) => {
        // TODO: compile to gerber, visualize gerber, gerber -> G-Code
    });
}

app.listen(port, () => {
  console.log(`Exprimer Server listening on port ${port}`);
  watchKicadPcbFile(testGerberFilepath);
  console.log(`Watching KiCAD PCB file: ${testGerberFilepath}`);
})
