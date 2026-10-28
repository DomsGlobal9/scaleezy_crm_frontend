import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import toast, { Toaster } from 'react-hot-toast';
import './index.css';
import './styles/work.css';
import './styles/shell.css';
import './styles/segments.css';
import './styles/consent.css';
import './styles/counter.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

/**
 * A request that failed must not look like an empty list: one handler here says so for every
 * screen, keyed on the message so a dropped connection is reported once. A 401 is drawn as the
 * sign-in notice, a 403 as the no-access notice and a 404 as a not-found card, so none needs a toast.
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    // A screen that shows its own error in place (the segment builder's "nobody can be in it") asks
    // for no toast as well: the same sentence twice, one of them left behind after it is fixed.
    if (query?.meta?.quiet) return;
    const status = error?.statusCode;
    // 404 too: the screen says what was not found, in context.
    if (status === 401 || status === 403 || status === 404) return;
    const message = error?.message || 'Something did not load. Check your connection and try again.';
    toast.error(message, { id: `query:${message}` });
  }
});

const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // A refusal is not a blip: retrying a 401 or 403 only delays the honest screen.
      retry: (count, error) => ![401, 403, 404].includes(error?.statusCode) && count < 2,
      staleTime: 30_000,
      gcTime: 5 * 60_000
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' } }} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
