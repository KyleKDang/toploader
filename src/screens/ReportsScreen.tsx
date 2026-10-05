import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { AppShell, EmptyState, ListRow, TopBar } from '../components';
import { CONDITION_NAMES } from '../lib/conditions';
import { formatMoment } from '../lib/format';
import { reportsQuery, type FiledReport } from '../lib/queries';
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
              <ReportItem report={report} />
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

function ReportItem({ report }: { report: FiledReport }) {
  const navigate = useNavigate();
  const { listing } = report;

  return (
    <article
      aria-label={`Report about ${nameOf(report.trader)}`}
      className="flex flex-col gap-1"
    >
      <h2 className="px-4 text-base font-bold text-ink">
        {nameOf(report.trader, 'A deleted trader')}
      </h2>
      <p className="px-4 text-sm leading-prose text-muted">
        From {nameOf(report.reporter)}, {formatMoment(report.created_at)}
      </p>
      <p className="px-4 pt-1 text-base leading-prose whitespace-pre-line text-ink">
        {report.reason}
      </p>
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
