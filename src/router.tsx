import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import {
  citiesQuery,
  currentTraderId,
  hasProfile,
  traderQuery,
} from './lib/queries';
import { MatchesScreen } from './screens/MatchesScreen';
import { SetUpProfileScreen } from './screens/SetUpProfileScreen';
import { SignUpScreen } from './screens/SignUpScreen';

/*
 * The routes, and the one rule that moves a Trader between them: signed out
 * goes to sign up, signed in without a profile goes to set up the profile,
 * and everyone else is inside the app. Each route checks its own side of
 * that rule before it loads, so no screen renders for someone it is not for.
 */

type RouterContext = { queryClient: QueryClient };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  beforeLoad: async () => {
    if (await currentTraderId()) throw redirect({ to: '/' });
  },
  component: SignUpScreen,
});

export const setUpProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-up-profile',
  loader: async ({ context: { queryClient } }) => {
    const traderId = await currentTraderId();
    if (!traderId) throw redirect({ to: '/sign-up' });
    const trader = await queryClient.ensureQueryData(traderQuery(traderId));
    if (hasProfile(trader)) throw redirect({ to: '/' });
    return { traderId, cities: await queryClient.ensureQueryData(citiesQuery) };
  },
  component: SetUpProfileScreen,
});

export const matchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async ({ context: { queryClient } }) => {
    const traderId = await currentTraderId();
    if (!traderId) throw redirect({ to: '/sign-up' });
    const trader = await queryClient.ensureQueryData(traderQuery(traderId));
    if (!hasProfile(trader)) throw redirect({ to: '/set-up-profile' });
    return { trader };
  },
  component: MatchesScreen,
});

const routeTree = rootRoute.addChildren([
  signUpRoute,
  setUpProfileRoute,
  matchesRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
