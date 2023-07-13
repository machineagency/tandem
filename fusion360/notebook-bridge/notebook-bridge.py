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
from .PropellerCAM import *
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
        """
        Decode body's JSON.

        Returns:
            Pythonic representation of the JSON object
        """
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
            # Make sure a command isn't running before changes are made.
            # if ui.activeCommand != 'SelectCommand':
            #     ui.commandDefinitions.itemById('SelectCommand').execute()
                
            maybeResponse = request("http://localhost:3000/fusion360/poll")
            if maybeResponse.status == 200:  # Check if the request was successful
                response_json = maybeResponse.json()  # Load JSON data from response
                if self.content == response_json:
                    pass
                else:
                    self.content = response_json
                    params = response_json.get('create_param')
                    cam_setup = response_json.get('setup_cam')
                    
                    cam = PropellerCAM()
                    if params:
                        for param in params:
                            create_user_parameter(param.get("name"), param.get("value"), param.get("unit"))
                    if cam_setup:
                        for setup in cam_setup:
                            if setup == "SpoilBoard":
                                cam.create_spoil_board()
                            elif setup == "FoamSurface":
                                cam.create_foam_surface()
                            elif setup == "FoamBore":
                                cam.create_foam_bore()
                            elif setup == "TopCut":
                                cam.create_top_cut()
                            elif setup == "BottomCut":
                                cam.create_bottom_cut()

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

