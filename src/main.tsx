// First, so errors thrown while the rest of the app loads are reported too.
import { reactRootErrorHandlers } from './lib/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './styles/global.css';
import { registerServiceWorker } from './lib/push';
import { createAppRouter } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in the document');

// The worker that shows a push notification. Registering is not asking:
// nothing is shown until a Trader turns alerts on (src/lib/push.ts).
void registerServiceWorker();

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);

createRoot(root, reactRootErrorHandlers).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
