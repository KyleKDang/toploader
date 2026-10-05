import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  FormError,
  ListRow,
  Sheet,
  TopBar,
} from '../components';
import { BanIcon } from '../components/icons';
import { CONDITION_NAMES } from '../lib/conditions';
import { formatMoment } from '../lib/format';
import { banTrader, reportsQuery, type FiledReport } from '../lib/queries';
import { useTabs } from '../lib/tabs';

/*
 * The reports, newest first: who was reported, by whom and when, and the
 * reason in full. Reports are not rows that truncate, since the reason is
 * what a Founder acts on, and cutting it short would hide the part that
 * matters.
 *
 * A Listing's report links to the Listing, which a Founder can open
 * whatever has happened to it since, photos included while they last.
 *
 * A Founder bans the reported Trader from their report. Once banned, every
 * report about them says so in place of the action. A deleted Trader has
 * nothing left to ban.
 *
 * Only a Founder reaches this screen (src/router.tsx), and only a Founder
 * is handed the rows (RLS).
 */

const route = getRouteApi('/admin/reports');

export function ReportsScreen() {
  const { founderId } = route.useLoaderData();
  const reports = useQuery(reportsQuery(founderId)).data ?? [];

  return (
    <AppShell
      header={
        <TopBar
          title="Reports"
          subtitle={reports.length > 0 ? `${reports.length} in all` : null}
        />
      }
      {...useTabs('profile')}
    >
      {reports.length === 0 ? (
        <EmptyState
          className="min-h-full"
          title="No reports"
          hint="A report appears here when a trader reports another trader or a listing."
        />
      ) : (
        <ul aria-label="Reports">
          {reports.map((report) => (
            <li key={report.id} className="border-b border-line py-4">
              <ReportItem report={report} founderId={founderId} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/**
 * A report's Trader by name. One whose account is deleted is no longer
 * readable, the report still is, and the Founder is told which it was.
 */
function nameOf(
  trader: { display_name: string | null } | null,
  gone = 'a deleted trader',
) {
  return trader?.display_name ?? gone;
}

function ReportItem({
  report,
  founderId,
}: {
  report: FiledReport;
  founderId: string;
}) {
  const navigate = useNavigate();
  const { listing, trader } = report;

  return (
    <article
      aria-label={`Report about ${nameOf(trader)}`}
      className="flex flex-col gap-1"
    >
      <h2 className="px-4 text-base font-bold text-ink">
        {nameOf(trader, 'A deleted trader')}
      </h2>
      <p className="px-4 text-sm leading-prose text-muted">
        From {nameOf(report.reporter)}, {formatMoment(report.created_at)}
      </p>
      <p className="px-4 pt-1 text-base leading-prose whitespace-pre-line text-ink">
        {report.reason}
      </p>
      {trader ? (
        <div className="flex px-4 pt-2">
          {trader.banned_at !== null ? (
            <Badge tone="banned" icon={<BanIcon />}>
              Banned
            </Badge>
          ) : (
            <BanTrader
              trader={{ id: trader.id, name: nameOf(trader) }}
              founderId={founderId}
            />
          )}
        </div>
      ) : null}
      {listing ? (
        <ListRow
          className="mt-2 border-t"
          title={listing.card_variants.cards.name}
          detail={`${listing.card_variants.name}, ${CONDITION_NAMES[listing.condition]}`}
          relation="Reported listing"
          onClick={() =>
            void navigate({
              to: '/listings/$listingId',
              params: { listingId: listing.id },
            })
          }
        />
      ) : null}
    </article>
  );
}

/**
 * Banning the reported Trader, confirmed in a sheet with the destructive
 * action second. The sheet says what a ban does in the Founder's terms, and
 * that the app cannot take it back.
 */
function BanTrader({
  trader,
  founderId,
}: {
  trader: { id: string; name: string };
  founderId: string;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const ban = useMutation({
    mutationFn: () => banTrader(trader.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reportsQuery(founderId).queryKey,
      });
      setConfirming(false);
    },
  });

  return (
    <>
      <Button onClick={() => setConfirming(true)}>Ban {trader.name}</Button>

      <Sheet
        open={confirming}
        title={`Ban ${trader.name}?`}
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={ban.isPending}
              onClick={() => ban.mutate()}
            >
              {ban.isPending ? 'Banning…' : 'Ban'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-prose text-ink">
          {trader.name} is signed out and cannot sign in again. Their listings
          come down, and any trade still open is cancelled in their name.
        </p>
        <p className="mt-2 text-base leading-prose text-ink">
          Every trader who sees their name sees Banned beside it. There is no
          way to lift a ban in the app.
        </p>
        <FormError error={ban.error} />
      </Sheet>
    </>
  );
}
