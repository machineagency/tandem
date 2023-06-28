import adsk.core
import adsk.fusion
import adsk.cam
import traceback
import os

import json
import typing
import urllib.error
import urllib.parse
import urllib.request
from email.message import Message

handlers = []

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
    data: dict = None,
    params: dict = None,
    headers: dict = None,
    method: str = "GET",
    data_as_json: bool = True,
    error_count: int = 0,
) -> Response:
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
        data = None

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

    return response

# Event handler for commandCreated event.
class ButtonExampleCreatedEventHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()

    def notify(self, args):
        # Code to react to the event.
        app = adsk.core.Application.get()
        ui = app.userInterface
        ui.messageBox('In MyCommandCreatedHandler event handler.')

def create_button(app: adsk.core.Application):
    # Get the UserInterface object and the CommandDefinitions collection.
    ui = app.userInterface
    cmdDefs = ui.commandDefinitions

    # Create a button command definition.
    buttonExample = cmdDefs.addButtonDefinition('MyButtonDefId', 'Sample Button',
                                                'Sample button tooltip',
                                                './icons')

    # Connect to the command created event.
    buttonExampleCreated = ButtonExampleCreatedEventHandler()
    buttonExample.commandCreated.add(buttonExampleCreated)
    handlers.append(buttonExampleCreated)

    # Get the "DESIGN" workspace.
    designWS = ui.workspaces.itemById('FusionSolidEnvironment')

    # Get the Solid > Create panel
    addInsPanel = designWS.toolbarPanels.itemById('SolidCreatePanel')

    # Add the button to the bottom.
    buttonControl = addInsPanel.controls.addCommand(buttonExample)

    # Make the button available in the panel.
    buttonControl.isPromotedByDefault = True
    buttonControl.isPromoted = True

def cleanup_button(app: adsk.core.Application):
    # Get the UserInterface object and the CommandDefinitions collection.
    ui = app.userInterface
    cmdDefs = ui.commandDefinitions

    # Delete the button definition.
    buttonExample = ui.commandDefinitions.itemById('MyButtonDefId')
    if buttonExample:
        buttonExample.deleteMe()

    # Get the "DESIGN" workspace.
    designWS = ui.workspaces.itemById('FusionSolidEnvironment')

    # Get panel the control is in.
    addInsPanel = designWS.toolbarPanels.itemById('SolidCreatePanel')

    # Get and delete the button control.
    buttonControl = addInsPanel.controls.itemById('MyButtonDefId')
    if buttonControl:
        buttonControl.deleteMe()

def run(context):
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        create_button(app)
        maybe_response = request('http://localhost:3000/fusion360/poll')
        if maybe_response:
            ui.messageBox(maybe_response.body)
        else:
            ui.messageBox('Did not work')
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
    finally:
        ui.messageBox('Finally clause')
        cleanup_button(app)
        if ui:
            ui.terminateActiveCommand()

def stop(context):
    ui.messageBox('Stop called')
    app = adsk.core.Application.get()
    ui = app.userInterface
    cleanup_button(app)
    ui.terminateActiveCommand()
