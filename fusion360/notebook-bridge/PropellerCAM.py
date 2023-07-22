# adsk_helpers.py

import adsk.core, adsk.fusion, adsk.cam, traceback




class PropellerCAM:

    def __init__(self):
        self.app = adsk.core.Application.get()
        self.ui = self.app.userInterface
        # use existing document, load 2D Strategies model from the Fusion CAM Samples folder
        doc = self.app.activeDocument
        designWS = self.ui.workspaces.itemById('FusionSolidEnvironment')
        designWS.activate()
        design = adsk.fusion.Design.cast(self.app.activeProduct)

        self.jigStock_x = design.userParameters.itemByName("jigStock_x").expression
        self.jigStock_y = design.userParameters.itemByName("jigStock_y").expression
        self.jigStock_z = design.userParameters.itemByName("jigStock_z").expression
        self.mainStock_x = design.userParameters.itemByName("mainStock_x").expression
        self.mainStock_y = design.userParameters.itemByName("mainStock_y").expression
        self.mainStock_z = design.userParameters.itemByName("mainStock_z").expression
        self.propellerHeight = design.userParameters.itemByName("propellerHeight").expression

        # switch to manufacturing space
        camWS = self.ui.workspaces.itemById('CAMEnvironment')
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

    
    def create_alignmentJig(self, holeFaces = None):
        
        try:
            cam: adsk.cam.CAM = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setup = getSetup('alignmentJig', setups)
            if(setup == None):
                setupInput = setups.createInput(adsk.cam.OperationTypes.MillingOperation)
                # create a list for the models to add to the setup Input
                models = []
                part = recursivelyFindbRepBodies(cam.designRootOccurrence, "outer-SPOIL")
                # add the part to the model list
                models.append(part)
                # pass the model list to the setup input
                setupInput.models = models
                # change some setup properties
                setupInput.name = 'alignmentJig'
                setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
                param = setupInput.parameters
                # set offset mode
                
                param.itemByName('job_stockFixedX').expression = self.jigStock_x
                param.itemByName('job_stockFixedXMode').expression = "'center'"

                param.itemByName('job_stockFixedY').expression = self.jigStock_y
                param.itemByName('job_stockFixedYMode').expression = "'center'"

                param.itemByName('job_stockFixedZ').expression = self.jigStock_z
                param.itemByName('job_stockFixedZMode').expression = "'bottom'"

                param.itemByName('job_stockFixedZOffset').expression = '0 in'

                param.itemByName('job_stockFixedRoundingValue').expression = '0 in'

                setup = setups.add(setupInput)

                #################### bore operation ####################

                # input = setup.operations.createInput('bore')
                # input.tool = self.boreTool
                # input.displayName = 'Face1'
                # for i in range(self.faceTool.presets.count):
                #     if str(self.boreTool.presets.item(i).name) == "omsrud_face":
                #         input.toolPreset = self.boreTool.presets.item(i)

                # input.parameters.itemByName('tool_coolant').expression = "'disabled'"
                # input.parameters.itemByName('tool_spindleSpeed').expression = "3055.775 rpm"
                # input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
                # input.parameters.itemByName('tool_feedCutting').expression = "122.2 in/min"
                # input.parameters.itemByName('bottomHeight_mode').expression = "'from surface top'"
                input = setup.operations.createInput('bore')
                input.tool = self.boreTool
                input.displayName = 'Bore1'

                
                for i in range(self.boreTool.presets.count):
                    if str(self.boreTool.presets.item(i).name) == "Wood":
                        input.toolPreset = self.boreTool.presets.item(i)
                        break
        
                input.parameters.itemByName('tool_coolant').expression = "'disabled'"
                
                if holeFaces is not None:
                    faces = []
                    for i in range(holeFaces.count):
                        faces.append(holeFaces.item(i))

                    modelParam = input.parameters.itemByName('circularFaces')
                    geomSelect: adsk.cam.GeometrySelection = modelParam.value
                    geomSelect.value = faces

                # add the operation to the setup
                boreOp = setup.operations.add(input)
                cam.generateToolpath(boreOp)
                # faceOp = setup.operations.add(input)
                # cam.generateToolpath(faceOp)
 
        except:
            pass
            
            
    def create_foam_surface(self):
        #################### create setup FoamSurface ####################
        try:
            cam: adsk.cam.CAM = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            
            setups = cam.setups
            setup = getSetup('foamSurface', setups)
            if setup == None:
                setupInput = setups.createInput(
                    adsk.cam.OperationTypes.MillingOperation)
                # create a list for the models to add to the setup Input
                models = []
                part = recursivelyFindbRepBodies(cam.designRootOccurrence, "outer-SPOIL")
                # add the part to the model list
                models.append(part)
                # pass the model list to the setup input
                setupInput.models = models
                # change some setup properties
                setupInput.name = 'foamSurface'
                setup = setups.add(setupInput)
                param = setup.parameters
                # set offset mode

                setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
                param.itemByName('job_stockMode').expression = "'fixedbox'"
                
                param.itemByName('job_stockFixedX').expression = self.mainStock_x
                param.itemByName('job_stockFixedXMode').expression = "'center'"
                param.itemByName('job_stockFixedY').expression = self.mainStock_y
                param.itemByName('job_stockFixedYMode').expression = "'center'"
                param.itemByName('job_stockFixedZ').expression = self.mainStock_z
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
        except:
            pass
            
    def create_foam_bore(self, holeFaces=None):
        
        try:
            cam: adsk.cam.CAM = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setup = getSetup('foamBore', setups)
            if setup == None:
                #################### create setup foamBore ####################
                setupInput = setups.createInput(
                    adsk.cam.OperationTypes.MillingOperation)
                # create a list for the models to add to the setup Input
                models = []
                part = recursivelyFindbRepBodies(cam.designRootOccurrence, "outer-SPOIL")
                # add the part to the model list
                models.append(part)
                # pass the model list to the setup input
                setupInput.models = models
                # change some setup properties
                setupInput.name = 'foamBore'
                setup = setups.add(setupInput)
                param = setup.parameters
                # set offset mode



                #properllerHeight
                param.itemByName('job_stockMode').expression = "'fixedbox'"
                param.itemByName('job_stockFixedX').expression = self.mainStock_x
                param.itemByName('job_stockFixedXMode').expression = "'center'"
                param.itemByName('job_stockFixedY').expression = self.mainStock_y
                param.itemByName('job_stockFixedYMode').expression = "'center'"
        
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

                if holeFaces is not None:
                    faces = []
                    for i in range(holeFaces.count):
                        faces.append(holeFaces.item(i))

                    modelParam = input.parameters.itemByName('circularFaces')
                    geomSelect: adsk.cam.GeometrySelection = modelParam.value
                    geomSelect.value = faces


                # add the operation to the setup
                bore2Op = setup.operations.add(input)
                cam.generateToolpath(bore2Op)
                
        except:
            pass
    
    def create_top_cut(self, innerTopEdges):
        try:
            cam: adsk.cam.CAM = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            
            setup = getSetup('topCut', setups)
            if setup == None:
                setupInput = setups.createInput(
                    adsk.cam.OperationTypes.MillingOperation)
                # create a list for the models to add to the setup Input
                models = []
                # find the component occurrence called top-down
                top_down = recursivelyFindbRepBodies(cam.designRootOccurrence, "top-down:1")
                if(top_down.objectType == "adsk::fusion::BRepBody"):
                    models.append(top_down)
                elif(top_down.objectType == "adsk::fusion::Occurrence"):
                    for bodies in top_down.bRepBodies:
                        models.append(bodies)
                # pass the model list to the setup input
                setupInput.models = models
                # change some setup properties
                setupInput.name = 'topCut'
                
                setup = setups.add(setupInput)
                param = setup.parameters

        
        
                # set offset mode
                param.itemByName('job_stockMode').expression = "'fixedbox'"
                param.itemByName('job_stockFixedX').expression = self.mainStock_x
                param.itemByName('job_stockFixedXMode').expression = "'center'"
                param.itemByName('job_stockFixedY').expression = self.mainStock_y
                param.itemByName('job_stockFixedYMode').expression = "'center'"
                param.itemByName('job_stockFixedZ').expression = self.propellerHeight
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

                if innerTopEdges is not None:
                    edgeList = [e for e in innerTopEdges]

                    cadcontours2dParam: adsk.cam.CadContours2dParameterValue = input.parameters.itemByName('stockContours').value
                    # Get the CurveSelections object from the CAD contour. This
                    # object manages the list of contour selections.
                    curveSelections = cadcontours2dParam.getCurveSelections()

                    # Get the edges from the loop and add them to a list.
                    outerEdges = [e for e in innerTopEdges]

                    # Create a new chain selection.
                    chainSel: adsk.cam.ChainSelection = curveSelections.createNewChainSelection()

                    # Set some properties of the chain.
                    chainSel.isOpen = False
                    chainSel.isReverted = False

                    # Add the geometry to the chain.
                    chainSel.inputGeometry = outerEdges

                    # Apply the curve selection back to the parameter.
                    cadcontours2dParam.applyCurveSelections(curveSelections)

                # add the operation to the setup
                AdaptiveOp = setup.operations.add(input)
                cam.generateToolpath(AdaptiveOp)
            
        except:
            pass
    
    def create_bottom_cut(self, innerBottomEdges):
        
        try:
            cam: adsk.cam.CAM = adsk.cam.CAM.cast(self.products.itemByProductType("CAMProductType"))
            setups = cam.setups
            setup = getSetup('bottomCut', setups)
            if setup == None:
                #################### create setup BottomCut ####################
                setupInput = setups.createInput(
                    adsk.cam.OperationTypes.MillingOperation)
                # create a list for the models to add to the setup Input
                models = []
                
                flipped_top_down = recursivelyFindbRepBodies(cam.designRootOccurrence, "top-down:1")
                if(flipped_top_down.objectType == "adsk::fusion::BRepBody"):
                    models.append(flipped_top_down)
                elif(flipped_top_down.objectType == "adsk::fusion::Occurrence"):
                    for bodies in flipped_top_down.bRepBodies:
                        models.append(bodies)
                    
                # pass the model list to the setup input
                setupInput.models = models
                # change some setup properties
                setupInput.name = 'bottomCut'
                setup = setups.add(setupInput)
                param = setup.parameters
                    
                # set offset mode
                param.itemByName('job_stockMode').expression = "'fixedbox'"
                param.itemByName('job_stockFixedX').expression = self.mainStock_x
                param.itemByName('job_stockFixedXMode').expression = "'center'"
                param.itemByName('job_stockFixedY').expression = self.mainStock_y
                param.itemByName('job_stockFixedYMode').expression = "'center'"

                param.itemByName('job_stockFixedZ').expression = self.propellerHeight

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


                if innerBottomEdges is not None:
                    edgeList = [e for e in innerBottomEdges]

                    cadcontours2dParam: adsk.cam.CadContours2dParameterValue = input.parameters.itemByName('stockContours').value
                    # Get the CurveSelections object from the CAD contour. This
                    # object manages the list of contour selections.
                    curveSelections = cadcontours2dParam.getCurveSelections()

                    # Get the edges from the loop and add them to a list.
                    outerEdges = [e for e in innerBottomEdges]

                    # Create a new chain selection.
                    chainSel: adsk.cam.ChainSelection = curveSelections.createNewChainSelection()

                    # Set some properties of the chain.
                    chainSel.isOpen = False
                    chainSel.isReverted = False

                    # Add the geometry to the chain.
                    chainSel.inputGeometry = outerEdges

                    # Apply the curve selection back to the parameter.
                    cadcontours2dParam.applyCurveSelections(curveSelections)


                # add the operation to the setup
                bore2Op = setup.operations.add(input)
                cam.generateToolpath(bore2Op)
        except:
            pass
            
    
