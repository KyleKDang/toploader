import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './styles/global.css';
import { createAppRouter } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element in the document');

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
