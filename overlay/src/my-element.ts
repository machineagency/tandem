import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'

import svgContent from '/latest-svg.svg';

@customElement('my-element')
export class MyElement extends LitElement {

  connectedCallback(): void {
    super.connectedCallback();
    setInterval(this.checkForUpdates.bind(this), 10000);
  }

  checkForUpdates() {
    fetch('http://localhost:3000/overlay/latestSvg')
        .then((response) => response.text())
        .then((svgData) => {
            if (!svgContent.includes(svgData)) {
              console.log(svgData);
              location.reload();
            }
        })
        .catch((error) => {
            console.error('Error checking for updates:', error);
        });
  }


  render() {
    return html`
      <div class="container">
        <img src=${svgContent} class="svg"/>
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
    .svg {
      max-width: 100%;
      max-height: 100%;
    }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'my-element': MyElement
  }
}
