import fetch from 'node-fetch';
import { Request as NFRequest, Response as NFResponse } from 'node-fetch';
import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process'

import { read, plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core'

const duetHostname = "192.168.1.2";

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

app.post('/gerber', (req, res) => {
    if (!req.body) {
        res.sendStatus(500);
        return;
    }
    let filepath = __dirname + '/tmp/F_Cu.gbr';
    fs.writeFileSync(filepath, req.body);
    res.sendStatus(200);
});


app.get('/gerber/plot', (req, res) => {
    let files = [
        __dirname + '/tmp/F_Cu.gbr',
        __dirname + '/tmp/outline.gbr'
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

app.get('/gerber/gcode', (req, res) => {
    let configPath = __dirname + '/config/millproject';
    let front = __dirname + '/tmp/F_Cu.gbr';
    exec(`pcb2gcode --front ${front} --config ${configPath}`, {
        cwd: __dirname + '/tmp'
    }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            res.sendStatus(500);
        }
        let gcodeFilepath = __dirname + '/tmp/front.ngc';
        let gcode = fs.readFileSync(gcodeFilepath).toString();
        res.status(200).send(gcode);
    });
});

app.listen(port, () => {
  console.log(`Exprimer Server listening on port ${port}`);
})
