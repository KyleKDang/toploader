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
  blockedTradersQuery,
  cardQuery,
  citiesQuery,
  cityListingsForCardQuery,
  collectionQuery,
  collectionValueQuery,
  currentTraderId,
  hasProfile,
  isFounder,
  listingQuery,
  matchesQuery,
  pendingVerificationRequestsQuery,
  reportsQuery,
  safeSpotsQuery,
  tradeListingsQuery,
  tradeQuery,
  traderQuery,
  tradesQuery,
  verificationRequestsQuery,
  wantsQuery,
} from './lib/queries';
import { otherTraderOf } from './lib/trades';
import { installOffer, installStepDue } from './lib/install';
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
 * The id comes back with the profile, because a screen reading rows of the
 * Trader's own - their Collection - keys them in the cache by it, and a
 * screen that writes needs it: a Listing's photos are stored under it.
 */
async function loadOnboardedTrader(queryClient: QueryClient) {
  const { traderId, trader } = await loadSignedInTrader(queryClient);
  if (!hasProfile(trader)) throw redirect({ to: '/set-up-profile' });
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

const installRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/install',
  loader: async ({ context: { queryClient } }) => {
    await loadOnboardedTrader(queryClient);
    if (installOffer() === null) throw redirect({ to: '/' });
  },
  component: lazyRouteComponent(
    () => import('./screens/InstallScreen'),
    'InstallScreen',
  ),
});

const matchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // The Matches are loaded before the screen renders, so a Trader who has
  // some never sees the empty state flash up first. The screen still reads
  // them through the query, which refetches on each visit: a new Match can
  // appear any time another Trader lists or wants something.
  loader: async ({ context: { queryClient } }) => {
    const { traderId, trader } = await loadOnboardedTrader(queryClient);
    // Onboarding's last step comes before its landing view, once per
    // browser. Only here, not on every screen: a notification's tap opens the
    // screen it names, never a detour.
    if (installStepDue()) throw redirect({ to: '/install' });
    await queryClient.ensureInfiniteQueryData(matchesQuery(traderId));
    return { traderId, trader };
  },
  component: lazyRouteComponent(
    () => import('./screens/MatchesScreen'),
    'MatchesScreen',
  ),
});

const safeSpotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/safe-spots',
  loader: async ({ context: { queryClient } }) => {
    const { trader } = await loadOnboardedTrader(queryClient);
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
  loader: async ({ context: { queryClient } }) =>
    await loadOnboardedTrader(queryClient),
  component: lazyRouteComponent(
    () => import('./screens/SearchScreen'),
    'SearchScreen',
  ),
});

const wantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wants',
  // `?card=` is the Card the screen is narrowing into a Want, so that the
  // card page's way in and a pick from the search field arrive the same way.
  // Anything that is not a Card's id names no Card, the same as an empty
  // search, rather than a request that errors.
  validateSearch: (search: Record<string, unknown>): { card?: number } => {
    const card = Number(search.card);
    return Number.isSafeInteger(card) && card > 0 ? { card } : {};
  },
  loaderDeps: ({ search: { card } }) => ({ card }),
  loader: async ({ context: { queryClient }, deps }) => {
    const { traderId, trader } = await loadOnboardedTrader(queryClient);
    return {
      traderId,
      trader,
      card:
        deps.card === undefined
          ? null
          : await queryClient.ensureQueryData(cardQuery(deps.card)),
      wants: await queryClient.ensureQueryData(wantsQuery(traderId)),
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/WantsScreen'),
    'WantsScreen',
  ),
});

const cardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cards/$cardId',
  loader: async ({ context: { queryClient }, params }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    const cardId = catalogId(params.cardId);
    if (cardId === null) return { traderId, card: null };
    // The Listings' first page comes with the Card because the page shows
    // them together; RLS is what keeps them to the Trader's own City.
    const [card] = await Promise.all([
      queryClient.ensureQueryData(cardQuery(cardId)),
      queryClient.ensureInfiniteQueryData(cityListingsForCardQuery(cardId)),
    ]);
    return { traderId, card };
  },
  component: lazyRouteComponent(
    () => import('./screens/CardScreen'),
    'CardScreen',
  ),
});

