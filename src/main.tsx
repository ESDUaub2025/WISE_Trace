// Browser entry point. The app itself starts in src/app/AppRoot.tsx.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { fileTesting } from './testing/file-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { installDiagnostics } from './lib/telemetry';
import { movedToTrustedOrigin } from './lib/dev-origin';
import { watchConnectivity } from './connectivity/connectivity';
import { watchForAppUpdate } from './app/app-update';
import AppRoot from './app/AppRoot';
import './i18n';
import './styles.css';

if (!movedToTrustedOrigin()) {
  const Router = fileTesting ? HashRouter : BrowserRouter;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });
  installDiagnostics();
  watchConnectivity();
  watchForAppUpdate();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AppRoot />
        </Router>
      </QueryClientProvider>
    </StrictMode>,
  );
}
