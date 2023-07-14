#Author-
#Description-
"""
Export SVG of the model by using Shaper Utilities
in order to use this program, you must have the add on 
"Export to Origin" by Shaper Utilities ready in 
https://apps.autodesk.com/FUSION/en/Detail/Index?id=3662665235866169729&os=Win64&appLang=en
fusion 360. Otherwise, there will be error.
"""

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
