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
