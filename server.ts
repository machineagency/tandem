import fetch from 'node-fetch';
import * as express from 'express';

const app = express();
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

app.get('/', (req, res) => {
    doFetch().then(data => res.json(data));
})

app.listen(port, () => {
  console.log(`Duet Proxy Server listening on port ${port}`);
})
