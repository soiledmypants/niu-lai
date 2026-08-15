// Generates placeholder sample layers so the studio is usable before the real art arrives.
// DELETE the sample PNGs and drop your real layers in when ready. Run with: npm run samples
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const S = 1024;
const LAYERS = path.join(__dirname, '..', 'layers');

const svg = (inner) =>
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '">' + inner + '</svg>');

async function write(dir, file, inner) {
  const d = path.join(LAYERS, dir);
  fs.mkdirSync(d, { recursive: true });
  await sharp(svg(inner)).png().toFile(path.join(d, file));
  console.log('wrote layers/' + dir + '/' + file);
}

const blob = (fill) =>
  '<ellipse cx="512" cy="640" rx="330" ry="310" fill="' + fill + '"/>' +
  '<ellipse cx="512" cy="560" rx="250" ry="200" fill="' + fill + '" opacity="0.9"/>';

async function main() {
  // 01-background — solid scenes (bottom layer)
  await write('01-background', 'onyx.png', '<rect width="100%" height="100%" fill="#101014"/>');
  await write('01-background', 'forest.png', '<rect width="100%" height="100%" fill="#0f2418"/>');
  await write('01-background', 'plum.png', '<rect width="100%" height="100%" fill="#211026"/>');
  await write('01-background', 'navy.png', '<rect width="100%" height="100%" fill="#101a2c"/>');

  // 02-color — the colored body base (weighted: lime common, orange rare)
  await write('02-color', 'lime#40.png', blob('#c6ff00'));
  await write('02-color', 'cyan#30.png', blob('#24e0ff'));
  await write('02-color', 'magenta#20.png', blob('#ff3df2'));
  await write('02-color', 'orange#10.png', blob('#ff9d1c'));

  // 03-body — face/features drawn on top of the color base
  const eyeL = 'cx="420" cy="580"', eyeR = 'cx="604" cy="580"';
  await write('03-body', 'happy.png',
    '<circle ' + eyeL + ' r="26" fill="#0a0a0c"/><circle ' + eyeR + ' r="26" fill="#0a0a0c"/>' +
    '<path d="M 430 700 Q 512 770 594 700" stroke="#0a0a0c" stroke-width="18" fill="none"/>');
  await write('03-body', 'dead.png',
    '<g stroke="#0a0a0c" stroke-width="16">' +
    '<line x1="396" y1="556" x2="444" y2="604"/><line x1="444" y1="556" x2="396" y2="604"/>' +
    '<line x1="580" y1="556" x2="628" y2="604"/><line x1="628" y1="556" x2="580" y2="604"/>' +
    '<line x1="440" y1="716" x2="584" y2="716"/></g>');
  await write('03-body', 'shades.png',
    '<rect x="370" y="550" width="284" height="56" fill="#0a0a0c"/>' +
    '<path d="M 440 700 Q 512 740 584 700" stroke="#0a0a0c" stroke-width="16" fill="none"/>');
  await write('03-body', 'screamer.png',
    '<circle ' + eyeL + ' r="16" fill="#0a0a0c"/><circle ' + eyeR + ' r="16" fill="#0a0a0c"/>' +
    '<ellipse cx="512" cy="716" rx="56" ry="72" fill="#0a0a0c"/>');

  console.log('sample layers ready — delete them when your real art lands');
}

main().catch((e) => { console.error(e); process.exit(1); });
