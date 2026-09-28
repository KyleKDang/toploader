import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { AppShell, EmptyState, ListRow, TopBar } from '../components';
import { formatMoment } from '../lib/format';
import { pendingVerificationRequestsQuery } from '../lib/queries';
import { traderName } from '../lib/trades';
import { useTabs } from '../lib/tabs';

/*
 * The review queue: the verification requests waiting on a Founder, oldest
 * first, so the Trader who has waited longest is answered first.
 *
 * A row is a name and when they sent it, and nothing of the documents: the
 * photos are fetched one request at a time, on the screen that reviews it,
 * so a queue left open on a desk shows nobody's ID.
 *
 * A Founder's own request is never in the queue, since they cannot review
 * it. Only a Founder reaches this screen (src/router.tsx), and only a
 * Founder is handed the rows (RLS).
 */

const route = getRouteApi('/admin/verification');

export function ReviewQueueScreen() {
  const { founderId } = route.useLoaderData();
  const navigate = useNavigate();
  const requests = useQuery(pendingVerificationRequestsQuery(founderId));
  const waiting = requests.data ?? [];

  return (
    <AppShell
      header={
        <TopBar
          title="Verification requests"
          subtitle={waiting.length > 0 ? `${waiting.length} waiting` : null}
        />
      }
      {...useTabs('profile')}
    >
      {waiting.length === 0 ? (
        <EmptyState
          className="min-h-full"
          title="No requests waiting"
          hint="A request appears here when a trader sends their ID and selfie."
        />
      ) : (
        <ul aria-label="Verification requests">
          {waiting.map((request) => (
            <li key={request.id}>
              <ListRow
                title={traderName(request.trader)}
                detail={`Sent ${formatMoment(request.created_at)}`}
                onClick={() =>
                  void navigate({
                    to: '/admin/verification/$requestId',
                    params: { requestId: request.id },
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
