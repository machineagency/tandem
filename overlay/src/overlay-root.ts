import * as paper from 'paper'
import { Homography } from './homography'
import { IR, StepStatus, Step, Mark, ScrewPosition, BoxOutline, Arrow, Crosshair, Circle, Text, Box, SVG, Toolpath, SectionAnnotation, Instruction, ToolType } from './type-utils'
import { lowerEBB, lowerGCode, lowerSBP } from './ir'


// @customElement('overlay-root')
export class OverlayRoot {
  ps = new paper.PaperScope();
  largeNumber = 1000;
  baseUrl = 'http://localhost:3000';
  currMode: StepStatus = 'standby';

  // TODO: a section view

  // inches
  groundTruth = {
    height: 15.875,
    width: 16.625,
    offsetX: 1.09375,
    offsetY: 0.625
  };

  scaleFactor = 20;

  constructor() {
    let canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ps.setup(canvas);
    this.ps.view.scale(1, -1);
    setInterval(this.checkForUpdates.bind(this), 1000);
  }

  checkForUpdates() {
    fetch('http://localhost:3000/overlay/poll')
      .then((response) => response.json())
      .then((json) => {
        // TODO: validate JSON
        if (json) {
          this.updateCanvas(json);
        }
      })
      .catch((_) => {});
  }

  updateCanvas(step: Step) {
    if (step.type === 'step') {
      this.ps.project.activeLayer.removeChildren();
      this.fetchHomography().then((h) => {
        this.compileOverlay(step, h);
      });
    }
    else if (step.type === 'calibration') {
      this.ps.project.activeLayer.removeChildren();
      this.generateCalibrationBox();
    }
    else if (step.type === 'standby') {
      // noop
    }
  }

  fetchHomography () {
    return new Promise<Homography>((resolve, _) => {
      fetch('http://localhost:3000/overlay/homography')
        .then((response) => response.json())
        .then((json) => {
          let deflatedH = JSON.parse(json.homography);
          if (!(deflatedH && deflatedH.srcPts && deflatedH.dstPts)) {
            throw Error();
          }
          resolve(Homography(deflatedH.srcPts, deflatedH.dstPts));
        });
    });
  }

  applyHomography(h: Homography, g: paper.Group): void {
    let transformGroup = (group: paper.Group) => {
      group.children.forEach((i: paper.Item) => {
        if (i.className === 'Path') {
          let p = i as paper.Path;
          p.segments.forEach((seg) => {
            let transformedXY = h.transform(seg.point.x, seg.point.y);
            seg.point.set(transformedXY[0], transformedXY[1]);
          });
        }
        else if (i.className === 'PointText') {
          // We can't warp the text itself but at least we can position
          // it properly.
          let startPoint = (i as paper.PointText).point;
          let transformedPoint = h.transform(startPoint.x, startPoint.y);
          (i as paper.PointText).point.set(transformedPoint[0],
                                           transformedPoint[1]);
        }
        else if (i.className === 'Group') {
          // Recurse on the group's children
          transformGroup(i as paper.Group);
        }
      });
    };
    transformGroup(g);
  }

  compileOverlay(step: Step, h: Homography): paper.Group {
    let compiledMarks = step.marks.map(step => this.compileMark(step));
    compiledMarks.map(g => this.applyHomography(h, g));
    return new this.ps.Group(compiledMarks);
  }

  compileMark(mark: Mark): paper.Group {
    switch (mark.type) {
      case 'arrow':
        // TODO
        break;
      case 'crosshair':
        return this.generateCrosshair(mark as Crosshair);
      case 'box':
        return this.generateBox(mark as Box);
      case 'boxOutline':
        return this.generateBoxOutline(mark as BoxOutline);
      case 'circle':
        return this.generateCircle(mark as Circle);
      case 'text':
        return this.generateText(mark as Text);
      case 'svg':
        return this.generateSvg(mark as SVG);
      case 'screwPosition':
        return this.generateScrewPosition(mark as ScrewPosition);
      case 'calibrationBox':
        return this.generateCalibrationBox();
      case 'toolpath':
        return this.generateToolpathVisualization(mark as Toolpath);
      case 'sectionAnnotation':
        return this.generateSectionAnnotation(mark as SectionAnnotation);
    }
    return new paper.Group();
  }

