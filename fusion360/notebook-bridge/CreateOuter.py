import adsk.core, adsk.fusion, traceback
from adsk.fusion import Design, Occurrence, Component, BRepBody
from adsk.core import UserInterface, ValueInput

offset = 1.8
tabLength = 0.5

# define common tools
app = adsk.core.Application.get()
ui = app.userInterface
design = adsk.fusion.Design.cast(app.activeProduct)
activeSelection = adsk.fusion.Design.cast(design)


def createOuter():
    try:
        # Get the root component of the active design.
        zDistance = design.userParameters.itemByName('propellerHeight')
        # body:adsk.fusion.Occurrence = recursivelyFindbRepBodies(activeSelection.activeOccurrence, 'top-down:1')
        # body.boundingBox
        body = recursivelyFindbRepBodies(activeSelection.rootComponent, "top-down:1")
        minP = body.boundingBox.minPoint
        maxP = body.boundingBox.maxPoint
        minP.set(minP.x - tabLength, minP.y - tabLength, minP.z)
        maxP.set(maxP.x + tabLength, maxP.y + tabLength, maxP.z)
        
        setUserParamter(design, "propellerHeight", maxP.z - minP.z, 'inch')
            
        zDistance = design.userParameters.itemByName('propellerHeight').value

        # sketches = rootComp.sketches
        xyPlane = activeSelection.rootComponent.xYConstructionPlane
        sketch = activeSelection.rootComponent.sketches.add(xyPlane)
        lines = sketch.sketchCurves.sketchLines
        
        linesListInner = lines.addTwoPointRectangle(adsk.core.Point3D.create(minP.x, minP.y, 0), adsk.core.Point3D.create(maxP.x, maxP.y, 0))
        linesListOuter = lines.addTwoPointRectangle(
            adsk.core.Point3D.create(minP.x-offset, minP.y-offset, 0), adsk.core.Point3D.create((maxP.x+offset), (maxP.y+offset), 0))  
        
        filletLinesList(linesListInner, sketch)

        # Define that the extent input.
        extrudes = activeSelection.rootComponent.features.extrudeFeatures
        prof = sketch.profiles.item(0)
        
        zDistanceValueInput = adsk.core.ValueInput.createByReal(zDistance)
        
        extInput = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        extInput.setDistanceExtent(False, zDistanceValueInput)

        # Create the extrusion.
        ext = extrudes.add(extInput)
        ext.bodies.item(0).name = "outer-SPOIL"
        
        # Get the end face of the extrusion
        endFace = ext.endFaces.item(0)
        startFace = ext.startFaces.item(0)

    
        return startFace, endFace
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def createTab():
    mainbody = recursivelyFindbRepBodies(activeSelection.rootComponent, "top-down:1")
    minP = mainbody.boundingBox.minPoint
    maxP = mainbody.boundingBox.maxPoint
    minP.set(minP.x - tabLength, minP.y - tabLength, minP.z)
    maxP.set(maxP.x + tabLength, maxP.y + tabLength, maxP.z)
    
    
    # tabX = min(maxP.x/20, 1)
    # tabY = min(maxP.y/20, 1)
    # tabZ = maxP.z/12 * 7
    tabZ = (maxP.z - minP.z) / 16 * 2
    tabX = min((maxP.x - minP.x)/8, tabZ*5)
    tabY = min((maxP.y - minP.y)/8, tabZ*5)
    tabZ = max(tabZ, tabY/10, tabX/10)
    midX = (minP.x + maxP.x)/2
    midY = (minP.y + maxP.y)/2
    midZ = (minP.z + maxP.z)/2

    
    # createTabNegativeYZ(tabY, tabZ, mainbody)
    def createTabYZ(tabY:float, tabZ:float, mainbody:BRepBody, startFrom:float):
        planes = activeSelection.rootComponent.constructionPlanes
        yzPlane = activeSelection.rootComponent.yZConstructionPlane
        extrusionBody = None
        extrusionSketch = None
        extrusionOffsetPlane = None
        for j in range (0, int((maxP.z - minP.z)/tabZ)):
        # for j in range (0, 1):
            # starting from 1/4 to 3/4
            i = ((maxP.y - minP.y) / tabY) /4
            while i < int((maxP.y - minP.y) / tabY) - ((maxP.y - minP.y) / tabY) /4:
            # for i in range(1, 4):
                #create a new sketch
                planeInput = planes.createInput()
                planeInput.setByOffset(yzPlane, ValueInput.createByReal(startFrom))
                offsetPlane = planes.add(planeInput)
                offsetSketch = activeSelection.rootComponent.sketches.add(offsetPlane)
                lines = offsetSketch.sketchCurves.sketchLines
                #locate the center of profile
                yPos = i*tabY + minP.y
                zPos = j*tabZ + tabZ/2 + maxP.z / 12
                lines.addTwoPointRectangle(adsk.core.Point3D.create(-(zPos - tabZ/2), yPos - tabY/2, 0), adsk.core.Point3D.create(-(zPos + tabZ/2), yPos + tabY/2, 0))
                # set up extrusion
                extrudes = activeSelection.rootComponent.features.extrudeFeatures
                prof = offsetSketch.profiles.item(offsetSketch.profiles.count - 1)
                extrudeInput = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
                # Create a to-entity extent definition
                isChained = True
                extent_toentity = adsk.fusion.ToEntityExtentDefinition.create(mainbody, isChained)
                # Set the one side extent with the to-entity-extent-definition, and with a taper angle of 0 degree
                extrudeInput.setOneSideExtent(extent_toentity, adsk.fusion.ExtentDirections.PositiveExtentDirection)
                # Create an offset type start definition
                start_offset = adsk.fusion.OffsetStartDefinition.create(ValueInput.createByReal(0))
                # Set the start extent of the extrusion
                extrudeInput.startExtent = start_offset
                # Create the extrusion
                try:
                    extrude4 = extrudes.add(extrudeInput)
                    body4 = extrude4.bodies.item(0)
                    body4.name = "tab" + str(i)
                    if extrusionBody == None:
                        #very first tab of the row
                        extrusionBody = body4
                        extrusionSketch = offsetSketch
                        extrusionOffsetPlane = offsetPlane
                        if extrusionBody.volume / prof.areaProperties(adsk.fusion.CalculationAccuracy.LowCalculationAccuracy).area < 2:
                            break
                    else:
                        if extrusionBody.volume < body4.volume:
                            body4.deleteMe()
                            offsetSketch.deleteMe()
                            offsetPlane.deleteMe()
                            i = i + 1
                        else:
                            extrusionBody.deleteMe()
                            extrusionSketch.deleteMe()
                            extrusionOffsetPlane.deleteMe()
                            extrusionBody = body4
                            extrusionSketch = offsetSketch
                            extrusionOffsetPlane = offsetPlane
                            if extrusionBody.volume / prof.areaProperties(adsk.fusion.CalculationAccuracy.LowCalculationAccuracy).area < 2:
                                break
                except Exception as e:
                    print("Error occurred: ", e)
                    timeline = design.timeline
                    timelineObj = timeline.item(timeline.count - 3)
                    timelineObj.rollTo(True)
                    timeline.deleteAllAfterMarker()
                    i = i + 1
                    continue

                #*******************super important line*****************
                i = i + 1

    # createTabNegativeYZ(tabY, tabZ, mainbody)
    def createTabXZ(tabX:float, tabZ:float, mainbody:BRepBody, startFrom:float):
        planes = activeSelection.rootComponent.constructionPlanes
        xzPlane = activeSelection.rootComponent.xZConstructionPlane
        extrusionBody = None
        extrusionSketch = None
        extrusionOffsetPlane = None
        for j in range (0, int((maxP.z - minP.z)/tabZ)):
        # for j in range (0, 1):
            i = ((maxP.x - minP.x) / tabX) / 4
            while i < int((maxP.x - minP.x) / tabX) - ((maxP.x - minP.x) / tabX) / 4:
            # for i in range(1, 4):
                #create a new sketch
                planeInput = planes.createInput()
                planeInput.setByOffset(xzPlane, ValueInput.createByReal(startFrom))
                offsetPlane = planes.add(planeInput)
                offsetSketch = activeSelection.rootComponent.sketches.add(offsetPlane)
                lines = offsetSketch.sketchCurves.sketchLines
                #locate the center of profile
                xPos = i*tabX + minP.x
                zPos = j*tabZ + tabZ/2 + maxP.z / 12
                lines.addTwoPointRectangle(adsk.core.Point3D.create((xPos - tabX/2), -(zPos - tabZ/2), 0), adsk.core.Point3D.create((xPos + tabX/2), -(zPos + tabZ/2), 0))
                # # set up extrusion
                extrudes = activeSelection.rootComponent.features.extrudeFeatures
                prof = offsetSketch.profiles.item(offsetSketch.profiles.count - 1)
                extrudeInput = extrudes.createInput(prof, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
                # Create a to-entity extent definition
                isChained = True
                extent_toentity = adsk.fusion.ToEntityExtentDefinition.create(mainbody, isChained)
                # Set the one side extent with the to-entity-extent-definition, and with a taper angle of 0 degree
                extrudeInput.setOneSideExtent(extent_toentity, adsk.fusion.ExtentDirections.PositiveExtentDirection)
                # Create an offset type start definition
                start_offset = adsk.fusion.OffsetStartDefinition.create(ValueInput.createByReal(0))
                # Set the start extent of the extrusion
                extrudeInput.startExtent = start_offset
                # Create the extrusion
                try:
                    extrude4 = extrudes.add(extrudeInput)
                    body4 = extrude4.bodies.item(0)
                    body4.name = "tab" + str(i)
                    if extrusionBody == None:
                        extrusionBody = body4
                        extrusionSketch = offsetSketch
                        extrusionOffsetPlane = offsetPlane
                        if extrusionBody.volume / prof.areaProperties(adsk.fusion.CalculationAccuracy.LowCalculationAccuracy).area < 2:
                            break
                    else:
                        if extrusionBody.volume <= body4.volume:
                            body4.deleteMe()
                            offsetSketch.deleteMe()
                            offsetPlane.deleteMe()
                            i = i + 1
                        else:
                            extrusionBody.deleteMe()
                            extrusionSketch.deleteMe()
                            extrusionOffsetPlane.deleteMe()
                            extrusionBody = body4
                            extrusionSketch = offsetSketch
                            extrusionOffsetPlane = offsetPlane
                            if extrusionBody.volume / prof.areaProperties(adsk.fusion.CalculationAccuracy.LowCalculationAccuracy).area < 2:
                                break
                except Exception as e:
                    timeline = design.timeline
                    timelineObj = timeline.item(timeline.count - 3)
                    timelineObj.rollTo(True)
                    timeline.deleteAllAfterMarker()
                    i = i + 1
                    continue

                #*******************super important line*****************
                i = i + 1

    createTabYZ(tabY, tabZ, mainbody, maxP.x)
    createTabYZ(tabY, tabZ, mainbody, minP.x)
    createTabXZ(tabX, tabZ, mainbody, minP.y)
    createTabXZ(tabX, tabZ, mainbody, maxP.y)

def combineOuter():
    combineFeatures = design.activeComponent.features.combineFeatures
    targetBody = recursivelyFindbRepBodies(activeSelection.rootComponent, "top-down:1")
    toolBodies = FindTabs(activeSelection.rootComponent)
    combineFeatureInput = combineFeatures.createInput(targetBody, toolBodies)
    combineFeatureInput.operation = 0
    combineFeatureInput.isKeepToolBodies = False
    combineFeatureInput.isNewComponent = False
    returnValue = combineFeatures.add(combineFeatureInput)
    returnValue.timelineObject.rollTo(True)
    body = returnValue.targetBody
    timeline = design.timeline
    timeline.moveToEnd()



def holeDrill(holeDrillingFace):
    try:
        # set up parameters
        dowelDiam = design.userParameters.itemByName('dowelDiam')
        zDistance = design.userParameters.itemByName('propellerHeight')
        body = recursivelyFindbRepBodies(activeSelection.rootComponent, "top-down:1")
        minP = body.boundingBox.minPoint
        maxP = body.boundingBox.maxPoint
        minP.set(minP.x - tabLength, minP.y - tabLength, minP.z)
        maxP.set(maxP.x + tabLength, maxP.y + tabLength, maxP.z)
    
        # Create a construction plane by offsetting the end face
        planes = activeSelection.rootComponent.constructionPlanes
        planeInput = planes.createInput()
        offsetVal = adsk.core.ValueInput.createByReal(zDistance.value)
        xyPlane = activeSelection.rootComponent.xYConstructionPlane
        planeInput.setByOffset(xyPlane, offsetVal)
        offsetPlane = planes.add(planeInput)

        # Create a sketch on the new construction plane and add four sketch points on it
        offsetSketch = activeSelection.rootComponent.sketches.add(offsetPlane)
        offsetSketchPoints = offsetSketch.sketchPoints

        sPt0 = offsetSketchPoints.add(adsk.core.Point3D.create((maxP.x+minP.x)/2, minP.y-offset/2, 0))
        sPt1 = offsetSketchPoints.add(adsk.core.Point3D.create((maxP.x+minP.x)/2, maxP.y+offset/2, 0))
        sPt2 = offsetSketchPoints.add(adsk.core.Point3D.create(minP.x-offset/2, (maxP.y+minP.y)/2, 0))
        sPt3 = offsetSketchPoints.add(adsk.core.Point3D.create(maxP.x+offset/2, (maxP.y+minP.y)/2, 0))

        # Add the four sketch points into a collection
        ptColl = adsk.core.ObjectCollection.create()
        ptColl.add(sPt0)
        ptColl.add(sPt1)
        ptColl.add(sPt2)
        ptColl.add(sPt3)

         # Create a hole input
        holes = activeSelection.rootComponent.features.holeFeatures
        holeInput = holes.createSimpleInput(adsk.core.ValueInput.createByString(dowelDiam.expression))
        holeInput.setPositionBySketchPoints(ptColl)
        holeInput.setDistanceExtent(ValueInput.createByString(zDistance.expression))
        
        hole = holes.add(holeInput)
        return hole.faces
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def filletLinesList(linesList, sketch):
    lineFirst = linesList[0]
    lineLast = linesList[len(linesList) - 1]
    sketch.sketchCurves.sketchArcs.addFillet(lineLast, lineLast.endSketchPoint.geometry, lineFirst, lineFirst.startSketchPoint.geometry, 1)

    for i in range(len(linesList) - 1):
        line1 = linesList[i]
        line2 = linesList[i+1]
        sketch.sketchCurves.sketchArcs.addFillet(line1, line1.endSketchPoint.geometry, line2, line2.startSketchPoint.geometry, 1)


def recursivelyFindbRepBodies(rootComponent: Component, name: str):
    for occurence in rootComponent.allOccurrences:
        if(occurence.name == name):
            return occurence
        for bBody in occurence.bRepBodies:
            if(bBody.name == name):
                return bBody
    for bBody in rootComponent.bRepBodies:
        if(bBody.name == name):
            return bBody

def FindTabs(rootComponent: Component):
    tabCollection = adsk.core.ObjectCollection.create()
    for occurrence in rootComponent.allOccurrences:
        if "tab" in occurrence.name:
            tabCollection.add(occurrence)
        for bBody in occurrence.bRepBodies:
            if "tab" in bBody.name:
                tabCollection.add(bBody)
    for bBody in rootComponent.bRepBodies:
        if "tab" in bBody.name:
            tabCollection.add(bBody)
    return tabCollection
        

def setUserParamter(design:Design, param_name:str, param_input:float, unit:str):
    if(design.userParameters.itemByName(param_name) is None):
        design.userParameters.add(param_name, ValueInput.createByReal(param_input), unit, '')
    elif design.userParameters.itemByName(param_name).value != param_input:
        design.userParameters.itemByName(param_name).value = param_input