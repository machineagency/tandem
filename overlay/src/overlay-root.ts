import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import svgContent from '/latest-svg.svg';
import { response } from 'express';

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
  @property()
  currentStep: Step = {
    name: "empty",
    marks: []
  }

  ps = new paper.PaperScope();

  initCanvas(): void {
    
  }

  connectedCallback(): void {
    super.connectedCallback();
    setInterval(this.checkForUpdates.bind(this), 10000);
  }

  // checkForUpdates() {
  //   fetch('http://localhost:3000/overlay/latestSvg')
  //       .then((response) => response.text())
  //       .then((svgData) => {
  //           if (!svgContent.includes(svgData)) {
  //             console.log(svgData);
  //             location.reload();
  //           }
  //       })
  //       .catch((error) => {
  //           console.error('Error checking for updates:', error);
  //       });
  // }

  checkForUpdates() {
    fetch('http://localhost:3000/overlay/step')
      .then((response) => response.json())
      .then((json) => console.log(json))
      .catch((error) => console.error(error));
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
        break;
      case 'box':
        break;
      case 'circle':
        break;
      case 'text':
        break;
      case 'mutableBox':
        break;
    }
    return new paper.Group();
  }

  generateCrosshair(mark: Mark): paper.Group {
    return new this.ps.Group();
  }

  generateText(mark: Mark): paper.Group {
    return new this.ps.Group();
  }

  render() {
    return html`
      <div class="container">
        <div>${this.currentStep.name}</div>
        <canvas id="canvas"></canvas>
      </div>
    `
  }

  updated() {
    let canvas = this.shadowRoot?.getElementById('canvas') as HTMLCanvasElement;
    // Setup must be called before
    this.ps.setup(canvas);
    let stepOverlay = this.compileOverlay(this.currentStep);
    this.ps.project.activeLayer.addChild(stepOverlay);
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
