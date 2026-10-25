const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('playwright');

async function build() {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public/sky.png'));
  if (source.readUInt32BE(16) !== 1254 || source.readUInt32BE(20) !== 1254) {
    throw new Error('Update the icon crop for the new source dimensions first.');
  }
  // Crop the photographed tile's exterior and clip its corners as SVG geometry.
  // The embedded artwork and original PNG remain unchanged.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="74 70 1106 1106">
  <title>sky — rounded galaxy icon</title>
  <desc>Original artwork cropped to its tile at 90% size, with transparent rounded corners and 5% padding. Raster-backed SVG.</desc>
  <defs><clipPath id="tile"><rect x="74" y="70" width="1106" height="1106" rx="420"/></clipPath></defs>
  <g transform="translate(62.7 62.3) scale(.9)">
    <image x="0" y="0" width="1254" height="1254" clip-path="url(#tile)" href="data:image/png;base64,${source.toString('base64')}"/>
  </g>
</svg>
`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  let png;
  try {
    const page = await browser.newPage();
    const data = await page.evaluate(async encoded => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + encoded;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
      return canvas.toDataURL('image/png').split(',')[1];
    }, Buffer.from(svg).toString('base64'));
    png = Buffer.from(data, 'base64');
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(root, 'public/sky.svg'), svg);
  fs.writeFileSync(path.join(root, 'public/sky-icon.png'), png);
  const version = crypto.createHash('sha256').update(png).digest('hex').slice(0, 12);
  for (const file of ['src/components/Avatar.tsx', 'index.html']) {
    const target = path.join(root, file);
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/\/sky(?:-icon)?\.png\?v=[a-f0-9]+/g, `/sky-icon.png?v=${version}`));
  }
  console.log(`Built transparent sky icon (512px), version ${version}`);
}

build().catch(error => {console.error(error); process.exitCode = 1;});
