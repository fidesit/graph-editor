const sharp = require('sharp');
const path = require('path');

async function mergeScreenshots() {
  const cardScale = 0.5;
  const gap = 24;
  const outerPadding = 60;
  const titleHeight = 100;
  const labelHeight = 36;
  const borderWidth = 3;
  const cornerRadius = 10;
  const shadowOffset = 4;
  const shadowBlur = 6;

  const files = [
    { file: 'temp/theme-default.png', label: 'Default' },
    { file: 'temp/theme-compact.png', label: 'Compact' },
    { file: 'temp/theme-detailed.png', label: 'Detailed' },
    { file: 'temp/theme-dark.png', label: 'Dark' },
  ];

  // Get original dimensions
  const meta = await sharp(path.join(__dirname, files[0].file)).metadata();
  const cardWidth = Math.round(meta.width * cardScale);
  const cardHeight = Math.round(meta.height * cardScale);

  // Create bordered card with rounded corners
  async function createCard(filePath) {
    const resized = await sharp(filePath)
      .resize(cardWidth, cardHeight)
      .png()
      .toBuffer();

    const roundedMask = Buffer.from(
      `<svg width="${cardWidth}" height="${cardHeight}">
        <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
      </svg>`
    );

    const rounded = await sharp(resized)
      .composite([{ input: roundedMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const borderedWidth = cardWidth + borderWidth * 2;
    const borderedHeight = cardHeight + borderWidth * 2;

    const borderSvg = Buffer.from(
      `<svg width="${borderedWidth}" height="${borderedHeight}">
        <rect x="0" y="0" width="${borderedWidth}" height="${borderedHeight}"
          rx="${cornerRadius + borderWidth}" ry="${cornerRadius + borderWidth}" fill="white"/>
      </svg>`
    );

    return sharp(borderSvg)
      .composite([{ input: rounded, top: borderWidth, left: borderWidth }])
      .png()
      .toBuffer();
  }

  // Create all cards
  const cards = await Promise.all(
    files.map((f) => createCard(path.join(__dirname, f.file)))
  );

  const borderedWidth = cardWidth + borderWidth * 2;
  const borderedHeight = cardHeight + borderWidth * 2;

  // 2x2 grid dimensions
  const canvasWidth = outerPadding * 2 + borderedWidth * 2 + gap;
  const canvasHeight = outerPadding * 2 + titleHeight + (borderedHeight + labelHeight) * 2 + gap;

  // Grid positions: [row, col]
  const positions = [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
  ];

  const composites = [];

  // Shadows + cards
  for (let i = 0; i < cards.length; i++) {
    const [row, col] = positions[i];
    const x = outerPadding + col * (borderedWidth + gap);
    const y = outerPadding + titleHeight + row * (borderedHeight + labelHeight + gap);

    // Shadow
    const shadow = await sharp({
      create: {
        width: borderedWidth,
        height: borderedHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 50 },
      },
    })
      .composite([{ input: cards[i], blend: 'dest-in' }])
      .blur(shadowBlur)
      .png()
      .toBuffer();

    composites.push({
      input: shadow,
      top: y + shadowOffset,
      left: x + shadowOffset,
    });

    // Card
    composites.push({
      input: cards[i],
      top: y,
      left: x,
    });
  }

  // Labels under each card
  const labelsSvg = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}">
      ${files.map((f, i) => {
        const [row, col] = positions[i];
        const cx = outerPadding + col * (borderedWidth + gap) + borderedWidth / 2;
        const y = outerPadding + titleHeight + row * (borderedHeight + labelHeight + gap) + borderedHeight + 22;
        return `<text x="${cx}" y="${y}"
          font-family="'Segoe UI', Arial, sans-serif" font-size="15" font-weight="600"
          fill="#6B7280" text-anchor="middle">${f.label}</text>`;
      }).join('\n')}
    </svg>
  `);

  composites.push({ input: labelsSvg, top: 0, left: 0 });

  // Title
  const titleSvg = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}">
      <text x="${canvasWidth / 2}" y="${outerPadding + 36}"
        font-family="'Segoe UI', Arial, sans-serif" font-size="32" font-weight="700"
        fill="#111827" text-anchor="middle">
        @utisha/graph-editor
      </text>
      <text x="${canvasWidth / 2}" y="${outerPadding + 64}"
        font-family="'Segoe UI', Arial, sans-serif" font-size="16"
        fill="#6B7280" text-anchor="middle">
        Configuration-driven visual graph editor for Angular 19+ — 4 Theme Presets
      </text>
    </svg>
  `);

  composites.unshift({ input: titleSvg, top: 0, left: 0 });

  // Create final image
  const result = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 249, g: 250, b: 251, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(__dirname, 'temp', 'marketing-themes.png'));

  console.log(`Marketing image created: temp/marketing-themes.png (${result.width}x${result.height})`);
}

mergeScreenshots().catch(console.error);
