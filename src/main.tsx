// First, so errors thrown while the rest of the app loads are reported too.
import { reactRootErrorHandlers } from './lib/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './styles/global.css';
import { registerSW } from 'virtual:pwa-register';
import { listenForInstallPrompt } from './lib/install';
import { createAppRouter } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in the document');

// The service worker (src/sw.ts): the offline shell, and the push handler.
// Registering is not asking: nothing is shown until a Trader turns alerts on
// (src/lib/push.ts).
void registerSW({ immediate: true });
listenForInstallPrompt();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Three retries as by default, but none while the browser is offline:
      // the offline shell (src/sw.ts) opens with no network, and retrying
      // would only hold a blank screen for seconds before the route error
      // screen says so.
      retry: (failures) => navigator.onLine && failures < 3,
    },
  },
});
const router = createAppRouter(queryClient);

createRoot(root, reactRootErrorHandlers).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