// The Collection sits in the Search tab: the Catalog search is how Copies
// get into it, and the Trader profile that will also link to it (#27) has no
// screen yet.
const collectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/collection',
  loader: async ({ context: { queryClient } }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    const [entries, value] = await Promise.all([
      queryClient.ensureQueryData(collectionQuery(traderId)),
      queryClient.ensureQueryData(collectionValueQuery(traderId)),
    ]);
    return { entries, value };
  },
  component: lazyRouteComponent(
    () => import('./screens/CollectionScreen'),
    'CollectionScreen',
  ),
});

const newListingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cards/$cardId/list',
  loader: async ({ context: { queryClient }, params }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    const cardId = catalogId(params.cardId);
    return {
      traderId,
      card:
        cardId === null
          ? null
          : await queryClient.ensureQueryData(cardQuery(cardId)),
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/NewListingScreen'),
    'NewListingScreen',
  ),
});

const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/listings/$listingId',
  // `?with=` is the other Trader of the Match the Listing was opened from.
  // A Trader's own Listing says nothing about who to trade it with, so this
  // is what lets its page propose a Trade to the Trader who wants it.
  validateSearch: (search: Record<string, unknown>): { with?: string } =>
    isUuid(search.with) ? { with: search.with } : {},
  loader: async ({ context: { queryClient }, params }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    return {
      traderId,
      listing: await queryClient.ensureQueryData(
        listingQuery(params.listingId),
      ),
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/ListingScreen'),
    'ListingScreen',
  ),
});

const tradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trades',
  // Loaded before the screen renders for the reason the Matches are.
  loader: async ({ context: { queryClient } }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    await queryClient.ensureQueryData(tradesQuery(traderId));
    return { traderId };
  },
  component: lazyRouteComponent(
    () => import('./screens/TradesScreen'),
    'TradesScreen',
  ),
});

const proposeTradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trades/new',
  // `?with=` is the Trader to propose to and `?listing=` the Listing the
  // Match was about, which starts on the table. Anything that is not an id
  // names nobody, and the screen says there is no one to propose to.
  validateSearch: (
    search: Record<string, unknown>,
  ): { with?: string; listing?: string } => ({
    ...(isUuid(search.with) ? { with: search.with } : {}),
    ...(isUuid(search.listing) ? { listing: search.listing } : {}),
  }),
  loaderDeps: ({ search }) => ({ with: search.with, listing: search.listing }),
  loader: async ({ context: { queryClient }, deps }) => {
    const { traderId, trader } = await loadOnboardedTrader(queryClient);
    const otherId = deps.with === traderId ? undefined : deps.with;
    if (!otherId)
      return { traderId, trader, other: null, listings: [], listingId: null };
    const [other, listings] = await Promise.all([
      // An id that is not a Trader's names nobody, the same as no id at all.
      // traderQuery reads with `.single()`, which says so as PGRST116.
      queryClient
        .ensureQueryData(traderQuery(otherId))
        .catch((error: unknown) => {
          if ((error as { code?: unknown }).code === 'PGRST116') return null;
          throw error;
        }),
      queryClient.ensureQueryData(tradeListingsQuery(traderId, otherId)),
    ]);
    return {
      traderId,
      trader,
      other: other && { id: otherId, ...other },
      listings,
      listingId: deps.listing ?? null,
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/ProposeTradeScreen'),
    'ProposeTradeScreen',
  ),
});

const tradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trades/$tradeId',
  loader: async ({ context: { queryClient }, params }) => {
    const { traderId, trader } = await loadOnboardedTrader(queryClient);
    // Not an id is not a Trade, the same as one the Trader is not party to,
    // rather than a request that errors; the screen reads null as that.
    const tradeId = isUuid(params.tradeId) ? params.tradeId : null;
    if (tradeId) await queryClient.ensureQueryData(tradeQuery(tradeId));
    return { traderId, trader, tradeId };
  },
  component: lazyRouteComponent(
    () => import('./screens/TradeScreen'),
    'TradeScreen',
  ),
});

const counterTradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trades/$tradeId/counter',
  // Fetched, not read from the cache: the picker is filled in from the
  // current terms, and the other Trader may have answered, or taken a
  // Listing down, since the Trade page cached them.
  loader: async ({ context: { queryClient }, params }) => {
    const { traderId, trader } = await loadOnboardedTrader(queryClient);
    const trade = isUuid(params.tradeId)
      ? await queryClient.fetchQuery(tradeQuery(params.tradeId))
      : null;
    if (!trade) return { traderId, trader, trade: null, listings: [] };
    return {
      traderId,
      trader,
      trade,
      listings: await queryClient.fetchQuery(
        tradeListingsQuery(traderId, otherTraderOf(trade, traderId).id),
      ),
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/ProposeTradeScreen'),
    'CounterTradeScreen',
  ),
});

// Verification sits in the Profile section: being verified is a fact about
// the Trader, and the profile screen that will link here (#27) has none yet.
const verificationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verification',
  // Fetched, not read from the cache. A Trader arrives here from the
  // notification that says a Founder has answered, in an app that may have
  // been open since before they asked, and the profile the rest of the app
  // holds is refreshed with it: the propose screen reads `verified_at` from
  // the same cache entry.
  loader: async ({ context: { queryClient } }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    const [trader, requests] = await Promise.all([
      queryClient.fetchQuery(traderQuery(traderId)),
      queryClient.fetchQuery(verificationRequestsQuery(traderId)),
    ]);
    return { traderId, trader, requests };
  },
  component: lazyRouteComponent(
    () => import('./screens/VerificationScreen'),
    'VerificationScreen',
  ),
});

// Settings is the Profile tab's screen until the profile has one of its own
// (#27).
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  loader: async ({ context: { queryClient } }) => {
    const { traderId } = await loadOnboardedTrader(queryClient);
    await queryClient.ensureQueryData(blockedTradersQuery(traderId));
    return { traderId };
  },
  component: lazyRouteComponent(
    () => import('./screens/SettingsScreen'),
    'SettingsScreen',
  ),
});

/**
 * The signed-in Founder, or a redirect to the app's landing view for a
 * Trader who is not one. It is a courtesy: what keeps a Trader from the
 * requests and the documents is RLS, which would hand this screen nothing.
 */
async function loadFounder(queryClient: QueryClient) {
  const { traderId } = await loadOnboardedTrader(queryClient);
  if (!(await isFounder())) throw redirect({ to: '/' });
  return { founderId: traderId };
}

const reviewQueueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/verification',
  loader: async ({ context: { queryClient } }) => {
    const { founderId } = await loadFounder(queryClient);
    await queryClient.fetchQuery(pendingVerificationRequestsQuery(founderId));
    return { founderId };
  },
  component: lazyRouteComponent(
    () => import('./screens/ReviewQueueScreen'),
    'ReviewQueueScreen',
  ),
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/verification/$requestId',
  loader: async ({ context: { queryClient }, params }) => {
    const { founderId } = await loadFounder(queryClient);
    const requests = await queryClient.fetchQuery(
      pendingVerificationRequestsQuery(founderId),
    );
    // Not in the queue is not there to review: reviewed already, the
    // Founder's own, or never a request at all.
    return {
      request:
        requests.find((request) => request.id === params.requestId) ?? null,
    };
  },
  component: lazyRouteComponent(
    () => import('./screens/ReviewScreen'),
    'ReviewScreen',
  ),
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/reports',
  loader: async ({ context: { queryClient } }) => {
    const { founderId } = await loadFounder(queryClient);
    await queryClient.fetchQuery(reportsQuery(founderId));
    return { founderId };
  },
  component: lazyRouteComponent(
    () => import('./screens/ReportsScreen'),
    'ReportsScreen',
  ),
});

/** Whether a value from the URL is a uuid, the form every row id takes. */
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/**
 * A Catalog id from the URL, or null where it is not one. An id that is not
 * a whole number names no Card, the same as one that is not in the Catalog,
 * rather than a request that errors.
 */
function catalogId(param: string): number | null {
  const id = Number(param);
  return Number.isSafeInteger(id) ? id : null;
}

const routeTree = rootRoute.addChildren([
  signUpRoute,
  setUpProfileRoute,
  installRoute,
  matchesRoute,
  safeSpotsRoute,
  searchRoute,
  wantsRoute,
  cardRoute,
  collectionRoute,
  newListingRoute,
  listingRoute,
  tradesRoute,
  proposeTradeRoute,
  tradeRoute,
  counterTradeRoute,
  verificationRoute,
  settingsRoute,
  reviewQueueRoute,
  reviewRoute,
  reportsRoute,
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
