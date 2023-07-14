#Author-
#Description-

import adsk.core, adsk.fusion, adsk.cam, traceback

def exportSVG():
    ui = None
    try:
        app = adsk.core.Application.get()
        ui  = app.userInterface
        # Get the "DESIGN" workspace. 
        designWS = ui.workspaces.itemById('FusionSolidEnvironment')
        designWS.activate()
        ui.commandDefinitions.itemById('ShaperTools_Contents_shaperExport').execute()

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
