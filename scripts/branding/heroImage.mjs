// Converts a subject hero (1672x941 source art, empty left band) into the WebP sizes
// StudyCardIllustration loads. Usage: npm run hero:image -- <source.png> <name>
import sharp from 'sharp';

const [source, name] = process.argv.slice(2);
if (!source || !/^[a-z0-9-]+$/.test(name ?? '')) {
  console.error('Usage: npm run hero:image -- <source.png> <name, e.g. pharm-hero>');
  process.exit(1);
}

const { width, height } = await sharp(source).metadata();
// The card masks the left side, so drop the empty band instead of shipping it.
const left = Math.round(width * 0.287);
const crop = { left, top: 0, width: width - left, height };

for (const size of [600, 1192]) {
  const output = `public/assets/illustrations/${name}-${size}.webp`;
  const info = await sharp(source)
    .extract(crop)
    .resize({ width: size, withoutEnlargement: true })
    .webp({ quality: 74, effort: 6, smartSubsample: true })
    .toFile(output);
  console.log(`${output} ${info.width}x${info.height} ${(info.size / 1024).toFixed(1)} KB`);
}
