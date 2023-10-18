# Tandem

Tandem is a system that implements all parts of a two-sided CNC milling workflow as a single program.
This repository comprises Tandem's backend server which facilitates communication between several parts:

- The _notebook programming interface_, on the web and included in a separate repository.
- The _AR Overlay_, in `overlay/`,
- The _notebook bridge_, an add-in to run in Autodesk Fusion 360, in `fusion360/`,
- The _Shopbot server_, which communicates with the physical CNC mill, in a separate repository.

To use Tandem, install this backend and open up the notebook to begin following the workflow.

## Note to Readers

To browse the notebook *without acutally using its functionality*, simply navigate to the notebook on Observable and follow the instructions there. No installation is required in that case. If you wish to replicate the process on your own setup, follow the instructions below.

**[Notebook frontend on Observable](https://observablehq.com/@machine-agency/two-sided-milling)**

## Installation

### Backend

1. In the root directory, run `npm install`.
2. Run `npm run server` to run the backend server, which should now be running on `localhost:3000` or similar. You, the notebook interface, and everything else can now make requests to the backend.

### AR Overlay

1. Navigate to `overlay/` and run `npm install`.
2. Run `npm run dev` and the AR overlay web page should be running on `localhost:5174` or similar.
3. Navigate to `localhost:5174` in the browser to open the web page. This webpage should be directed to a projector over the CNC mill.
4. To calibrate the projection for your physical setup, see the steps in the notebook. In `overlay/src/overlay-root.ts`, change the `groundTruth` variable to be the height (Y) and width (X) in inches of a reference rectangle on the CNC mill whose lower left corner is located (`offsetX`, `offsetY`) away from the lower-left corner of the projections. Apologies for the non-SI units; the machine we worked with uses primarily inches.

### Notebook Bridge

1. Install Autodesk Fusion 360 on your system.
2. Go to "Manage Tools" and install the `fusion360/toolLibrary/shopbotCamTool.json` file.
3. In "Scripts and Add-Ins," run `fusion360/notebook-bridge/`. **Important:** make sure the backend server is running when you run the notebook bridge, otherwise Fusion360 will stall as it polls a non-existent server.
4. Alternatively, In "Scripts and Add-Ins", select edit, and in the VS Code window popup, select the run with debugger option.

### Physical CNC Mill

To connect this backend to a physical CNC mill, you need to modify `server.ts` to send messages to the mill using your technology of choice.

For our implemenatation, we communicated with a Shopbot by: 1) running a server in the cloud that the backend could query, and 2) running a program on the computer that is physically connected to the Shopbot. See the accompanying repositories for more instructions on how to run these.

Then, change the line of code in `server.ts`

```const url = "YOUR SERVER URL HERE";```

to be the URL of the Shopbot server running in the cloud.

### Communicating with a Clank CNC Mill Running a Duet2 (PCB Demo)

For the PCB demo, we used a much simpler setup where we connected directly to the Clank CNC mill's controller board (Duet 2) directly over Ethernet.

1. Make sure you've connected to the Duet page in the browser i.e. `192.168.1.2` and have that page open the whole time. See [these instructions](https://jubilee3d.com/index.php?title=Connecting_to_Jubilee) for an example of how to connect to the Duet over Ethernet.
2. Run `npm run server` to start the server, Ctrl-C to stop it.
3. While the server is running, make requests to `localhost:3000` e.g. `192.168.1.2/rr_gcode?gcode=G0 X0 Y 10`.

This approach would be more similar to most CNC mills, if you would like to use this approach as guidance for working with your own mill.
