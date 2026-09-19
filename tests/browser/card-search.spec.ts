import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signInAsNewTrader } from './session.ts';

/*
 * Card search and the card page, end to end at 375px: a Trader goes to
 * Search, finds a Card by part of its name, opens it, and reads its Market
 * Price for each Variant. The Catalog is the made-up set supabase/seed.sql
 * syncs on the local stack.
 *
 * Wiring only. Searching all 20k Cards, the ranking, and that no client can
 * write the Catalog are proven at seam 1 (tests/db/card-search.test.ts and
 * tests/db/catalog.test.ts).
 */

// Card images are hotlinked from TCGplayer's image host; faked here at the
// network edge, so the tracer never reaches the real one.
const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

test('a Trader searches the Catalog and opens a card page with its Market Price', async ({
  page,
}) => {
  await page.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: CARD_IMAGE }),
  );
  await signInAsNewTrader(page, 'Orange County');
  await page.goto('/');

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: 'Search' })
    .click();
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Search the catalog' }).fill('exam');
  const results = page.getByRole('listbox', { name: 'Cards' });
  await expect(results.getByRole('option')).toHaveCount(3);
  const examplemon = results.getByRole('option', { name: /^Examplemon\b/ });
  await expect(examplemon.first()).toContainText('$1,240.50');
  await expect(examplemon.first()).toContainText(
    'Example Base Set 004/102 · Holofoil',
  );
  await examplemon.first().click();

  await expect(page).toHaveURL(/\/cards\/\d+$/);
  await expect(
    page.getByRole('heading', { name: 'Examplemon', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByText('Example Base Set · 004/102 · Holo Rare'),
  ).toBeVisible();
  const image = page.getByRole('img', { name: 'Examplemon' });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('complete', true);

  const variants = page.getByRole('radiogroup', { name: 'Variant' });
  await expect(
    variants.getByRole('radio', { name: 'Holofoil', exact: true }),
  ).toBeChecked();
  const price = page.getByRole('region', { name: 'Market Price' });
  await expect(price).toContainText('updated daily');
  await expect(price).toContainText('$1,240.50');
  await expect(price).toContainText('Holofoil · as of Sep 19, 2026');

  await variants.getByText('Reverse Holofoil').click();
  await expect(
    variants.getByRole('radio', { name: 'Reverse Holofoil' }),
  ).toBeChecked();
  await expect(price).toContainText('$4.56');

  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await expect(tabs.getByRole('button', { name: 'Search' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
