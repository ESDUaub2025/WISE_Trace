// The top of the app: one sign-in, one set of data, two workspaces.
//
//   SessionProvider          who is active (src/session)
//     AccountScreens         shown until someone has unlocked (src/account)
//     WorkspaceDataProvider  that person's data and background sending (src/app/WorkspaceData.tsx)
//       /today/*             simple workspace: the next step, one at a time (src/simple)
//       /*                   full workspace: lists, review, dashboards, administration (src/full)
//
// Who starts in which workspace is decided in src/config/workspaces.ts.
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AccountScreens } from '../account/AccountScreens';
import { demo } from '../lib/api';
import { canUseSimple, preferredWorkspace, workspaceConfig, workspacePath } from '../config/workspaces';
import { SessionProvider, useSession } from '../session/SessionProvider';
import { WorkspaceDataProvider } from './WorkspaceData';
import { fileTesting } from '../testing/file-backend';
import { FileSignIn } from '../testing/FileSignIn';

const FullWorkspace = lazy(() => import('../full/FullWorkspace'));
const SimpleWorkspace = lazy(() => import('../simple/SimpleWorkspace'));
const WorkerWorkspace = lazy(() => import('../worker/WorkerWorkspace'));

export default function AppRoot() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const { t } = useTranslation();
  const { status, identity } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const placedFor = useRef<string | null>(null);

  // After unlocking at the app's front door, go to the person's preferred workspace.
  // A deep link (for example /batches from a notification) is left alone.
  useEffect(() => {
    if (!identity) {
      placedFor.current = null;
      return;
    }
    // The demo build is a preview of the full workspace with a fictional producer.
    if (demo || placedFor.current === identity.id) return;
    placedFor.current = identity.id;
    if (location.pathname === '/') void navigate(workspacePath(preferredWorkspace(identity)), { replace: true });
  }, [identity, location.pathname, navigate]);

  if (status === 'loading') return <div className="loading-screen">{t('loading')}</div>;
  if (!identity) return fileTesting ? <FileSignIn /> : <AccountScreens />;

  const simple = `${workspaceConfig.simplePath}/*`;
  // The published file-backed application has one coherent worker interface, including old bookmarks.
  if (fileTesting)
    return (
      <WorkspaceDataProvider>
        <Suspense fallback={<div className="loading-screen">{t('loading')}</div>}>
          <WorkerWorkspace />
        </Suspense>
      </WorkspaceDataProvider>
    );
  return (
    <WorkspaceDataProvider>
      <Suspense fallback={<div className="loading-screen">{t('loading')}</div>}>
        <Routes>
          <Route path={simple} element={canUseSimple(identity) ? <SimpleWorkspace /> : <Navigate to="/" replace />} />
          {/* Address of the earlier separate simple app; kept so bookmarks and home-screen icons still work. */}
          <Route path="/simple/*" element={<Navigate to={workspaceConfig.simplePath} replace />} />
          <Route path="/*" element={<FullWorkspace />} />
        </Routes>
      </Suspense>
    </WorkspaceDataProvider>
  );
}
