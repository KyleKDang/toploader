import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import {
  citiesQuery,
  currentTraderId,
  hasProfile,
  traderQuery,
} from './lib/queries';
import { RouteErrorScreen } from './screens/RouteErrorScreen';

/*
 * The routes, and the one rule that moves a Trader between them: signed out
 * goes to sign up, signed in without a profile goes to set up the profile,
 * and everyone else is inside the app. Each route checks its own side of
 * that rule before it loads, so no screen renders for someone it is not for.
 *
 * Each screen is its own chunk, fetched the first time its route is visited,
 * so a Trader downloads only the screens they reach. The rule itself stays
 * here and loads up front, since it decides which screen that is. So does
 * the error screen, which has to render even when a screen's chunk fails to
 * download.
 */

type RouterContext = { queryClient: QueryClient };

/** The signed-in Trader, or a redirect to sign up when nobody is. */
async function loadSignedInTrader(queryClient: QueryClient) {
  const traderId = await currentTraderId();
  if (!traderId) throw redirect({ to: '/sign-up' });
  const trader = await queryClient.ensureQueryData(traderQuery(traderId));
  return { traderId, trader };
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  beforeLoad: async () => {
    if (await currentTraderId()) throw redirect({ to: '/' });
  },
  component: lazyRouteComponent(
    () => import('./screens/SignUpScreen'),
    'SignUpScreen',
  ),
});

const setUpProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-up-profile',
  loader: async ({ context: { queryClient } }) => {
    const { traderId, trader } = await loadSignedInTrader(queryClient);
    if (hasProfile(trader)) throw redirect({ to: '/' });
    return { traderId, cities: await queryClient.ensureQueryData(citiesQuery) };
  },
  component: lazyRouteComponent(
    () => import('./screens/SetUpProfileScreen'),
    'SetUpProfileScreen',
  ),
});

const matchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async ({ context: { queryClient } }) => {
    const { trader } = await loadSignedInTrader(queryClient);
    if (!hasProfile(trader)) throw redirect({ to: '/set-up-profile' });
    return { trader };
  },
  component: lazyRouteComponent(
    () => import('./screens/MatchesScreen'),
    'MatchesScreen',
  ),
});

const routeTree = rootRoute.addChildren([
  signUpRoute,
  setUpProfileRoute,
  matchesRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // A loader or beforeLoad that throws is rendered as this screen by a
    // React error boundary, so React's root `onCaughtError` reports it to
    // Sentry. No `defaultOnCatch` as well: that fires from the same boundary,
    // and a second report path would count a thrown non-Error twice.
    defaultErrorComponent: RouteErrorScreen,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
