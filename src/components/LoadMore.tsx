import { Button } from './Button';
import { FormError } from './FormError';

/*
 * "Load more" under a list read a page at a time: shown only while there is
 * a further page, and adding it below the rows already there. A page that
 * fails to load leaves those rows where they are, says so, and leaves the
 * button to try again with.
 *
 * It takes the infinite query itself, so every paged list asks for the next
 * page and reports its failure the same way.
 */

type LoadMoreProps = {
  pages: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    error: Error | null;
    fetchNextPage: () => Promise<unknown>;
  };
};

export function LoadMore({ pages }: LoadMoreProps) {
  if (!pages.hasNextPage) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3.5">
      <Button
        disabled={pages.isFetchingNextPage}
        onClick={() => void pages.fetchNextPage()}
      >
        {pages.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </Button>
      <FormError
        error={
          pages.isFetchNextPageError && !pages.isFetchingNextPage
            ? pages.error
            : null
        }
      />
    </div>
  );
}
