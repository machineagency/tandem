# adsk_helpers.py
"""
Create user parameter if the parameter does not exist.
"""

import adsk.core, adsk.fusion, traceback

def create_user_parameter(paramName, paramValue, paramUnit):
    try:
        
        app = adsk.core.Application.get()
        ui  = app.userInterface
        designWS = ui.workspaces.itemById('FusionSolidEnvironment')
        designWS.activate()
        design = adsk.fusion.Design.cast(app.activeProduct)
        unitsMgr = design.unitsManager

        paramValueReal = unitsMgr.evaluateExpression(str(paramValue), paramUnit)
        realParamValue = adsk.core.ValueInput.createByReal(paramValueReal)

        if not design.userParameters.itemByName(paramName):
            design.userParameters.add(paramName, realParamValue, paramUnit, '')
        # else:
            #TODO: it will be nice to check the save userparameter value is different or the 
            # same from the last one.

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
