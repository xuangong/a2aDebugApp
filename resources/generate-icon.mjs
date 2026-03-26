import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, rmSync } from 'fs';
import { createCanvas, loadImage } from 'canvas';

const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateIcons() {
  // Load source image
  const sourceImage = await loadImage('resources/source-icon.png');

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // macOS icon padding (约 10% 边距，让图标和系统其他图标大小一致)
    const padding = size * 0.1;
    const iconSize = size - padding * 2;
    const radius = iconSize * 0.22;

    // 透明背景
    ctx.clearRect(0, 0, size, size);

    // 绘制圆角矩形背景
    const bgGrad = ctx.createLinearGradient(padding, padding, padding + iconSize, padding + iconSize);
    bgGrad.addColorStop(0, '#0ea5e9');
    bgGrad.addColorStop(1, '#06b6d4');

    ctx.beginPath();
    ctx.roundRect(padding, padding, iconSize, iconSize, radius);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Clip to rounded rectangle
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padding, padding, iconSize, iconSize, radius);
    ctx.clip();

    // Draw the source image, cropped to remove white borders
    const cropMargin = 180;
    const srcSize = 1024 - cropMargin * 2;

    ctx.drawImage(
      sourceImage,
      cropMargin, cropMargin,
      srcSize, srcSize,
      padding, padding,
      iconSize, iconSize
    );

    ctx.restore();

    // Save
    const { writeFileSync } = await import('fs');
    const buffer = canvas.toBuffer('image/png');
    writeFileSync(`resources/icon-${size}.png`, buffer);
    console.log(`Generated icon-${size}.png`);
  }

  // Copy 1024 as icon.png
  copyFileSync('resources/icon-1024.png', 'resources/icon.png');
  console.log('Generated icon.png');

  // Generate icns
  try {
    mkdirSync('resources/icon.iconset', { recursive: true });

    copyFileSync('resources/icon-16.png', 'resources/icon.iconset/icon_16x16.png');
    copyFileSync('resources/icon-32.png', 'resources/icon.iconset/icon_16x16@2x.png');
    copyFileSync('resources/icon-32.png', 'resources/icon.iconset/icon_32x32.png');
    copyFileSync('resources/icon-64.png', 'resources/icon.iconset/icon_32x32@2x.png');
    copyFileSync('resources/icon-128.png', 'resources/icon.iconset/icon_128x128.png');
    copyFileSync('resources/icon-256.png', 'resources/icon.iconset/icon_128x128@2x.png');
    copyFileSync('resources/icon-256.png', 'resources/icon.iconset/icon_256x256.png');
    copyFileSync('resources/icon-512.png', 'resources/icon.iconset/icon_256x256@2x.png');
    copyFileSync('resources/icon-512.png', 'resources/icon.iconset/icon_512x512.png');
    copyFileSync('resources/icon-1024.png', 'resources/icon.iconset/icon_512x512@2x.png');

    execSync('iconutil -c icns resources/icon.iconset -o resources/icon.icns');
    rmSync('resources/icon.iconset', { recursive: true });
    console.log('Generated icon.icns');
  } catch (e) {
    console.error('Failed to generate icns:', e.message);
  }

  // Generate ico for Windows
  try {
    const pngToIco = (await import('png-to-ico')).default;
    const { readFileSync, writeFileSync: writeFileSyncFs } = await import('fs');

    // Windows ICO needs multiple sizes: 16, 32, 48, 256
    const icoSizes = ['resources/icon-16.png', 'resources/icon-32.png', 'resources/icon-256.png'];
    const pngBuffers = icoSizes.map(p => readFileSync(p));

    const icoBuffer = await pngToIco(pngBuffers);
    writeFileSyncFs('resources/icon.ico', icoBuffer);
    console.log('Generated icon.ico');
  } catch (e) {
    console.error('Failed to generate ico:', e.message);
  }

  console.log('Done!');
}

generateIcons();
