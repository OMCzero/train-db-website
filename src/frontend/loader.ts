// Import frontend assets as text/strings
// Wrangler's default rules treat .html, .txt, .css as Text
// Renamed app.js to app.txt to prevent execution at build time

import htmlText from './index.html';
import cssText from './styles.css';
import jsText from './app.txt';

export function getHTML(): string {
  // Type assertion since wrangler's text imports come as any
  let html = htmlText as unknown as string;
  const css = cssText as unknown as string;
  const js = jsText as unknown as string;

  // Replace stylesheet link with inline CSS
  html = html.replace(
    '<link rel="stylesheet" href="/styles.css">',
    `<style>${css}</style>`
  );

  // Replace script tag with inline JS
  html = html.replace(
    '<script src="/app.js"></script>',
    `<script>${js}</script>`
  );

  return html;
}

export function getCSS(): string {
  return cssText as unknown as string;
}

export function getJS(): string {
  return jsText as unknown as string;
}
