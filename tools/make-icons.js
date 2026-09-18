// Erzeugt die PNG-Icons aus icons/favicon.svg. Benötigt Playwright (Chromium).
// Aufruf: node tools/make-icons.js   (ggf. NODE_PATH auf globale node_modules setzen)
const { chromium } = require('playwright');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const svg = readFileSync(resolve(root, 'icons/favicon.svg'), 'utf8');

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
  // Maskable: Motiv in der sicheren Zone (innere 80 %), Rand in Hintergrundfarbe.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of targets) {
    const inner = Math.round(t.size * (1 - 2 * t.pad));
    const html = `<html><body style="margin:0;background:#1b5e20;width:${t.size}px;height:${t.size}px;display:grid;place-items:center">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`;
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: t.size, height: t.size } });
    writeFileSync(resolve(root, 'icons', t.file), png);
    console.log('wrote icons/' + t.file);
  }
  await browser.close();
})();
