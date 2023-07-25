import * as paper from 'paper'
import { Homography } from './homography'
import { IR, StepStatus, Step, Mark, Arrow, Crosshair, Circle, Text, Box,
          SVG, Toolpath, SectionAnnotation, Instruction } from './type-utils'
import {  lowerEBB, lowerGCode, lowerSBP } from './ir'


// @customElement('overlay-root')
export class OverlayRoot {
  ps = new paper.PaperScope();
  largeNumber = 1000;
  baseUrl = 'http://localhost:3000';
  currMode: StepStatus = 'standby';

  // TODO: a section view

  // inches
  groundTruth = {
    height: 16.00,
    width: 16.75,
    offsetX: 1.00,
    offsetY: 0.75
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
      case 'circle':
        return this.generateCircle(mark as Circle);
      case 'text':
        return this.generateText(mark as Text);
      case 'svg':
        return this.generateSvg(mark as SVG);
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

    switch (toolpath.tssName) {
      case 'basic':
        return this.basicVis(irs);
      case 'depthMap':
        return this.depthMapVis(irs);
      case 'boundingBox':
        return this.boundingBoxVis(irs);
    }
    return new this.ps.Group();
  }  

  basicVis(irs: IR[]): paper.Group {
    console.log('basicVis called');
    let path = new this.ps.Path();
    path.strokeWidth = 1;
    let currentPos = new this.ps.Point(0, 0);
    
    irs.forEach( (ir) => {
      let newPos = new this.ps.Point(
        ir.args.x || currentPos.x,
        ir.args.y || currentPos.y
      );

      if (!currentPos.isClose(newPos, Number.EPSILON)) {
        path.add(newPos);
        currentPos = newPos;
      }
    });

    if (irs[0].state.units === 'in') {
      path.scale(25.4);
    }

    return new this.ps.Group({
      children: [path]
    });
  }

  depthMapVis(irs: IR[]): paper.Group {
    console.log("depthMapVis called");
    return new this.ps.Group();
  }

  boundingBoxVis(irs: IR[]): paper.Group {
    console.log("boundingBoxVis called");
    return new this.ps.Group();
  }

  generateSectionAnnotation(annotation: SectionAnnotation): paper.Group {
    switch (annotation.annotationName) {
      case 'screwDepth':
        console.log('Not yet implemented');
        return new this.ps.Group();
      case 'passDepths':
        return this.vizPassDepths(annotation);
    }
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

    topLine.strokeColor = new paper.Color('red');
    bottomLine.strokeColor = new paper.Color('red');
    leftLine.strokeColor = new paper.Color('red');
    rightLine.strokeColor = new paper.Color('red');

    return new this.ps.Group({
      name: 'crosshair',
      children: [topLine, bottomLine, leftLine, rightLine]
    });

    /*
    let vertical = new this.ps.Path.Line({
      from: [
        this.scaleFactor * mark.location.x,
        0
      ],
      to: [
        this.scaleFactor * mark.location.x,
        this.scaleFactor * this.largeNumber
      ],
      strokeColor: 'red'
    });
    let horizontal = new this.ps.Path.Line({
      from: [
        0,
        this.scaleFactor * mark.location.y
      ],
      to: [
        this.scaleFactor * this.largeNumber,
        this.scaleFactor * mark.location.y
      ],
      strokeColor: 'red'
    });
    return new this.ps.Group({
      name: 'crosshair',
      children: [vertical, horizontal]
    });*/
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

}

function main() {
  let overlayRoot = new OverlayRoot();
  (window as any).oRoot = overlayRoot;
}

main();
