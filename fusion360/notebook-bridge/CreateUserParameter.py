# adsk_helpers.py

import adsk.core, adsk.fusion, traceback

def create_user_parameter(paramName, paramValue, paramUnit):
    try:
        app = adsk.core.Application.get()
        ui  = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)

        unitsMgr = design.unitsManager

        paramValueReal = unitsMgr.evaluateExpression(str(paramValue), paramUnit)
        realParamValue = adsk.core.ValueInput.createByReal(paramValueReal)

        if not design.userParameters.itemByName(paramName):
            design.userParameters.add(paramName, realParamValue, paramUnit, '')

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
