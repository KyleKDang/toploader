import { createClient } from '@supabase/supabase-js';
import { encryptNotification } from '@block65/webcrypto-web-push';
import { vapidAuthorization, type VapidKeys } from './vapid.ts';

/*
 * The notifier: drains the outbox (public.notifications), sending each row
 * on the channels its kind asks for. It is the body of the `notify` edge
 * function, and it runs in Node too, which is how the seam-2 suite proves
 * it against the local stack with the push service and Resend faked at the
 * network edge. So: fetch, Web Crypto, supabase-js, and nothing that is
 * only in one runtime.
 *
 * It knows nothing about Matches or Trades. A row arrives rendered - title,
 * body, the app path a tap opens - and this carries it to every browser the
 * Trader has subscribed in, and to their inbox through Resend where the
 * notification matrix says so (ADR-0006).
 *
 * A run takes rows through claim_notifications, which marks them claimed in
 * the same statement, so two runs at once - a wake from the database and
 * the minute's sweep - never hold the same row. Each channel is marked as
 * it succeeds, so a run that pushed and then could not email retries only
 * the email. A row is released to a later run by its claim lapsing, and
 * given up after five.
 */

export interface NotifierOptions {
  supabaseUrl: string;
  /** The server-side key: the notifier runs as service_role. */
  supabaseSecretKey: string;
  vapid: VapidKeys;
  email: EmailOptions;
  /** The app's origin, for the links in an email. */
  appUrl: string;
  /** Rows per claim. */
  batch?: number;
}

export interface EmailOptions {
  /**
   * Resend's API key. Left unset until the deployed code path is first
   * given real sending (#20, #30); a row that needs email before then fails
   * and is retried, and nothing that only pushes is held up by it.
   */
  resendApiKey: string | undefined;
  /** Resend's API, overridden only by the seam-2 suite. */
  resendBaseUrl?: string;
  /** The shared venture inbox, so a reply reaches a person (ADR-0006). */
  replyTo: string;
}

export interface NotifierReport {
  /** Rows fully sent this run. */
  sent: number;
  pushes: number;
  emails: number;
  /** Subscriptions the push service said were gone, now removed. */
  droppedSubscriptions: number;
  /**
   * The rows that could not be sent, one line each, and why. They stay
   * unsent for a later run; a run reports them rather than failing, because
   * a failed run would say nothing about the rows that did go out.
   */
  failures: string[];
}

/** The From every notification email carries; Auth's mail says the same. */
const FROM = 'Toploader <noreply@mail.toploaderapp.com>';
const RESEND_BASE_URL = 'https://api.resend.com';

/**
 * How long a push service holds a message for a browser that is offline.
 * A day, matching how long the outbox keeps a row worth sending.
 */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

/**
 * How many claims one run will make. It is a stop, not a budget: the loop
 * ends when a claim comes back empty, and this keeps a run that is somehow
 * not making progress from spinning until the function times out.
 */
const MAX_CLAIMS = 100;

/** The notification matrix's columns: public.notification_channel. */
type Channel = 'push' | 'email';

/** What claim_notifications hands back. */
interface ClaimedNotification {
  id: string;
  trader_id: string;
  channels: Channel[];
  topic: string;
  title: string;
  body: string;
  url: string;
  push_sent_at: string | null;
  email_sent_at: string | null;
  email: string | null;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker receives, once decrypted (public/sw.js). */
interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** The row's topic: a browser collapses notifications sharing a tag. */
  tag: string;
}

export async function deliverNotifications(
  options: NotifierOptions,
): Promise<NotifierReport> {
  const supabase = createClient(
    options.supabaseUrl,
    options.supabaseSecretKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const report: NotifierReport = {
    sent: 0,
    pushes: 0,
    emails: 0,
    droppedSubscriptions: 0,
    failures: [],
  };

  for (let claims = 0; claims < MAX_CLAIMS; claims += 1) {
    const claim = await supabase.rpc('claim_notifications', {
      batch: options.batch ?? 20,
    });
    if (claim.error) throw claim.error;
    const claimed = claim.data as ClaimedNotification[];
    if (claimed.length === 0) break;

    // One row's failure is that row's: it stays unsent for a later run,
    // and every other row in the batch still goes out.
    await Promise.all(
      claimed.map(async (notification) => {
        try {
          await deliver(notification);
          report.sent += 1;
        } catch (error) {
          report.failures.push(
            `${notification.topic}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }

  return report;

  async function deliver(notification: ClaimedNotification) {
    if (notification.channels.includes('push') && !notification.push_sent_at) {
      await push(notification);
      await mark(notification.id, 'push');
    }
    if (
      notification.channels.includes('email') &&
      !notification.email_sent_at
    ) {
      await email(notification);
      await mark(notification.id, 'email');
    }
  }

  async function mark(notificationId: string, channel: Channel) {
    const { error } = await supabase.rpc('mark_notification_sent', {
      notification_id: notificationId,
      channel,
    });
    if (error) throw error;
  }

  /** One encrypted message to every browser the Trader has subscribed in. */
  async function push(notification: ClaimedNotification) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('trader_id', notification.trader_id);
    if (error) throw error;
    const subscriptions = data as PushSubscriptionRow[];

    const payload: PushPayload = {
      title: notification.title,
      body: notification.body,
      url: notification.url,
      tag: notification.topic,
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    for (const subscription of subscriptions) {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuthorization(
            subscription.endpoint,
            options.vapid,
          ),
          TTL: String(PUSH_TTL_SECONDS),
          Urgency: 'normal',
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
        },
        body: await encryptNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: null,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          plaintext,
        ),
      });
      // Gone: the browser unsubscribed, or the subscription expired. The
      // push service will never take another message for it.
      if (response.status === 404 || response.status === 410) {
        const dropped = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', subscription.id);
        if (dropped.error) throw dropped.error;
        report.droppedSubscriptions += 1;
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `the push service answered ${response.status} for ${subscription.endpoint}`,
        );
      }
      report.pushes += 1;
    }
  }

  async function email(notification: ClaimedNotification) {
    if (!options.email.resendApiKey) {
      throw new Error(
        'RESEND_API_KEY is not set, and this notification emails',
      );
    }
    if (!notification.email) {
      throw new Error(`Trader ${notification.trader_id} has no email address`);
    }
    const response = await fetch(
      `${options.email.resendBaseUrl ?? RESEND_BASE_URL}/emails`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.email.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [notification.email],
          reply_to: options.email.replyTo,
          subject: notification.title,
          text: `${notification.body}\n\n${options.appUrl}${notification.url}\n`,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Resend answered ${response.status}`);
    }
    report.emails += 1;
  }
}
