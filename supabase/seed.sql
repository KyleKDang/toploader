-- Local and CI data only: `supabase start` and `supabase db reset` load this
-- after the migrations, and `supabase db push` never does, so nothing here
-- reaches production. Reference data production needs goes in a migration.
--
-- Every Safe Spot here is made up. The real Orange County ones are seeded by
-- migration in #30.

-- A second City, so a test can place a Trader outside the launch City.
insert into public.cities (name) values ('Test City');

insert into public.safe_spots (city_id, name, address, kind, notes)
select cities.id, spot.name, spot.address, spot.kind::public.safe_spot_kind, spot.notes
from (
  values
    (
      'Orange County',
      'Example Police Station',
      '100 Example Way, Irvine, CA 92618',
      'police_station',
      'Exchange zone is the two marked spaces by the front entrance.'
    ),
    (
      'Orange County',
      'Example Mall, north entrance',
      '200 Sample Blvd, Costa Mesa, CA 92626',
      'monitored_site',
      null
    ),
    (
      'Test City',
      'Test City Police Station',
      '1 Test Street, Test City',
      'police_station',
      null
    )
) as spot (city, name, address, kind, notes)
join public.cities on cities.name = spot.city;

-- A made-up Catalog set, written through the sync's own function so local
-- data takes the same path production data does. Its images point at
-- TCGplayer's image host, which a browser tracer fakes at the network edge.
select public.apply_catalog_set(
  card_set => '{"groupId": 990900, "name": "Example Base Set",
    "abbreviation": "EX", "releasedOn": "2026-03-01"}',
  cards => '[
    {"productId": 990900001, "name": "Examplemon", "number": "004/102",
     "rarity": "Holo Rare",
     "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/990900001_200w.jpg"},
    {"productId": 990900002, "name": "Examplemon ex", "number": "150/102",
     "rarity": "Ultra Rare",
     "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/990900002_200w.jpg"},
    {"productId": 990900003, "name": "Dark Examplemon", "number": "031/102",
     "rarity": "Rare", "imageUrl": null}
  ]',
  prices => '[
    {"productId": 990900001, "variant": "Holofoil", "marketPrice": 1240.5},
    {"productId": 990900001, "variant": "Reverse Holofoil", "marketPrice": 4.56},
    {"productId": 990900002, "variant": "Normal", "marketPrice": 12}
  ]',
  sync_day => '2026-09-19'
);
