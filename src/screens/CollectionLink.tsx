import { useNavigate } from '@tanstack/react-router';
import { Button } from '../components';

/*
 * The way into the Collection, in the top bar of the Search tab's screens.
 *
 * The Collection lives in this tab because the Catalog search is how Copies
 * get into it: search a Card, add what you own, and this is where what you
 * own adds up. The Trader profile (#27) will link to it as well, since a
 * Collection is also one of a Trader's own things; that tab has no screen
 * yet.
 */

export function CollectionLink() {
  const navigate = useNavigate();

  return (
    <div className="flex shrink-0">
      <Button onClick={() => void navigate({ to: '/collection' })}>
        Collection
      </Button>
    </div>
  );
}
