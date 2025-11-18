// This module is responsible for loading and serving frontend assets
// In production (Cloudflare Workers), files are bundled at build time
// In development, they are read from the filesystem

import htmlContent from './index.html';
import cssContent from './styles.css';
import jsContent from './app.js';

export function getHTML(): string {
  // Read the HTML template
  let html = htmlContent;

  // Replace stylesheet link with inline CSS
  html = html.replace(
    '<link rel="stylesheet" href="/styles.css">',
    `<style>${cssContent}</style>`
  );

  // Replace script tag with inline JS
  html = html.replace(
    '<script src="/app.js"></script>',
    `<script>${jsContent}</script>`
  );

  return html;
}

export function getCSS(): string {
  return cssContent;
}

export function getJS(): string {
  return jsContent;
}
