# duet-proxy-server

HTTP proxy server for direct connection to a Duet3d.

## Introduction

This code lets you send HTTP requests to the Duet from a browser. Normally, a browser's security features will stop you from communicating to the Duet—even using its own HTTP API—because you would be making the requests from a separate origin (Cross Origin Requests).

The workaround for this is instead of sending HTTP requests directly to the Duet, we send them to this server which the forwards the requests as a backend service which is not subject to cross origin security concerns. The way this works is: you run this server as a local host, and then in your coding environment e.g. Observable notebooks, you can make requests to the local host instead of to the Duet.

## Installation

1. Clone this repo.
2. Run `npm install`.
3. Make sure you've connected to the Duet page in the browser i.e. `192.168.1.2` and have that page open the whole time. In the future I'd like to get rid of this step, but this is how it is for now.
4. Run `npm run server` to start the server, Ctrl-C to stop it.
5. While the server is running, make requests to `localhost:3000` e.g. `192.168.1.2/rr_gcode?gcode=G0 X0 Y 10`.

## Next Steps

1. Uploading G-code currently doesn't work—debugging this now.
2. Change the client's interface to be web socket while keeping the HTTP interface behind the scenes. This way the API from the notebook/caller's end can be synchronous and we can poll the Duet behind the scenes. This would make this less of a proxy and more of a service.
3. KiCAD integration with a Python process spawned by the server controller.