def getLibrariesURLs(libraries: adsk.cam.ToolLibraries, url: adsk.core.URL):
    ''' Return the list of libraries URL in the specified library '''
    urls: list[str] = []
    libs = libraries.childAssetURLs(url)
    for lib in libs:
        urls.append(lib.toString())
    for folder in libraries.childFolderURLs(url):
        urls = urls + getLibrariesURLs(libraries, folder)
    return urls



def getSetup(setup_name, setups):
    for setup in setups:
        if setup.name == setup_name:
            return setup
    return None

def recursivelyFindbRepBodies(currentOccurence, name):
    bRepBodies = currentOccurence.bRepBodies
    childOccurrences = currentOccurence.childOccurrences

    if currentOccurence.name == name:
        return currentOccurence

    if bRepBodies and bRepBodies.count > 0:
        for i in range(bRepBodies.count):
            if bRepBodies.item(i).name == name:
                return bRepBodies.item(i)

    if childOccurrences and childOccurrences.count > 0:
        for i in range(childOccurrences.count):
            result = recursivelyFindbRepBodies(childOccurrences.item(i), name)
            if result is not None:
                return result

    return None

def recursivelyFindOccurences(currentOccurence, name):
    childOccurrences = currentOccurence.childOccurrences
    if currentOccurence.name == name:
        return currentOccurence

    if childOccurrences and childOccurrences.count > 0:
        for i in range(childOccurrences.count):
            result = recursivelyFindOccurences(childOccurrences.item(i), name)
            if result is not None:
                return result

    return None