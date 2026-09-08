import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const svg = await readFile(new URL('../assets/icon.svg', import.meta.url));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
await mkdir(new URL('../build/', import.meta.url), { recursive: true });
await writeFile(new URL('../build/icon.ico', import.meta.url), await pngToIco(pngs));

const iosIconDirectory = new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/', import.meta.url);
const iosSplashDirectory = new URL('../ios/App/App/Assets.xcassets/Splash.imageset/', import.meta.url);
await mkdir(iosIconDirectory, { recursive: true });
await mkdir(iosSplashDirectory, { recursive: true });

const iosIcon = await sharp(svg).resize(1024, 1024).flatten({ background: '#071424' }).png().toBuffer();
await writeFile(new URL('AppIcon-512@2x.png', iosIconDirectory), iosIcon);

const splashMark = await sharp(svg).resize(620, 620).png().toBuffer();
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#08111f' } })
  .composite([{ input: splashMark, gravity: 'center' }])
  .png()
  .toBuffer();
await Promise.all([
  writeFile(new URL('splash-2732x2732.png', iosSplashDirectory), splash),
  writeFile(new URL('splash-2732x2732-1.png', iosSplashDirectory), splash),
  writeFile(new URL('splash-2732x2732-2.png', iosSplashDirectory), splash)
]);

console.log('Created desktop and iOS icons');
