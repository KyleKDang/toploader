import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  AppShell,
  Button,
  Checkbox,
  Disclaimer,
  FormError,
  Select,
  TextInput,
  TopBar,
} from '../components';
import { traderQuery } from '../lib/queries';
import { supabase } from '../lib/supabase';

/*
 * Setting up the profile: the display name other Traders see, the City the
 * Trader trades in, and the 18-or-over attestation.
 *
 * All three go through `set_trader_profile` in one call, the write path #41
 * established; clients never write the profile tables directly (ADR-0001).
 * The RPC refuses without the attestation, so the checkbox being required
 * here is a courtesy, not the rule.
 *
 * The attestation is a checkbox, not a date of birth, as settled on #36.
 */

const route = getRouteApi('/set-up-profile');

export function SetUpProfileScreen() {
  const { traderId, cities } = route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [cityId, setCityId] = useState('');
  const [attestsAdult, setAttestsAdult] = useState(false);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_trader_profile', {
        display_name: displayName.trim(),
        city_id: cityId,
        attests_adult: attestsAdult,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      // The cached profile predates this write, and Matches reads it.
      queryClient.removeQueries({ queryKey: traderQuery(traderId).queryKey });
      await navigate({ to: '/' });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    saveProfile.mutate();
  }

  return (
    <AppShell header={<TopBar title="Set up your profile" />}>
      <div className="flex min-h-full flex-col">
        <form className="flex grow flex-col gap-4 p-4" onSubmit={onSubmit}>
          <TextInput
            label="Display name"
            placeholder="How other Traders see you"
            autoComplete="nickname"
            maxLength={40}
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <Select
            label="City"
            required
            value={cityId}
            onChange={(event) => setCityId(event.target.value)}
          >
            <option value="" disabled>
              Choose your City
            </option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </Select>
          <p className="text-sm leading-prose text-muted">
            Your Matches and Listings stay inside your City.
          </p>

          <Checkbox
            label="I am 18 or over"
            required
            checked={attestsAdult}
            onChange={(event) => setAttestsAdult(event.target.checked)}
          />

          <FormError error={saveProfile.error} />
          <div className="flex">
            <Button
              type="submit"
              variant="primary"
              disabled={saveProfile.isPending}
            >
              Start trading
            </Button>
          </div>
        </form>

        <Disclaimer className="pb-4" />
      </div>
    </AppShell>
  );
}
