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
  cardQuery,
  citiesQuery,
  currentTraderId,
  hasProfile,
  safeSpotsQuery,
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

/**
 * The signed-in Trader who has finished onboarding, or a redirect to set up
 * the profile when they have not. Every screen inside the app loads this.
 */
async function loadOnboardedTrader(queryClient: QueryClient) {
  const { trader } = await loadSignedInTrader(queryClient);
  if (!hasProfile(trader)) throw redirect({ to: '/set-up-profile' });
  return trader;
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
  loader: async ({ context: { queryClient } }) => ({
    trader: await loadOnboardedTrader(queryClient),
  }),
  component: lazyRouteComponent(
    () => import('./screens/MatchesScreen'),
    'MatchesScreen',
  ),
});

const safeSpotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/safe-spots',
  loader: async ({ context: { queryClient } }) => {
    const trader = await loadOnboardedTrader(queryClient);
    return {
      trader,
      safeSpots: await queryClient.ensureQueryData(
        safeSpotsQuery(trader.city.id),
      ),
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/SafeSpotsScreen'),
    'SafeSpotsScreen',
  ),
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  loader: async ({ context: { queryClient } }) => ({
    trader: await loadOnboardedTrader(queryClient),
  }),
  component: lazyRouteComponent(
    () => import('./screens/SearchScreen'),
    'SearchScreen',
  ),
});

const cardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cards/$cardId',
  loader: async ({ context: { queryClient }, params }) => {
    await loadOnboardedTrader(queryClient);
    // An id that is not a whole number names no Card, the same as one that
    // is not in the Catalog, rather than a request that errors.
    const cardId = Number(params.cardId);
    return {
      card: Number.isSafeInteger(cardId)
        ? await queryClient.ensureQueryData(cardQuery(cardId))
        : null,
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/CardScreen'),
    'CardScreen',
  ),
});

const routeTree = rootRoute.addChildren([
  signUpRoute,
  setUpProfileRoute,
  matchesRoute,
  safeSpotsRoute,
  searchRoute,
  cardRoute,
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
