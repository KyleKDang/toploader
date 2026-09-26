/*
 * Renders the app icon in every size the PWA manifest and iOS ask for, into
 * public/icons/. Run it after changing the drawing below:
 *
 *   npm run icons:render
 *
 * The icon is a toploader - the rigid sleeve a collector slides a card into,
 * notch at the top - with a card inside, drawn in the accent on its own. No
 * Pokemon name, logo, or trade dress (docs/design-system.md).
 *
 * The PNGs are committed rather than built, because they change only when
 * this drawing does. Chrome renders them, since it is already here for the
 * browser tracers.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// --color-accent and --color-accent-ink, light (src/styles/theme.css).
const ACCENT = '#1b7a4a';
const ON_ACCENT = '#ffffff';

/*
 * On a 512 grid. Everything drawn sits inside the circle of radius 205 at
 * the center, the safe zone a maskable icon keeps whatever shape a launcher
 * crops it to, so one drawing serves both the maskable and the plain icon.
 */
const GLYPH = `
  <path d="M176 116H226A30 30 0 0 0 286 116H336Q356 116 356 136V376Q356 396 336 396H176Q156 396 156 376V136Q156 116 176 116Z"
    fill="none" stroke="${ON_ACCENT}" stroke-width="20" stroke-linejoin="round"/>
  <rect x="190" y="168" width="132" height="196" rx="10" fill="${ON_ACCENT}"/>`;

/** The icon on a rounded tile, or full bleed for a launcher to crop. */
function svg(fullBleed: boolean) {
  const radius = fullBleed ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${ACCENT}"/>${GLYPH}</svg>\n`;
}

const outDir = new URL('../../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('icon.svg', outDir), svg(false));

const pngs = [
  { file: 'icon-192.png', size: 192, fullBleed: false },
  { file: 'icon-512.png', size: 512, fullBleed: false },
  { file: 'icon-maskable-512.png', size: 512, fullBleed: true },
  // iOS rounds the corners itself and fills any transparency with black.
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, fullBleed } of pngs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(fullBleed)}`,
    );
    await page.screenshot({
      path: new URL(file, outDir).pathname,
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}
