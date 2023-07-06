import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'

import * as paper from 'paper'

interface Step {
  name: string;
  status: StepStatus;
  marks: Mark[];
}

interface Mark {
  type: MarkType;
  location: { x: number, y: number };
  dimensions: { width: number, height: number };
  text: string;
  innerPath: paper.Path;
}

type StepStatus = 'step' | 'calibration';
type MarkType = 'arrow' | 'crosshair' | 'box' | 'circle' | 'text' | 'mutableBox'
                | 'calibrationBox'

@customElement('overlay-root')
export class OverlayRoot extends LitElement {
  ps = new paper.PaperScope();
  largeNumber = 1000;

  // TODO: a section view

  // inches
  groundTruth = {
    height: 16.00,
    width: 16.75,
    offsetX: 1.00,
    offsetY: 0.625
  };

  scaleFactor = 1;

  firstUpdated(): void {
    let canvas = this.shadowRoot?.getElementById('canvas') as HTMLCanvasElement;
    this.ps.setup(canvas);
    this.ps.view.scale(1, -1);
  }

  connectedCallback(): void {
    super.connectedCallback();
    setInterval(this.checkForUpdates.bind(this), 1000);
  }

  checkForUpdates() {
    fetch('http://localhost:3000/overlay/step')
      .then((response) => response.json())
      .then((json) => {
        // TODO: validate JSON
        if (json) {
          this.updateCanvas(json);
        }
      })
      .catch((error) => {});
  }

  updateCanvas(step: Step) {
    this.ps.project.activeLayer.removeChildren();
    if (step.status === 'step') {
      this.compileOverlay(step);
    }
    else if (step.status === 'calibration') {
      this.generateCalibrationBox();
    }
  }

  compileOverlay(step: Step): paper.Group {
    let compiledMarks = step.marks.map(step => this.compileMark(step));
    return new this.ps.Group(compiledMarks);
  }

  compileMark(mark: Mark): paper.Group {
    switch (mark.type) {
      case 'arrow':
        break;
      case 'crosshair':
        return this.generateCrosshair(mark);
      case 'box':
        return this.generateBox(mark);
      case 'circle':
        break;
      case 'text':
        return this.generateText(mark);
      case 'mutableBox':
        break;
      case 'calibrationBox':
        return this.generateCalibrationBox(mark);
    }
    return new paper.Group();
  }

  generateCalibrationBox(): paper.Group {
    let box = new this.ps.Path.Rectangle({
      point: [
        this.groundTruth.offsetX + this.groundTruth.width / 2,
        this.groundTruth.offsetY + this.groundTruth.height / 2],
      size: [this.groundTruth.width, this.groundTruth.height],
      strokeColor: 'white',
      selected: true,
      onMouseDown: () => {
        console.log('hi');
      }
    });
    let origBox = box.clone({ insert: false });
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
    tool.onMouseUp = (event: paper.MouseEvent) => {
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
      // let h = PerspT(origPoints, transPoints);
      // mutable homography = h;
    };
    return new this.ps.Group({
      name: 'calibrationBox',
      tool: tool,
      originalBox: origBox,
      children: [box]
    });
  }

  generateCrosshair(mark: Mark): paper.Group {
    let vertical = new this.ps.Path.Line({
      from: [mark.location.x, 0],
      to: [mark.location.x, this.largeNumber],
      strokeColor: 'red'
    });
    let horizontal = new this.ps.Path.Line({
      from: [0, mark.location.y],
      to: [this.largeNumber, mark.location.y],
      strokeColor: 'red'
    });
    return new this.ps.Group({
      name: 'crosshair',
      children: [vertical, horizontal]
    });
  }

  generateBox(mark: Mark): paper.Group {
    let box = new this.ps.Path.Rectangle({
      point: [mark.location.x, mark.location.y],
      size: [mark.dimensions.width, mark.dimensions.height],
      fillColor: 'red'
    });
    return new this.ps.Group({
      name: 'box',
      children: [box]
    });
  }

  generateText(mark: Mark): paper.Group {
    let text = new this.ps.PointText({
      point: [mark.location.x, mark.location.y],
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

  render() {
    return html`
      <div class="container">
        <canvas id="canvas"></canvas>
      </div>
    `
  }

  static styles = css`
    .container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .container canvas {
      background-color: black;
      height: 100%;
      width: 100%;
    }

    .svg {
      max-width: 100%;
      max-height: 100%;
    }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'overlay-root': OverlayRoot
  }
}
