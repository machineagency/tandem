import adsk.core
import adsk.fusion
import adsk.cam
import traceback
import os, threading, random, time

import json
import typing
import urllib.error
import urllib.parse
import urllib.request
from .CreateUserParameter import *
from .CreateOuter import *
from .PropellerCAM import *
from . ExportSVG import *
from . PostProcess import *
from email.message import Message

from typing import Optional

app = adsk.core.Application.get()
ui = app.userInterface
handlers = []
myCustomEvent = 'MyCustomEventId'
customEvent = app.registerCustomEvent(myCustomEvent)
stopFlag = threading.Event()

# Response class and request function are copied from Jonathan Bowman's
# Post on dev.to (https://dev.to/bowmanjd/http-calls-in-python-without-requests-or-other-external-dependencies-5aj1)
class Response(typing.NamedTuple):
    body: str
    headers: Message
    status: int
    error_count: int = 0

    def json(self) -> typing.Any:
        try:
            output = json.loads(self.body)
        except json.JSONDecodeError:
            output = ""
        return output

def request(
    url: str,
    data: dict = {},
    params: dict = {},
    headers: dict = {},
    method: str = "GET",
    data_as_json: bool = True,
    error_count: int = 0,
) -> Optional[Response]:
    if not url.casefold().startswith("http"):
        raise urllib.error.URLError("Incorrect and possibly insecure protocol in url")
    method = method.upper()
    request_data = None
    headers = headers or {}
    data = data or {}
    params = params or {}
    headers = {"Accept": "application/json", **headers}

    if method == "GET":
        params = {**params, **data}
        data = {}

    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True, safe="/")

    if data:
        if data_as_json:
            request_data = json.dumps(data).encode()
            headers["Content-Type"] = "application/json; charset=UTF-8"
        else:
            request_data = urllib.parse.urlencode(data).encode()

    httprequest = urllib.request.Request(
        url, data=request_data, headers=headers, method=method
    )

    try:
        with urllib.request.urlopen(httprequest) as httpresponse:
            response = Response(
                headers=httpresponse.headers,
                status=httpresponse.status,
                body=httpresponse.read().decode(
                    httpresponse.headers.get_content_charset("utf-8")
                ),
            )
    except urllib.error.HTTPError as e:
        response = Response(
            body=str(e.reason),
            headers=e.headers,
            status=e.code,
            error_count=error_count + 1,
        )
    except urllib.error.URLError as e:
        return None

    return response

# The event handler that responds to the custom event being fired.
class ThreadEventHandler(adsk.core.CustomEventHandler):
    def __init__(self):
        super().__init__()
        self.content = {}
    def notify(self, args):
        try:
            maybeResponse = request("http://localhost:3000/fusion360/poll")
            if maybeResponse and maybeResponse.status == 200:  # Check if the request was successful
                response_json = maybeResponse.json()  # Load JSON data from response
                new_status = response_json.get('status')
                new_params = response_json.get('create_param')
                new_cam_setup = response_json.get('setup_cam')
                new_generate_svg = response_json.get('generate_svg')
                new_export_sbp = response_json.get('export_sbp')
                new_create_outer = response_json.get('create_outer')

                if(new_status != 'standby'):
                    if self.content.get('create_outer') != new_create_outer:
                        self.content['create_outer'] = new_create_outer
                        if new_create_outer:
                            bottomface, topface = createOuter()
                            innerBtmLoopEdgeCount = bottomface.loops.item(0).edges.count
                            innerLoopEdgeCount = topface.loops.item(0).edges.count
                            holeFaces = holeDrill(topface)

                            self.content['bottomface'] = bottomface
                            self.content['topface'] = topface
                            self.content['innerBtmLoopEdgeCount'] = innerBtmLoopEdgeCount
                            self.content['innerLoopEdgeCount'] = innerLoopEdgeCount
                            self.content['holeFaces'] = holeFaces
                            
                    # Check if 'create_param' is the same, if not, update and execute.
                    if self.content.get('create_param') != new_params:
                        self.content['create_param'] = new_params
                        if new_params:
                            for param in new_params:
                                create_user_parameter(param.get("name"), param.get("value"), param.get("unit"))

                    # Check if 'setup_cam' is the same, if not, update and execute.
                    if self.content.get('setup_cam') != new_cam_setup:
                        cam = PropellerCAM()
                        self.content['setup_cam'] = new_cam_setup
                        if new_cam_setup:
                            for setup in new_cam_setup:
                                if setup == "alignmentJig":
                                    cam.create_alignmentJig(self.content['holeFaces'])
                                elif setup == "foamSurface":
                                    cam.create_foam_surface()
                                elif setup == "foamBore":
                                    cam.create_foam_bore(self.content['holeFaces'])
                                elif setup == "topCut":
                                    cam.create_top_cut(getLoopWithEdgesOnFace(innerLoopEdgeCount, topface))
                                elif setup == "bottomCut":
                                    cam.create_bottom_cut(getLoopWithEdgesOnFace(innerBtmLoopEdgeCount, bottomface))

                    # Check if 'generate_svg' is the same, if not, update and execute.
                    if self.content.get('generate_svg') != new_generate_svg:
                        self.content['generate_svg'] = new_generate_svg
                        if new_generate_svg:
                            exportSVG()
                            
                    if self.content.get('export_sbp') != new_export_sbp:
                        self.content['export_sbp'] = new_export_sbp
                        if new_export_sbp:
                            for setupName in new_export_sbp:
                                exportSBPWithSetupNamed(setupName)
                else:
                    self.content = {}

        except:
            if ui:
                ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# The class for the new thread.
class MyThread(threading.Thread):
    def __init__(self, event):
        threading.Thread.__init__(self)
        self.stopped = event
        # ui.messageBox('Thread created')

    def run(self):
        ui.messageBox('Thread start')
        # Every five seconds fire a custom event, passing a random number.
        while not self.stopped.wait(5):
            args = {'Value': random.randint(1000, 10000)/1000}
            app.fireCustomEvent(myCustomEvent, json.dumps(args)) 

def run(context):
    try:
        # Register the custom event and connect the handler.
        onThreadEvent = ThreadEventHandler()
        customEvent.add(onThreadEvent)
        handlers.append(onThreadEvent)

        # Create a new thread for the other processing.        
        myThread = MyThread(stopFlag)
        myThread.start()
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

def stop(context):
    try:
        if handlers.count:
            customEvent.remove(handlers[0])
        stopFlag.set() 
        app.unregisterCustomEvent(myCustomEvent)
        ui.messageBox('Stop addin')
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

def getLoopWithEdgesOnFace(edgeCount, face):
    for i in range(face.loops.count):
        if(face.loops.item(i).edges.count == edgeCount):
            return face.loops.item(i).edges
