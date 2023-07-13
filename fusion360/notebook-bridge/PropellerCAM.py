# adsk_helpers.py

import adsk.core, adsk.fusion, traceback

class PropellerCAM:

    def __init__(self):
        app = adsk.core.Application.get()
        ui = app.userInterface

        # use existing document, load 2D Strategies model from the Fusion CAM Samples folder
        doc = app.activeDocument

        # switch to manufacturing space
        camWS = ui.workspaces.itemById('CAMEnvironment')
        camWS.activate()

        # get the CAM product
        self.products = doc.products

        #################### Find tools in sample tool library ####################
        # get the tool libraries from the library manager
        camManager = adsk.cam.CAMManager.get()
        libraryManager = camManager.libraryManager
        toolLibraries = libraryManager.toolLibraries
        # we can use a library URl directly if we know its address (here we use Fusion's Metric sample library)

        fusion360Folder = toolLibraries.urlByLocation(
            adsk.cam.LibraryLocations.LocalLibraryLocation)
        fusion360Libs = getLibrariesURLs(toolLibraries, fusion360Folder)

        for str_url in fusion360Libs:
            if 'shopbot' in str_url:
                url = adsk.core.URL.create(str_url)
                break

        # load tool library
        toolLibrary = toolLibraries.toolLibraryAtURL(url)
        # create some variables for the milling tools which will be used in the operations
        self.faceTool = None
        self.adaptiveTool = None
        self.boreTool = None
        self.bore2Tool = None

        # searching the face mill and the bull nose using a loop for the roughing operations
        for tool in toolLibrary:
            # read the tool type
            toolType = tool.parameters.itemByName('tool_type').value.value

            if toolType == "flat end mill" and tool.parameters.itemByName('tool_description').expression == "'1/4\" Flat Endmill'":
                self.boreTool = tool
            elif toolType == "face mill":
                self.faceTool = tool
            elif toolType == "ball end mill" and tool.parameters.itemByName('tool_description').expression == "'1/4\" 4\"-long ball end'":
                self.bore2Tool = tool

            # exit when the 2 tools are found
            if self.boreTool and self.faceTool and self.bore2Tool:
                break

    
    def create_spoil_board(self):
        #################### create setup Spoilboard ####################
        cam = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
        setups = cam.setups
        try:
            if(setups.itemByName('Spoilboard')):
                pass
            
        except:
            setupInput = setups.createInput(adsk.cam.OperationTypes.MillingOperation)
            # create a list for the models to add to the setup Input
            models = []
            part = cam.designRootOccurrence.bRepBodies.item(0)
            # add the part to the model list
            models.append(part)
            # pass the model list to the setup input
            setupInput.models = models
            # change some setup properties
            setupInput.name = 'Spoilboard'
            setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
            param = setupInput.parameters
            # set offset mode
            param.itemByName('job_stockFixedX').expression = '10.5 in'
            param.itemByName('job_stockFixedXMode').expression = "'center'"

            param.itemByName('job_stockFixedY').expression = "10.5 in"
            param.itemByName('job_stockFixedYMode').expression = "'center'"

            param.itemByName('job_stockFixedZ').expression = '1.5 in'
            param.itemByName('job_stockFixedZMode').expression = "'bottom'"

            param.itemByName('job_stockFixedZOffset').expression = '0 in'

            param.itemByName('job_stockFixedRoundingValue').expression = '0 in'

            setup = setups.add(setupInput)

            #################### bore operation ####################
            input = setup.operations.createInput('bore')
            input.tool = self.boreTool
            input.displayName = 'Bore1'
            for i in range(self.boreTool.presets.count):
                if str(self.boreTool.presets.item(i).name) == "Wood":
                    input.toolPreset = self.boreTool.presets.item(i)
            input.parameters.itemByName('tool_coolant').expression = "'disabled'"

            # add the operation to the setup
            boreOp = setup.operations.add(input)
            cam.generateToolpath(boreOp)
            
    def create_foam_surface(self):
        #################### create setup FoamSurface ####################
        try:
            if(setups.itemByName('FoamSurface')):        
                pass
        except:
            cam = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setupInput = setups.createInput(
                adsk.cam.OperationTypes.MillingOperation)
            # create a list for the models to add to the setup Input
            models = []
            part = cam.designRootOccurrence.bRepBodies.item(0)
            # add the part to the model list
            models.append(part)
            # pass the model list to the setup input
            setupInput.models = models
            # change some setup properties
            setupInput.name = 'FoamSurface'
            setup = setups.add(setupInput)
            param = setup.parameters
            # set offset mode
            setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
            param.itemByName('job_stockMode').expression = "'fixedbox'"
            
            param.itemByName('job_stockFixedX').expression = '10 in'
            param.itemByName('job_stockFixedXMode').expression = "'center'"

            param.itemByName('job_stockFixedY').expression = "8 in"
            param.itemByName('job_stockFixedYMode').expression = "'center'"

            param.itemByName('job_stockFixedZ').expression = '2 in'
            param.itemByName('job_stockFixedZMode').expression = "'bottom'"

            param.itemByName('job_stockFixedZOffset').expression = '0 in'
            param.itemByName('job_stockFixedRoundingValue').expression = '0 in'
            

            #################### face operation ####################
            input = setup.operations.createInput('face')
            input.tool = self.faceTool
            input.displayName = 'Face1'
            for i in range(self.faceTool.presets.count):
                if str(self.boreTool.presets.item(i).name) == "omsrud_face":
                    input.toolPreset = self.boreTool.presets.item(i)

            input.parameters.itemByName('tool_coolant').expression = "'disabled'"
            input.parameters.itemByName('tool_spindleSpeed').expression = "3055.775 rpm"
            input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
            input.parameters.itemByName('tool_feedCutting').expression = "122.2 in/min"
            input.parameters.itemByName('bottomHeight_mode').expression = "'from surface top'"

            # add the operation to the setup
            faceOp = setup.operations.add(input)
            cam.generateToolpath(faceOp)
    def create_foam_bore(self):
        
        try:
            if(setups.itemByName('FoamBore')):
                pass
        except:
            #################### create setup FoamBore ####################
            cam = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setupInput = setups.createInput(
                adsk.cam.OperationTypes.MillingOperation)
            # create a list for the models to add to the setup Input
            models = []
            part = cam.designRootOccurrence.bRepBodies.item(0)
            # add the part to the model list
            models.append(part)
            # pass the model list to the setup input
            setupInput.models = models
            # change some setup properties
            setupInput.name = 'FoamBore'
            setup = setups.add(setupInput)
            param = setup.parameters
            # set offset mode
            param.itemByName('job_stockMode').expression = "'fixedbox'"
            param.itemByName('job_stockFixedX').expression = '10 in'
            param.itemByName('job_stockFixedXMode').expression = "'center'"
            param.itemByName('job_stockFixedY').expression = "8 in"
            param.itemByName('job_stockFixedYMode').expression = "'center'"
            param.itemByName('job_stockFixedZ').expression = '1.26 in'
            param.itemByName('job_stockFixedZMode').expression = "'center'"
            param.itemByName('job_stockFixedRoundingValue').expression = '0.5 in'

            

            #################### bore2 operation ####################
            input = setup.operations.createInput('bore')
            input.tool = self.bore2Tool
            input.displayName = 'Bore2'

            input.parameters.itemByName('tool_coolant').expression = "'disabled'"
            input.parameters.itemByName('tool_spindleSpeed').expression = "15278.9 rpm"
            input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
            input.parameters.itemByName('tool_feedCutting').expression = "397.251 in/min"


            # add the operation to the setup
            bore2Op = setup.operations.add(input)
            cam.generateToolpath(bore2Op)
    
    def create_top_cut(self):
        try:
            if(setups.itemByName('TopCut')):
                pass
        except:
            #################### create setup TopCut ####################
            cam = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setupInput = setups.createInput(
                adsk.cam.OperationTypes.MillingOperation)
            # create a list for the models to add to the setup Input
            models = []
            for i in range(cam.designRootOccurrence.component.allOccurrences.item(0).bRepBodies.count):
                # ui.messageBox(cam.designRootOccurrence.component.allOccurrences.item(1).bRepBodies.item(i).name)
                part = cam.designRootOccurrence.component.allOccurrences.item(0).bRepBodies.item(i)
                models.append(part)
            # pass the model list to the setup input
            setupInput.models = models
            # change some setup properties
            setupInput.name = 'TopCut'
            
            setup = setups.add(setupInput)
            param = setup.parameters
            # set offset mode
            param.itemByName('job_stockMode').expression = "'fixedbox'"
            param.itemByName('job_stockFixedX').expression = '10 in'
            param.itemByName('job_stockFixedXMode').expression = "'center'"
            param.itemByName('job_stockFixedY').expression = "8 in"
            param.itemByName('job_stockFixedYMode').expression = "'center'"
            param.itemByName('job_stockFixedZ').expression = '1.26 in'
            param.itemByName('job_stockFixedZMode').expression = "'center'"
            param.itemByName('job_stockFixedRoundingValue').expression = '0.5 in'
    


            #################### adaptive operation ####################
            input = setup.operations.createInput('adaptive')
            input.tool = self.bore2Tool
            input.displayName = 'Adaptive1'

            input.parameters.itemByName('tool_coolant').expression = "'disabled'"
            input.parameters.itemByName('tool_spindleSpeed').expression = "15278.9 rpm"
            input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
            input.parameters.itemByName('tool_feedCutting').expression = "397.251 in/min"
            input.parameters.itemByName('clearanceHeight_offset').expression = "0.25 in"
            input.parameters.itemByName('stockContours').expression = "true"
            input.parameters.itemByName('tolerance').expression = "0.01in"
            input.parameters.itemByName('useRestMachining').expression = "false"
            input.parameters.itemByName('useStockToLeave').expression = "false"
            input.parameters.itemByName('minimumStepdown').expression = "0.01 in"
            input.parameters.itemByName('optimalLoad').expression = "0.2 in"
            input.parameters.itemByName('rampType').expression = "'plunge'"

            # add the operation to the setup
            bore2Op = setup.operations.add(input)
            cam.generateToolpath(bore2Op)
    
    def create_bottom_cut(self):
        
        try:
            if(setups.itemByName('TopCut')):
                pass
        except:
            #################### create setup BottomCut ####################
            cam = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setupInput = setups.createInput(
                adsk.cam.OperationTypes.MillingOperation)
            # create a list for the models to add to the setup Input
            models = []
                
            for i in range(cam.designRootOccurrence.component.allOccurrences.item(1).bRepBodies.count):
                # ui.messageBox(cam.designRootOccurrence.component.allOccurrences.item(1).bRepBodies.item(i).name)
                part = cam.designRootOccurrence.component.allOccurrences.item(1).bRepBodies.item(i)
                models.append(part)
            # pass the model list to the setup input
            setupInput.models = models
            # change some setup properties
            setupInput.name = 'BottomCut'
            
            setup = setups.add(setupInput)
            param = setup.parameters
                
            # set offset mode
            param.itemByName('job_stockMode').expression = "'fixedbox'"
            param.itemByName('job_stockFixedX').expression = '5.0688 in'
            param.itemByName('job_stockFixedXMode').expression = "'center'"
            param.itemByName('job_stockFixedY').expression = "4.78587 in"
            param.itemByName('job_stockFixedYMode').expression = "'center'"
            param.itemByName('job_stockFixedZ').expression = '1.25984 in'
            param.itemByName('job_stockFixedZMode').expression = "'center'"
            param.itemByName('job_stockFixedRoundingValue').expression = '0 in'
            param.itemByName('wcs_orientation_mode').expression = "'axesZY'"
            param.itemByName('wcs_orientation_flipY').expression = 'true'
            param.itemByName('wcs_orientation_flipZ').expression = 'true'
            param.itemByName('wcs_origin_mode').expression = "'modelOrigin'"


            #################### adaptive operation ####################
            input = setup.operations.createInput('adaptive')
            input.tool = self.bore2Tool
            input.displayName = 'Adaptive2'

            input.parameters.itemByName('tool_coolant').expression = "'disabled'"
            input.parameters.itemByName('tool_spindleSpeed').expression = "15278.9 rpm"
            input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
            input.parameters.itemByName('tool_feedCutting').expression = "397.251 in/min"
            input.parameters.itemByName('clearanceHeight_offset').expression = "0.25 in"
            input.parameters.itemByName('stockContours').expression = "true"
            input.parameters.itemByName('tolerance').expression = "0.01 in"
            input.parameters.itemByName('useRestMachining').expression = "false"
            input.parameters.itemByName('useStockToLeave').expression = "false"
            input.parameters.itemByName('minimumStepdown').expression = "0.01 in"
            input.parameters.itemByName('optimalLoad').expression = "0.2 in"
            input.parameters.itemByName('rampType').expression = "'plunge'"

            # add the operation to the setup
            bore2Op = setup.operations.add(input)
            cam.generateToolpath(bore2Op)
    
def getLibrariesURLs(libraries: adsk.cam.ToolLibraries, url: adsk.core.URL):
    ''' Return the list of libraries URL in the specified library '''
    urls: list[str] = []
    libs = libraries.childAssetURLs(url)
    for lib in libs:
        urls.append(lib.toString())
    for folder in libraries.childFolderURLs(url):
        urls = urls + getLibrariesURLs(libraries, folder)
    return urls



