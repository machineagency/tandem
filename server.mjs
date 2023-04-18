import fetch from 'node-fetch';
// const fetch = import('node-fetch');

// const doFetch = async () => {
//     const response = await fetch('http://192.168.1.2/rr_model?flags=d99fn');
//     const data = await response.json();
//     return data
// }

const doFetch = () => {
    return new Promise((resolve, reject) => {
        fetch('http://192.168.1.2/rr_model?flags=d99fn')
            .then((response) => {
                response.json()
                    .then(data => resolve(data))
                    .catch(err => reject(err));
            })
            .catch((err) => {
                reject(err);
            });
    });
};

import express from 'express';
// const express = import('express')
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    doFetch().then(data => res.json(data));
  //res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
