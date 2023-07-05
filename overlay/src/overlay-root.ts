import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'

import * as paper from 'paper'

interface Step {
  name: string;
  marks: Mark[];
}

interface Mark {
  type: MarkType;
  location: { x: number, y: number };
  text: string;
  innerPath: paper.Path;
}

type MarkType = 'arrow' | 'crosshair' | 'box' | 'circle' | 'text' | 'mutableBox'

@customElement('overlay-root')
export class OverlayRoot extends LitElement {
  ps = new paper.PaperScope();

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
      .catch((error) => console.error(error));
  }

  updateCanvas(step: Step) {
    this.ps.project.activeLayer.removeChildren();
    this.compileOverlay(step);
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
        break;
      case 'circle':
        break;
      case 'text':
        return this.generateText(mark);
      case 'mutableBox':
        break;
    }
    return new paper.Group();
  }

  generateCrosshair(mark: Mark): paper.Group {
    let vertical = new this.ps.Path.Line({
      from: [mark.location.x, mark.location.y],
      to: [1000, 1000],
      strokeColor: 'red'
    });
    return new this.ps.Group({
      name: 'crosshair',
      children: [vertical]
    });
  }

  generateText(mark: Mark): paper.Group {
    let text = new this.ps.PointText({
      point: [mark.location.x, mark.location.y],
      content: 'The contents of the point text',
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
