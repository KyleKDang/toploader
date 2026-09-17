import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppShell,
  Badge,
  Button,
  Disclaimer,
  EmptyState,
  ListRow,
  PlusIcon,
  ReputationPill,
  SearchIcon,
  ShieldIcon,
  TextInput,
} from './components';
import type { TabKey } from './components';

/*
 * The primitive gallery.
 *
 * Nothing user-facing ships in this ticket - this page exists so the shared
 * component layer can be looked at in a browser, at 375px and in dark mode,
 * before any screen is built on it. #13 replaces it with the real sign-up,
 * profile and Matches screens.
 *
 * The sample content follows CONTEXT.md's vocabulary, because the suite and
 * the screens after it are named in those words too.
 */

/*
 * A stand-in for the Card tile, which is a design system primitive that lands
 * with the ticket that first needs it. This is sample content, not a
 * primitive: nothing imports it.
 */
function Thumb() {
  return (
    <span
      aria-hidden="true"
      className="aspect-5/7 w-thumb shrink-0 rounded-sm border border-line bg-surface-2"
    />
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b border-line bg-surface px-4 py-2.5 text-sm font-bold text-muted">
      {children}
    </h2>
  );
}

export function App() {
  const [tab, setTab] = useState<TabKey>('matches');
  const [query, setQuery] = useState('');

  return (
    <AppShell
      tab={tab}
      onSelectTab={setTab}
      unreadTabs={['matches']}
      header={
        <header className="flex min-h-tap items-center border-b border-line bg-bg px-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink">Primitives</h1>
            <p className="text-sm text-muted">
              The shared component layer, at 375px
            </p>
          </div>
        </header>
      }
    >
      <SectionHeading>Button</SectionHeading>
      <div className="flex gap-2.5 p-4">
        <Button variant="primary" icon={<PlusIcon />}>
          Add Want
        </Button>
        <Button>Add to Collection</Button>
      </div>

      <SectionHeading>Text input</SectionHeading>
      <div className="flex flex-col gap-3 p-4">
        <TextInput
          label="Display name"
          placeholder="How other Traders see you"
        />
        <TextInput
          aria-label="Search the Catalog"
          type="search"
          icon={<SearchIcon />}
          placeholder="Search the Catalog"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <SectionHeading>List row</SectionHeading>
      <ListRow
        unread
        leading={<Thumb />}
        title="Umbreon VMAX"
        trailing="$1,240.00"
        detail="Evolving Skies 215/203 · Alt Art · NM"
        relation="Priya R. lists it · you want it"
        relationTrailing={<ReputationPill verified trades={6} />}
        onClick={() => {}}
      />
      <ListRow
        leading={<Thumb />}
        title="Lugia V"
        trailing="$150.00"
        detail="Silver Tempest 186/195 · Alt Art · LP"
        relation="Devon L. lists it · you want it"
        relationTrailing={<ReputationPill verified={false} trades={0} />}
        onClick={() => {}}
      />

      <SectionHeading>Badge and Reputation pill</SectionHeading>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Badge tone="verified" icon={<ShieldIcon />}>
          Verified Trader
        </Badge>
        <ReputationPill verified trades={22} />
        <ReputationPill verified={false} trades={1} />
      </div>

      <SectionHeading>Empty state</SectionHeading>
      <EmptyState
        title="No Matches in Orange County yet"
        hint="A Match appears when a Listing here satisfies one of your Wants, or one of your Listings satisfies someone else's."
        action={{ label: 'Add a Want', onClick: () => {} }}
      />

      <SectionHeading>Non-affiliation disclaimer</SectionHeading>
      <Disclaimer />
    </AppShell>
  );
}
