import { useRouter } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { AppShell, EmptyState } from '../components';
import { messageForTrader } from '../lib/errors';

/*
 * What a Trader sees when a route fails to load, in place of the router's
 * default screen and its "Show Error" button that dumps the raw exception.
 *
 * The raw error is never shown. React's root `onCaughtError` already sends
 * it to Sentry (src/lib/sentry.ts), so this screen reports nothing itself.
 *
 * Offline, it says so rather than something going wrong: the offline shell
 * (src/sw.ts) opens the app with no network, and every route needs data.
 *
 * Trying again invalidates the router, which re-runs the failed route's
 * loader and resets this boundary, so a transient failure recovers in place
 * without reloading the page.
 */
export function RouteErrorScreen({ error }: ErrorComponentProps) {
  const router = useRouter();
  const offline = !navigator.onLine;

  return (
    <AppShell>
      <EmptyState
        className="min-h-full"
        title={offline ? "You're offline." : messageForTrader(error)}
        hint={
          offline
            ? 'Connect to the internet, then try again.'
            : 'If it keeps happening, come back later.'
        }
        action={{ label: 'Try again', onClick: () => void router.invalidate() }}
      />
    </AppShell>
  );
}
