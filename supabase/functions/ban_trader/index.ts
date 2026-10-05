import * as Sentry from '@sentry/deno';
import { banTrader } from '../_shared/ban-trader.ts';

/*
 * The `ban_trader` edge function: a Founder bans a Trader from the reports
 * screen. The work is in ../_shared/ban-trader.ts, which the seam-2 suite
 * runs in-process; this file is the Deno edge around it: the secrets, the
 * browser's cross-origin rules, and Sentry.
 *
 * The gateway's own JWT check is off for this function (config.toml). The
 * function asks Auth about the session itself, which also answers whether
 * the account still exists, and the gateway's check would only be a second
 * place for the same question to be answered differently.
 *
 * Deno checks this file (`npm run typecheck`); tsc and ESLint leave it to
 * Deno, since `Deno` is not a name they know.
 */

Sentry.init({
  dsn: Deno.env.get('SENTRY_DSN'),
  // The runtime is reused between requests; the default integrations would
  // carry one request's breadcrumbs into the next.
  defaultIntegrations: false,
});

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/*
 * The app calls this from a browser, on another origin than the function's,
 * so the browser asks first (the OPTIONS preflight) and reads the answer
 * only if these headers allow it. Any origin may ask: what authorizes a
 * call is the session it carries, which a page on another origin does not
 * have, and no cookie is involved for one to borrow.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function respond(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  try {
    const bearer = request.headers.get('authorization') ?? '';
    // A body that is not JSON names nobody, as a malformed id does.
    const body: unknown = await request.json().catch(() => null);
    const result = await banTrader({
      supabaseUrl: required('SUPABASE_URL'),
      supabaseSecretKey: required('SUPABASE_SERVICE_ROLE_KEY'),
      accessToken: bearer.startsWith('Bearer ')
        ? bearer.slice('Bearer '.length)
        : null,
      traderId: (body as { trader_id?: unknown } | null)?.trader_id,
    });
    if (result === 'signed_out') {
      return respond({ error: 'Unauthorized' }, 401);
    }
    if (result === 'forbidden') {
      return respond({ error: 'Only a founder can ban a trader' }, 403);
    }
    if (result === 'refused') {
      return respond({ error: 'This trader cannot be banned' }, 422);
    }
    return respond({ banned: true }, 200);
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    // What failed is for Sentry. The Founder is told only that it did.
    return respond({ error: 'The trader could not be banned' }, 500);
  }
});
