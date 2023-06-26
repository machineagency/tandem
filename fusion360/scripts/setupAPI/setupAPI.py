import adsk.core
import adsk.fusion
import adsk.cam
import traceback
import os


def run(context):
    ui = None
    try:

        #################### initialisation #####################
        app = adsk.core.Application.get()
        ui = app.userInterface

        # use existing document, load 2D Strategies model from the Fusion CAM Samples folder
        doc = app.activeDocument

        # switch to manufacturing space
        camWS = ui.workspaces.itemById('CAMEnvironment')
        camWS.activate()

        # get the CAM product
        products = doc.products

        #################### Find tools in sample tool library ####################
        # get the tool libraries from the library manager
        camManager = adsk.cam.CAMManager.get()
        libraryManager = camManager.libraryManager
        toolLibraries = libraryManager.toolLibraries
        # we can use a library URl directly if we know its address (here we use Fusion's Metric sample library)
        # url = adsk.core.URL.create(
        #     'C:/Users/zzyoc/Desktop/shopbotCamTool.tools')

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
        faceTool = None
        adaptiveTool = None
        boreTool = None
        bore2Tool = None

        # searching the face mill and the bull nose using a loop for the roughing operations
        for tool in toolLibrary:
            # read the tool type
            toolType = tool.parameters.itemByName('tool_type').value.value

            # select the first face tool found
            # if toolType == 'face mill' and not faceTool:
            #     faceTool = tool

            # # search the roughing tool
            # elif toolType == 'bull nose end mill' and not adaptiveTool:
            #     # we look for a bull nose end mill tool larger or equal to 10mm but less than 14mm
            #     diameter = tool.parameters.itemByName(
            #         'tool_diameter').value.value
            #     if diameter >= 1.0 and diameter < 1.4:
            #         adaptiveTool = tool

            if toolType == "flat end mill" and tool.parameters.itemByName('tool_description').expression == "'1/4\" Flat Endmill'":
                boreTool = tool
            elif toolType == "face mill":
                faceTool = tool
            elif toolType == "ball end mill" and tool.parameters.itemByName('tool_description').expression == "'1/4\" 4\"-long ball end'":
                bore2Tool = tool

            # exit when the 2 tools are found
            if boreTool and faceTool and bore2Tool:
                break
        # ui.messageBox(bore2Tool.parameters.itemByName('tool_description').expression)
        #################### create setup Spoilboard ####################
        cam = adsk.cam.CAM.cast(products.itemByProductType("CAMProductType"))
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
        input.tool = boreTool
        input.displayName = 'Bore1'
        for i in range(boreTool.presets.count):
            if str(boreTool.presets.item(i).name) == "Wood":
                input.toolPreset = boreTool.presets.item(i)
        input.parameters.itemByName('tool_coolant').expression = "'disabled'"

        # add the operation to the setup
        boreOp = setup.operations.add(input)
        cam.generateToolpath(boreOp)


        #################### create setup FoamSurface ####################
        cam = adsk.cam.CAM.cast(products.itemByProductType("CAMProductType"))
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
        setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
        param = setupInput.parameters
        # set offset mode
        param.itemByName('job_stockFixedX').expression = '10 in'
        param.itemByName('job_stockFixedXMode').expression = "'center'"
        param.itemByName('job_stockFixedY').expression = "8 in"
        param.itemByName('job_stockFixedYMode').expression = "'center'"
        param.itemByName('job_stockFixedZ').expression = '2 in'
        param.itemByName('job_stockFixedZMode').expression = "'bottom'"
        param.itemByName('job_stockFixedZOffset').expression = '0 in'
        param.itemByName('job_stockFixedRoundingValue').expression = '0 in'

        setup = setups.add(setupInput)

        #################### face operation ####################
        input = setup.operations.createInput('face')
        input.tool = faceTool
        input.displayName = 'Face1'
        for i in range(faceTool.presets.count):
            ui.messageBox(boreTool.presets.item(i).name)
            if str(boreTool.presets.item(i).name) == "omsrud_face":
                input.toolPreset = boreTool.presets.item(i)

        input.parameters.itemByName('tool_coolant').expression = "'disabled'"
        input.parameters.itemByName('tool_spindleSpeed').expression = "3055.775 rpm"
        input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
        input.parameters.itemByName('tool_feedCutting').expression = "122.2 in/min"
        input.parameters.itemByName('bottomHeight_mode').expression = "'from point'"

        # add the operation to the setup
        faceOp = setup.operations.add(input)
        cam.generateToolpath(faceOp)


        #################### create setup FoamBore ####################
        cam = adsk.cam.CAM.cast(products.itemByProductType("CAMProductType"))
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
        setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
        param = setupInput.parameters
        # set offset mode
        param.itemByName('job_stockFixedX').expression = '10 in'
        param.itemByName('job_stockFixedXMode').expression = "'center'"
        param.itemByName('job_stockFixedY').expression = "8 in"
        param.itemByName('job_stockFixedYMode').expression = "'center'"
        param.itemByName('job_stockFixedZ').expression = '1.26 in'
        param.itemByName('job_stockFixedZMode').expression = "'center'"
        param.itemByName('job_stockFixedRoundingValue').expression = '0.5 in'

        setup = setups.add(setupInput)

        #################### bore2 operation ####################
        input = setup.operations.createInput('bore')
        input.tool = bore2Tool
        input.displayName = 'Bore2'

        input.parameters.itemByName('tool_coolant').expression = "'disabled'"
        input.parameters.itemByName('tool_spindleSpeed').expression = "15278.9 rpm"
        input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
        input.parameters.itemByName('tool_feedCutting').expression = "397.251 in/min"


        # add the operation to the setup
        bore2Op = setup.operations.add(input)
        cam.generateToolpath(bore2Op)



        #################### create setup TopCut ####################
        cam = adsk.cam.CAM.cast(products.itemByProductType("CAMProductType"))
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
        setupInput.name = 'TopCut'
        setupInput.stockMode = adsk.cam.SetupStockModes.FixedBoxStock
        param = setupInput.parameters
        # set offset mode
        param.itemByName('job_stockFixedX').expression = '10 in'
        param.itemByName('job_stockFixedXMode').expression = "'center'"
        param.itemByName('job_stockFixedY').expression = "8 in"
        param.itemByName('job_stockFixedYMode').expression = "'center'"
        param.itemByName('job_stockFixedZ').expression = '1.26 in'
        param.itemByName('job_stockFixedZMode').expression = "'center'"
        param.itemByName('job_stockFixedRoundingValue').expression = '0.5 in'

        setup = setups.add(setupInput)

        #################### adaptive operation ####################
        input = setup.operations.createInput('adaptive')
        input.tool = bore2Tool
        input.displayName = 'Adaptive2'

        input.parameters.itemByName('tool_coolant').expression = "'disabled'"
        input.parameters.itemByName('tool_spindleSpeed').expression = "15278.9 rpm"
        input.parameters.itemByName('tool_surfaceSpeed').expression = "1000 ft/min"
        input.parameters.itemByName('tool_feedCutting').expression = "397.251 in/min"
        input.parameters.itemByName('retractHeight_offset').expression = "0.25 in"
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

        #################### ncProgram and post-processing ####################
        # get the post library from library managerS
        postLibrary = libraryManager.postLibrary

        # query post library to get postprocessor list
        postQuery = postLibrary.createQuery(
            adsk.cam.LibraryLocations.Fusion360LibraryLocation)
        postQuery.vendor = "Autodesk"
        postQuery.capability = adsk.cam.PostCapabilities.Milling
        postConfigs = postQuery.execute()

        # find the "XYZ" post in the post library and import it to local library
        for config in postConfigs:
            if config.description == 'XYZ':
                url = adsk.core.URL.create("user://")
                importedURL = postLibrary.importPostConfiguration(
                    config, url, "NCProgramSamplePost.cps")

        # get the imported local post config
        postConfig = postLibrary.postConfigurationAtURL(importedURL)

        # create NCProgramInput object
        ncInput = cam.ncPrograms.createInput()
        ncInput.displayName = 'NC Program Sample'

        # change some nc program parameters...
        ncParameters = ncInput.parameters
        ncParameters.itemByName(
            'nc_program_filename').value.value = 'NCProgramSample'
        ncParameters.itemByName('nc_program_openInEditor').value.value = True

        # set user desktop as output directory (Windows and Mac)
        # make the path valid for Fusion360 by replacing \\ to / in the path
        desktopDirectory = os.path.expanduser("~/Desktop").replace('\\', '/')
        ncParameters.itemByName(
            'nc_program_output_folder').value.value = desktopDirectory

        # select the operations to generate (we skip steep_and_shallow here)
        # ncInput.operations = [faceOp, adaptiveOp]
        ncInput.operations = [boreOp]

        # add a new ncprogram from the ncprogram input
        newProgram = cam.ncPrograms.add(ncInput)

        # set post processor
        newProgram.postConfiguration = postConfig

        # change some post parameter
        postParameters = newProgram.postParameters
        # NcProgram parameters is pass as it is to the postprocessor (it has no units)
        postParameters.itemByName('builtin_tolerance').value.value = 0.01
        # NcProgram parameters is pass as it is to the postprocessor (it has no units)
        postParameters.itemByName(
            'builtin_minimumChordLength').value.value = 0.33

        # update/apply post parameters
        newProgram.updatePostParameters(postParameters)

        # post-process
        # uncomment next lines to automatically postprocess operations (requires them to be calculated!)
        #
        # set post options, by default post process only valid operations containing toolpath data
        # postOptions = adsk.cam.NCProgramPostProcessOptions.create()

        # newProgram.postProcess(postOptions)

        #################### Some functions to make our life easier ####################

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def getLibrariesURLs(libraries: adsk.cam.ToolLibraries, url: adsk.core.URL):
    ''' Return the list of libraries URL in the specified library '''
    urls: list[str] = []
    libs = libraries.childAssetURLs(url)
    for lib in libs:
        urls.append(lib.toString())
    for folder in libraries.childFolderURLs(url):
        urls = urls + getLibrariesURLs(libraries, folder)
    return urls