  // Generates the different toolpath visualizations
  generateToolpathVisualization(toolpath: Toolpath): paper.Group {
    let irs: IR[];
    if (toolpath.isa === 'ebb') {
      irs = lowerEBB(toolpath);
    } else if (toolpath.isa === 'gcode') {
      irs = lowerGCode(toolpath);
    } else {
      irs = lowerSBP(toolpath);
    }

    let group = new paper.Group();
    switch (toolpath.tssName) {
      case 'basic':
        group = this.basicVis(irs);
        if (toolpath.toolType === 'face') {
          let toolDiam = 1.25;
          let cloneGroup = group.clone();
          cloneGroup.strokeWidth = toolDiam * this.scaleFactor;
          cloneGroup.opacity = 0.25;
          cloneGroup.strokeColor = new paper.Color('green');
          group.addChild(cloneGroup);
        }
        break;
      case 'bore':
        group = this.boreVis(irs, toolpath.dowelDiam);
        break;
    }
    group.position = new this.ps.Point(toolpath.location.x * this.scaleFactor, toolpath.location.y * this.scaleFactor);
    return group;
  }  

  basicVis(irs: IR[]): paper.Group {
    let path = new this.ps.Path();
    let group = new paper.Group();
    group.name = 'toolpath';

    let currentPos = new this.ps.Point(0, 0);
    let previousPos = new this.ps.Point(0, 0);
    
    irs.forEach( (ir) => {
      let newPos = new this.ps.Point(
        ir.args.x || currentPos.x,
        ir.args.y || currentPos.y
      );

      if (ir.op === "arc" && ir.args.dx !== null && ir.args.dy !== null ) {
        console.log(ir);
        group.addChild(path);
        path = new this.ps.Path();
        path.strokeWidth = 1;
        // ending point of the arc is newPos
        // current position should be the starting point of the arc

        // calculate through point of the arc
        let radius = Math.sqrt(Math.pow(ir.args.dx, 2) + Math.pow(ir.args.dy, 2));
        let center = new this.ps.Point(currentPos.x + ir.args.dx, currentPos.y + ir.args.dy);
        let throughPt;
        if (ir.state.clockwise === 1) {
          throughPt = new this.ps.Point(center.x - radius, center.y);
        } else {
          throughPt = new this.ps.Point(center.x + radius, center.y);
        }
        let arc = new this.ps.Path.Arc(currentPos, throughPt, newPos);
        group.addChild(arc);
      }

      if (currentPos.getDistance(previousPos) > Number.EPSILON) {
        path.add(newPos);
      }
      
      previousPos = currentPos;
      currentPos = newPos;
    });

    group.addChild(path);
    group.scale(this.scaleFactor);
    group.strokeColor = new paper.Color('green');

    return group;
  }

  boreVis(irs: IR[], diam: number): paper.Group {
    console.log('boreVis called');
    let group = new paper.Group();
    let first = false;
    let second = false;
    let p1;
    let p2;

    for (let i = 0; i !== irs.length; i++) {
      let ir = irs[i];
      if (!first && ir.args.x !== 0 && ir.args.y !== 0 && ir.args.x !== null && ir.args.y !== null) {
        p1 = new this.ps.Point(ir.args.x * this.scaleFactor, ir.args.y * this.scaleFactor);
        console.log(p1);
        first = true;
      } if (!second && ir.args.x !== null && ir.args.x < 0 && ir.args.y !== null) {
        p2 = new this.ps.Point(ir.args.x * this.scaleFactor, ir.args.y * this.scaleFactor);
        console.log(p2);
        second = true;
      }

      if (second && first) {
        break;
      }
    }

    let circle1 = new this.ps.Path.Circle({
          center: p1,
          radius: diam / 2 * this.scaleFactor,
          fillColor: 'red'
    });
     
    let circle2 = new this.ps.Path.Circle({
      center: p2,
      radius: diam / 2 * this.scaleFactor,
      fillColor: 'red'
    });
    console.log(circle1);
    console.log(circle2);
    group.addChild(circle1);
    group.addChild(circle2);
    
    return group;
  }

