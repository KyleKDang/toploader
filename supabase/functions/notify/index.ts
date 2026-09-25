import * as Sentry from '@sentry/deno';
import { deliverNotifications } from '../_shared/notify.ts';

/*
 * The `notify` edge function: the database wakes it (wake_notifier, by
 * pg_net on every insert into the outbox and by pg_cron once a minute), and
 * it drains the outbox. The work is in ../_shared/notify.ts, which the
 * seam-2 suite runs in-process; this file is the Deno edge around it: the
 * secrets, the caller's proof it is the database, and Sentry.
 *
 * The gateway's own JWT check is off for this function (config.toml), since
 * its only caller is the database, which holds no JWT. The database proves
 * itself with NOTIFIER_SECRET instead, set both as a function secret and as
 * the Vault secret `notifier_secret` (docs/operations.md).
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

Deno.serve(async (request) => {
  if (
    request.headers.get('authorization') !==
    `Bearer ${required('NOTIFIER_SECRET')}`
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const report = await deliverNotifications({
      supabaseUrl: required('SUPABASE_URL'),
      supabaseSecretKey: required('SUPABASE_SERVICE_ROLE_KEY'),
      vapid: {
        subject: required('VAPID_SUBJECT'),
        publicKey: required('VAPID_PUBLIC_KEY'),
        privateKey: required('VAPID_PRIVATE_KEY'),
      },
      email: {
        resendApiKey: Deno.env.get('RESEND_API_KEY'),
        replyTo: required('NOTIFICATION_REPLY_TO'),
      },
      appUrl: required('APP_URL'),
    });
    // A row that could not be sent is an error to hear about, though the
    // run itself finished and the rest went out; the report says which.
    if (report.failures.length > 0) {
      Sentry.captureException(
        new Error(
          `${report.failures.length} notifications could not be sent:\n${report.failures.join('\n')}`,
        ),
      );
      await Sentry.flush(2000);
    }
    return Response.json(report);
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
