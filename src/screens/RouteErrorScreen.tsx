import { useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { AppShell, EmptyState } from '../components';
import { messageForTrader } from '../lib/errors';

/*
 * What a Trader sees when a route fails to load, in place of the router's
 * default screen and its "Show Error" button that dumps the raw exception.
 *
 * The raw error is never shown. The router's `defaultOnCatch` already sends
 * it to Sentry, so this screen reports nothing itself.
 *
 * Trying again invalidates the router, which re-runs the failed route's
 * loader and resets this boundary, so a transient failure recovers in place
 * without reloading the page.
 */
export function RouteErrorScreen({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <AppShell>
      <EmptyState
        className="min-h-full"
        title={messageForTrader(error)}
        hint="If it keeps happening, come back later."
        action={{ label: 'Try again', onClick: () => void router.invalidate() }}
      />
    </AppShell>
  );
}