  generateSectionAnnotation(annotation: SectionAnnotation): paper.Group {
    let group = new paper.Group();
    switch (annotation.annotationName) {
      case 'screwDepth':
        group =  this.vizScrewDepth(annotation);
        break;
      case 'passDepths':
        group = this.vizPassDepths(annotation);
        break;
    }
    group.position = new this.ps.Point(annotation.location.x * this.scaleFactor, annotation.location.y * this.scaleFactor);
    return group;
  }

  /**
   * Draws a section-view annotation that visualizes the minimum depth at which
   * the screw needs to be secured in the stock before being able to safely mill.
   * @param annotation An annotation whose args are as follows
   *  { stockDepth: number, modelDepth: number }
   */
  vizScrewDepth(annotation: SectionAnnotation): paper.Group {
    let vizScale = 20;
    let stockDepth = annotation.args.stockDepth;
    let modelDepth = annotation.args.modelDepth;
    let bitWidth = 0.2;
    
    let group = new paper.Group();

    // Calculate the dimensions and positions
    let startX = 50; // Starting X-coordinate for the lines and drill bit
    let stockTopY = 50; // Y-coordinate for the top of the stock
    let stockBottomY = stockTopY - stockDepth; // Y-coordinate for the bottom of the stock

    // Create the stock lines
    let stockTopLine = new paper.Path.Line(new this.ps.Point(startX, stockTopY), new this.ps.Point(startX + 2, stockTopY));
    let stockBottomLine = new paper.Path.Line(new this.ps.Point(startX, stockBottomY), new this.ps.Point(startX + 2, stockBottomY));

    stockTopLine.strokeColor = new paper.Color('yellow');
    stockTopLine.strokeWidth = 1;
    stockBottomLine.strokeColor = new paper.Color('yellow');
    stockBottomLine.strokeWidth = 1;

    group.addChild(stockTopLine);
    group.addChild(stockBottomLine);

    // create drill bit
    let drillPoint = new this.ps.Point(startX + 1, stockBottomY + (modelDepth * .5));
    let leftPt = new this.ps.Point(startX + 1  - (bitWidth / 2), stockBottomY + modelDepth);
    let rightPt = new this.ps.Point(startX + 1 + (bitWidth / 2), stockBottomY + modelDepth);
    let topL = new this.ps.Point(leftPt.x, stockTopY + 0.25);
    let topR = new this.ps.Point(rightPt.x, stockTopY + 0.25);

    let path = new paper.Path();
    path.add(topL);
    path.add(leftPt);
    path.add(drillPoint);
    path.add(rightPt);
    path.add(topR);
    path.strokeColor = new paper.Color('white');
    path.strokeWidth = 1;

    group.addChild(path);

    // add dashed line for bottom of drill bit
    let drillLine = new paper.Path.Line(new this.ps.Point(startX, stockBottomY + modelDepth), new this.ps.Point(startX + 2, stockBottomY + modelDepth));
    drillLine.strokeColor = new paper.Color('pink');
    drillLine.dashArray = [1, 2];
    drillLine.strokeWidth = 0.75;

    group.addChild(drillLine);

    // add label for how deep to drill
    let top = new paper.Path.Line(new this.ps.Point(startX + 2.25, stockTopY), new this.ps.Point(startX + 2.45, stockTopY));
    top.strokeColor = new paper.Color('pink');
    top.strokeWidth = 0.75;

    let bottom = new paper.Path.Line(new this.ps.Point(startX + 2.25, stockBottomY + modelDepth), new this.ps.Point(startX + 2.45, stockBottomY + modelDepth));
    bottom.strokeColor = new paper.Color('pink');
    bottom.strokeWidth = 0.75;

    let height = new paper.Path.Line(new this.ps.Point(startX + 2.35, stockBottomY + modelDepth), new this.ps.Point(startX + 2.35, stockTopY));
    height.strokeColor = new paper.Color('pink');
    height.strokeWidth = 0.75;

    group.addChild(top);
    group.addChild(bottom);
    group.addChild(height);
    group.scale(vizScale);

    // add text label
    let text = new this.ps.PointText({
      point: [
        startX + 30.45,
        stockTopY
      ],
      content: stockDepth - modelDepth + ' in',
      fillColor: 'pink',
      fontFamily: 'Courier New',
      fontWeight: 'bold',
      fontSize: 10
    });
    text.scale(1, -1);

    group.addChild(text);

    return group;
  }

