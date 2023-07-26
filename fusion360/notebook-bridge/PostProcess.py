#Author-
#Description-

import adsk.core, adsk.fusion, adsk.cam, traceback
import os

outputFolder = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

def exportSBPWithSetupNamed(setup_name):
    try:
        app = adsk.core.Application.get()
        ui  = app.userInterface
        doc = app.activeDocument
        products = doc.products
        product = products.itemByProductType("CAMProductType")
        camWS = ui.workspaces.itemById('CAMEnvironment')
        camWS.activate()
        
        if product == None:
            ui.messageBox('There are no CAM operations in the active document.  This script requires the active document to contain at least one CAM operation.',
                            'No CAM Operations Exist',
                            adsk.core.MessageBoxButtonTypes.OKButtonType,
                            adsk.core.MessageBoxIconTypes.CriticalIconType)
            return

        cam = adsk.cam.CAM.cast(product)
        setups = cam.setups
        setup = getSetup(setup_name, setups)
        operations = setup.allOperations
        operation = operations.item(0)
        
        if operation.hasToolpath == True:
            cam.postProcess(operation, configurePostpost(setup_name, cam))
        else:
            ui.messageBox('Operation has no toolpath to post')
            return
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def getSetup(setup_name, setups):
    for setup in setups:
        if setup.name == setup_name:
            return setup
    return None

def configurePostpost(postName, camRef):
    #this camRef in parameter is different than the adsk.cam. so please not alter it
    programName = postName
    global outputFolder
    units = adsk.cam.PostOutputUnitOptions.InchesOutput
    postConfig = os.path.join(camRef.genericPostFolder, 'shopbot.cps') 
    postInput = adsk.cam.PostProcessInput.create(programName, postConfig, outputFolder, units)
    
    # create the post properties
    postProperties = adsk.core.NamedValues.create()
    # create the disable sequence number property
    disableSequenceNumbers = adsk.core.ValueInput.createByBoolean(False)
    postProperties.add("showSequenceNumbers", disableSequenceNumbers)
    # add the post properties to the post process input
    postInput.postProperties = postProperties
    return postInput
    