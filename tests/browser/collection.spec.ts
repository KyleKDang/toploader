import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signInAsNewTrader } from './session.ts';

/*
 * Building a Collection, end to end at 375px: a Trader finds a Card through
 * the picker, picks its Variant, Condition and quantity, adds the Copy, and
 * opens their Collection to find it there with its Market Price and the
 * total-value line. The Catalog is the made-up set supabase/seed.sql syncs
 * on the local stack.
 *
 * Wiring only. What a Collection holds, what it is worth, and that no other
 * Trader can read or write it are proven at seam 1
 * (tests/db/collection.test.ts).
 */

// Card images are hotlinked from TCGplayer's image host; faked here at the
// network edge, so the tracer never reaches the real one.
const CARD_IMAGE = readFileSync(
  new URL('./fixtures/card-image.svg', import.meta.url),
);

test('a Trader adds a Copy through the picker and sees it in their Collection', async ({
  page,
}) => {
  await page.route('https://tcgplayer-cdn.tcgplayer.com/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: CARD_IMAGE }),
  );
  await signInAsNewTrader(page, 'Orange County');
  await page.goto('/search');

  await page.getByRole('combobox', { name: 'Search the catalog' }).fill('exam');
  await page
    .getByRole('listbox', { name: 'Cards' })
    .getByRole('option', { name: /^Examplemon\b/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Examplemon', level: 2 }),
  ).toBeVisible();

  // Variant, then Condition, then how many.
  const variants = page.getByRole('radiogroup', { name: 'Variant' });
  await expect(
    variants.getByRole('radio', { name: 'Holofoil', exact: true }),
  ).toBeChecked();
  const conditions = page.getByRole('radiogroup', { name: 'Condition' });
  await conditions.getByText('LP', { exact: true }).click();
  await expect(conditions.getByRole('radio', { name: 'LP' })).toBeChecked();
  await expect(page.getByText('Lightly Played')).toBeVisible();

  const quantity = page.getByRole('group', { name: 'Quantity' });
  await quantity.getByRole('button', { name: 'Add one' }).click();
  await expect(quantity).toContainText('2');

  await page.getByRole('button', { name: 'Add to collection' }).click();

  // The Card page shows what the Trader now holds of this Card.
  const owned = page.getByRole('group', {
    name: 'Copies of Holofoil in Lightly Played',
  });
  await expect(owned).toContainText('2');

  await page.getByRole('button', { name: 'Collection', exact: true }).click();

  await expect(page).toHaveURL(/\/collection$/);
  await expect(
    page.getByRole('heading', { name: 'Collection', level: 1 }),
  ).toBeVisible();

  const total = page.getByRole('region', { name: 'Total value' });
  await expect(total).toContainText('at market price, updated daily');
  await expect(total).toContainText('$2,481.00');
  await expect(total).toContainText('2 copies');

  const copy = page.getByRole('button', { name: /Examplemon/ });
  await expect(copy).toContainText('Holofoil · LP · Example Base Set 004/102');
  await expect(copy).toContainText('2 copies at $1,240.50 each');
  await expect(copy).toContainText('$2,481.00');

  // The Collection is a screen of the Search tab, drilled into from it.
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await expect(tabs.getByRole('button', { name: 'Search' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/cards\/\d+$/);
});