  /**
   * Draws a section-view annotation that parses a toolpath and visualizes the depths
   * of the passes as viewed from the side (section).
   * @param annotation An annotation whose args are as follows { thickness: number }
   */
  vizPassDepths(annotation: SectionAnnotation): paper.Group {
    // VIZ_FACTOR is a scaling factor that you can edit to make sure the visualization
    // that is produced is appropriately sized.
    let vizFactor = 3;
    let mlWidth = 5;
    let cutSpan = 40;
    let topBottomCutSpan = 20;
    let cutWidth = 1;
    let anchor = annotation.location;
    let thickness = annotation.args.thickness;
    let mlHeight = thickness * this.scaleFactor * vizFactor;
    let mlFrom = new this.ps.Point(anchor.x + mlWidth * 2, anchor.y);
    let mlTo = new this.ps.Point(anchor.x + mlWidth * 2, anchor.y + mlHeight);
    let mainline = new this.ps.Path.Line(mlFrom, mlTo);
    mainline.strokeWidth = mlWidth;
    mainline.strokeColor = new this.ps.Color(255, 255, 255);
    /**
     * In the annotation visualization, draw a line representing a pass.
     * @param depth The depth of the pass.
     * @param spanWidth How wide to draw the line.
     * @param isDashed Dashed line or not.
     */
    let drawHorizLine = (depth: number, spanWidth: number, isDashed: boolean) => {
      let dFrom = new this.ps.Point(
        anchor.x + mlWidth * 2,
        anchor.y + mlHeight + depth * vizFactor * this.scaleFactor
      );
      let dTo = new this.ps.Point(
        anchor.x + mlWidth * 2 + spanWidth,
        anchor.y + mlHeight + depth * vizFactor * this.scaleFactor
      );
      let cutline = new this.ps.Path.Line(dFrom, dTo);
      cutline.strokeWidth = cutWidth;
      cutline.strokeColor = new this.ps.Color(255, 255, 255);
      if (isDashed) {
        cutline.dashArray = [2, 1];
      }
      return cutline;
    };
    /**
     * Given a list of instructions representing a multiple-pass milling
     * operation, return an array of the depths of each pass.
     * @param insts: Instructions as one would pass to a TSS.
     */
    let parseDepths = (insts: Instruction[]): number[] => {
      // FIXME: for now ignore M3/J3
      let zMoves = insts.filter((inst) => inst[1] === "Z");
      let depths = zMoves.map((inst) => {
        let toks = inst.split(",");
        return parseFloat(toks[1]);
      });
      return depths.filter((depth) => depth < 0);
    };

    let parsedDepths = parseDepths(annotation.instructions);
    let group = new this.ps.Group();
    parsedDepths.forEach((depth) => {
      let line = drawHorizLine(depth, cutSpan, true);
      group.addChild(line)
    });
    group.addChild(drawHorizLine(0, topBottomCutSpan, false));
    group.addChild(drawHorizLine(thickness, topBottomCutSpan, false));
    return group;
  }

