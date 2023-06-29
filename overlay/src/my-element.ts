import { LitElement, css, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import svgContent from '/latest-svg.svg';

@customElement('my-element')
export class MyElement extends LitElement {

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
