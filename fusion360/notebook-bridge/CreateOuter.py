import adsk.core, adsk.fusion, traceback



def createOuter():
    try:
        # Initialize the user interface.
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        activeSelection = adsk.fusion.Design.cast(design)
        # Get the root component of the active design.
        width = design.userParameters.itemByName("boxWidth").value
        height = design.userParameters.itemByName('boxHeight').value
        dowelDiam = design.userParameters.itemByName('dowelDiam')
        zDistance = design.userParameters.itemByName('propellerHeight')
        offset = 1.8
        
        # sketches = rootComp.sketches
        xyPlane = activeSelection.rootComponent.xYConstructionPlane
        sketch = activeSelection.rootComponent.sketches.add(xyPlane)

        # Draw three lines.
        lines = sketch.sketchCurves.sketchLines;
        
        linesListInner = lines.addTwoPointRectangle(adsk.core.Point3D.create(-width/2, -height/2, 0), adsk.core.Point3D.create(width/2, height/2, 0))
        linesListOuter = lines.addTwoPointRectangle(
            adsk.core.Point3D.create(-(width/2+offset), -(height/2+offset), 0), adsk.core.Point3D.create((width/2+offset), (height/2+offset), 0))  
        filletLinesList(linesListInner, sketch)

        # Define that the extent input.
        extrudes = activeSelection.rootComponent.features.extrudeFeatures
        prof = sketch.profiles.item(0)
        
        zDistanceValueInput = adsk.core.ValueInput.createByString(zDistance.expression)
        
        
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


def holeDrill(holeDrillingFace):
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        activeSelection = adsk.fusion.Design.cast(design)
        # Create a construction plane by offsetting the end face

        width = design.userParameters.itemByName("boxWidth").value
        height = design.userParameters.itemByName('boxHeight').value
        dowelDiam = design.userParameters.itemByName('dowelDiam')
        zDistance = design.userParameters.itemByName('propellerHeight')
        offset = 1.8
        zDistanceValueInput = adsk.core.ValueInput.createByString(zDistance.expression)

        planes = activeSelection.rootComponent.constructionPlanes
        planeInput = planes.createInput()
        offsetVal = adsk.core.ValueInput.createByString('0 cm')
        planeInput.setByOffset(holeDrillingFace, offsetVal)
        offsetPlane = planes.add(planeInput)

        # Create a sketch on the new construction plane and add four sketch points on it
        offsetSketch = activeSelection.rootComponent.sketches.add(offsetPlane)
        offsetSketchPoints = offsetSketch.sketchPoints
        sPt0 = offsetSketchPoints.add(adsk.core.Point3D.create(0, -(height/2+offset/2), 0))
        sPt1 = offsetSketchPoints.add(adsk.core.Point3D.create(0, (height/2+offset/2), 0))
        sPt2 = offsetSketchPoints.add(adsk.core.Point3D.create(-(width/2+offset/2), 0, 0))
        sPt3 = offsetSketchPoints.add(adsk.core.Point3D.create((width/2+offset/2), 0, 0))

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
        holeInput.setDistanceExtent(zDistanceValueInput)
        
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