  // Calculates homography for the projection 
  generateCalibrationBox(): paper.Group {
    let box = new this.ps.Path.Rectangle({
      point: [
        this.scaleFactor * this.groundTruth.offsetX,
        this.scaleFactor * this.groundTruth.offsetY],
      size: [this.groundTruth.width * this.scaleFactor, this.groundTruth.height * this.scaleFactor],
      strokeColor: 'white',
      selected: true
    });
    let origBox = box.clone({ insert: false });
    if (this.ps.tool) {
      this.ps.tool.remove();
    }
    let tool = new this.ps.Tool();
    let activeSegment: paper.Segment | null = null;
    tool.onMouseDown = (event: paper.MouseEvent) => {
      let envPathOptions = {
        segments: true,
        stroke: true,
        tolerance: 25
      };
      let envPathHitResult = box.hitTest(event.point, envPathOptions);
      if (
        box.selected &&
        envPathHitResult &&
        envPathHitResult.type === "segment"
      ) {
        activeSegment = envPathHitResult.segment;
      }
    };
    tool.onMouseDrag = (event: paper.MouseEvent) => {
      if (box.selected && activeSegment) {
        activeSegment.point = activeSegment.point.add(
          event.delta
        );
      }
    };
    tool.onMouseUp = (_: paper.MouseEvent) => {
      activeSegment = null;
      let unpackPoint = (pt: paper.Point) => [pt.x, pt.y];
      let origPoints = origBox.segments
        .map((segment) => segment.point.clone())
        .map(unpackPoint)
        .flat();
      let transPoints = box.segments
        .map((segment) => segment.point.clone())
        .map(unpackPoint)
        .flat();
        let homography = Homography(origPoints, transPoints);
        let deflatedHomography = JSON.stringify(homography);
        fetch(this.baseUrl + '/overlay/homography', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: deflatedHomography
        });
    };
    return new this.ps.Group({
      name: 'calibrationBox',
      tool: tool,
      originalBox: origBox,
      children: [box]
    });
  }

  generateCrosshair(mark: Crosshair): paper.Group {
    console.log('Crosshair drawn');
    let center = new this.ps.Point(mark.location.x * this.scaleFactor, mark.location.y * this.scaleFactor);
    let canvasSize = this.ps.view.bounds.size;

    
    let topPoint = new this.ps.Point(center.x, 0);
    let bottomPoint = new this.ps.Point(center.x, canvasSize.height);
    let leftPoint = new paper.Point(0, center.y);
    let rightPoint = new paper.Point(canvasSize.width, center.y);

    let topLine = new paper.Path.Line(center, topPoint);
    let bottomLine = new paper.Path.Line(center, bottomPoint);
    let leftLine = new paper.Path.Line(center, leftPoint);
    let rightLine = new paper.Path.Line(center, rightPoint);

    topLine.strokeColor = new paper.Color('pink');
    bottomLine.strokeColor = new paper.Color('pink');
    leftLine.strokeColor = new paper.Color('pink');
    rightLine.strokeColor = new paper.Color('pink');

    return new this.ps.Group({
      name: 'crosshair',
      children: [topLine, bottomLine, leftLine, rightLine]
    });
  }

  generateCircle(mark: Circle): paper.Group {
    let circle = new this.ps.Path.Circle({
      center: [
        this.scaleFactor * mark.location.x,
        this.scaleFactor * mark.location.y
      ],
      radius: this.scaleFactor * mark.radius,
      fillColor: 'red'
    });
    return new this.ps.Group({
      name: 'circle',
      children: [circle]
    });
  }

  generateBox(mark: Box): paper.Group {
    let box = new this.ps.Path.Rectangle({
      point: [
        this.scaleFactor * mark.location.x,
        this.scaleFactor * mark.location.y
      ],
      size: [
        this.scaleFactor * mark.width,
        this.scaleFactor * mark.height
      ],
      fillColor: 'red'
    });
    return new this.ps.Group({
      name: 'box',
      children: [box]
    });
  }

  generateText(mark: Text): paper.Group {
    let text = new this.ps.PointText({
      point: [
        this.scaleFactor * mark.location.x,
        this.scaleFactor * mark.location.y
      ],
      content: mark.text,
      fillColor: 'red',
      fontFamily: 'Courier New',
      fontWeight: 'bold',
      fontSize: 25
    });
    text.scale(1, -1);
    return new this.ps.Group({
      name: 'text',
      children: [text]
    });
  }

  generateSvg(mark: SVG): paper.Group {
    // TODO
    let svgTextRaw = mark.text;
    if (!svgTextRaw) {
      return new this.ps.Group([]);
    }
    let svgTextDecoded = decodeURIComponent(svgTextRaw);
    this.ps.project.activeLayer.importSVG(svgTextDecoded, {
      onLoad: (item: paper.Item, _: string) => {
        item.scale(this.scaleFactor, this.scaleFactor);
        item.strokeColor = new paper.Color(255, 255, 255);
        // FIXME: this is not ending up in the correct position
        item.position.x = (mark.location.x * this.scaleFactor) + (item.bounds.width / 2);
        item.position.y = (mark.location.y * this.scaleFactor) + (item.bounds.height / 2);
      }
    });
    return new this.ps.Group();
  }

  generateScrewPosition(mark: ScrewPosition): paper.Group {
    // generates the screw position Xs
    let xSize = 4;
    // offset of the screw from corner of the stock
    let offset = mark.offset;

    // let bottomLeft = new this.ps.Point(box.bounds.topLeft.x, box.bounds.topLeft.y);
    let bottomLeft = new this.ps.Point(mark.location.x * this.scaleFactor, mark.location.y * this.scaleFactor);
    //let topLeft = new this.ps.Point(box.bounds.bottomLeft.x, box.bounds.bottomLeft.y);
    let topLeft = new this.ps.Point(mark.location.x * this.scaleFactor, (mark.location.y + + mark.height) * this.scaleFactor);
    //let centerRight = new this.ps.Point(box.bounds.rightCenter.x, box.bounds.center.y);
    let centerRight = new this.ps.Point((mark.location.x + mark.width) * this.scaleFactor, (mark.location.y + mark.height / 2) * this.scaleFactor);

    topLeft.x += offset;
    topLeft.y -= offset;
    bottomLeft.x += offset;
    bottomLeft.y += offset;
    centerRight.x -= offset;

    let x1 = drawX(bottomLeft.x, bottomLeft.y, xSize);
    let x2 = drawX(topLeft.x, topLeft.y, xSize);
    let x3 = drawX(centerRight.x, centerRight.y, xSize);

    let group = new this.ps.Group({
      name: 'screwPositions',
      children: [x1[0], x1[1], x2[0], x2[1], x3[0], x3[1]]
    });

    return group;
  }

  generateBoxOutline(mark: BoxOutline): paper.Group {
    let box = new this.ps.Path.Rectangle({
      point: [
        this.scaleFactor * mark.location.x,
        this.scaleFactor * mark.location.y
      ],
      size: [
        this.scaleFactor * mark.width,
        this.scaleFactor * mark.height
      ],
      strokeColor: 'red'
    });

    return new this.ps.Group({
      name: 'boxOutline',
      children: [box]
    });
  }

}

function main() {
  let overlayRoot = new OverlayRoot();
  (window as any).oRoot = overlayRoot;
}

// helper function to draw an x given a center and a size
function drawX(x: number, y: number, size: number): paper.Path.Line[] {
  let line1 = new paper.Path.Line({
    from: [x - size, y - size],
    to: [x + size, y + size],
    strokeColor: 'red',
    strokeWidth: 2
  });

  let line2 = new paper.Path.Line({
    from: [x + size, y - size],
    to: [x - size, y + size],
    strokeColor: 'red',
    strokeWidth: 2
  });

  return [line1, line2];
}

main();
