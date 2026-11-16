import { RegistrationReview } from './registration-review';
import { Help } from './help';
import { QualityPanel } from './quality-panel';
import { ArchiveSearch } from './archive-search';
import { ReportSchedules } from './report-schedules';
import { RecallCases } from './recall-cases';
import { DisplaySettings } from './display-settings';
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  Check,
  ChevronRight,
  ClipboardCheck,
  Droplets,
  Factory,
  Leaf,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  Users,
  Wrench,
  X,
  AlertTriangle,
  FileText,
  ScanLine,
} from 'lucide-react';
import { motion } from 'motion/react';
import { formatLocalDate } from '../lib/format';
import { Button } from '../components/ui/button';
import { Sheet } from '../components/ui/sheet';
import type { Snapshot, Row } from '../lib/data';
import { demo } from '../lib/api';
import type { Identity, Lot } from '../lib/domain';
import { useIdentity } from '../session/SessionProvider';
import { useWorkspaceData } from '../app/WorkspaceData';
import { ConnectionStatus } from '../app/ConnectionStatus';
import { AccountMenu } from '../account/AccountMenu';
import { RegistryFlow } from './management';
import { Scanner } from './scanner';
import { ReportPage } from './report-page';
import { Knowledge } from './knowledge';
import { Flow, LotDetail, AdminPanel } from './features';

import { attentionTasks, responsibleFor } from '../lib/attention';
import { lotConfig } from '../lib/schedules';
import { Notifications } from './notifications';

const Dashboard = lazy(() => import('./dashboard'));
const navigation = [
  { key: 'home', path: '/', icon: Sprout },
  { key: 'whey', path: '/whey', icon: Droplets },
  { key: 'batches', path: '/batches', icon: Factory },
  { key: 'inventory', path: '/inventory', icon: Boxes },
  { key: 'review', path: '/review', icon: ClipboardCheck },
  { key: 'deviations', path: '/deviations', icon: AlertTriangle },
  { key: 'recall', path: '/recall', icon: ScanLine },
  { key: 'training', path: '/training', icon: BookOpen },
  { key: 'equipment', path: '/equipment', icon: Wrench },
  { key: 'dashboards', path: '/dashboards', icon: Leaf },
  { key: 'reports', path: '/reports', icon: FileText },
  { key: 'organization', path: '/organization', icon: Users },
  { key: 'admin', path: '/admin', icon: Settings2 },
];
export function localDate(value: string) {
  return formatLocalDate(value, document.documentElement.lang || 'en');
}
export function Status({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <span className={`status status-${value}`}>
      <span className="status-dot" />
      {t(value)}
    </span>
  );
}
export function Label({ code }: { code: string }) {
  return (
    <bdi className="lot-label" dir="ltr">
      {code}
    </bdi>
  );
}
export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="empty">
      <Sprout size={32} />
      <h3>{t('empty')}</h3>
      {children}
    </div>
  );
}
export default function FullWorkspace() {
  const [, setDisplayRevision] = useState(0);
  const [archive, setArchive] = useState<Snapshot | null>(null);
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const identity = useIdentity();
  const { data, error, loading: isLoading, refresh: reload } = useWorkspaceData();
  const [menu, setMenu] = useState(false),
    [flow, setFlow] = useState(''),
    [lot, setLot] = useState<Lot | null>(null),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState(''),
    [userSheet, setUserSheet] = useState(false);
  // Screens below only need "done"; the shared loader also returns the fresh data.
  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);
  // The simple workspace hands over work it has no guided screen for: open that lot here.
  const handedLot = (location.state as { lot?: string } | null)?.lot;
  useEffect(() => {
    const found = handedLot && data?.lots.find((candidate) => candidate.id === handedLot);
    if (!found) return;
    setLot(found);
    void navigate(location.pathname, { replace: true, state: null });
  }, [handedLot, data, navigate, location.pathname]);
  useEffect(() => {
    const timer = setTimeout(() => setMessage(''), 7000);
    return () => clearTimeout(timer);
  }, [message]);
  const section = navigation.find((n) => n.path === location.pathname)?.key ?? 'home';
  const canViewDashboards = identity.roles.some((role) =>
    ['supervisor', 'manager', 'admin', 'food_safety', 'partner', 'donor'].includes(role),
  );
  const canViewImpact = identity.roles.some((role) =>
    ['manager', 'admin', 'food_safety', 'partner', 'donor'].includes(role),
  );
  // Viewers without operational data (donors, partners without an agreement) only have the dashboards.
  const dashboardsOnly =
    identity.roles.includes('donor') || (identity.roles.includes('partner') && data?.cooperatives.length === 0);
  useEffect(() => {
    if (!canViewDashboards && location.pathname === '/dashboards') void navigate('/', { replace: true });
  }, [canViewDashboards, location.pathname, navigate]);
  useEffect(() => {
    if (dashboardsOnly && location.pathname !== '/dashboards') void navigate('/dashboards', { replace: true });
  }, [dashboardsOnly, location.pathname, navigate]);
  const open = (name: string) => {
    if (data?.setupPending && !name.startsWith('registry:') && name !== 'notifications') {
      setMessage('workspaceSetupPending');
      return;
    }
    setFlow(name);
  };
  const visibleNavigation = navigation.filter(
    (n) =>
      !(n.key === 'dashboards' && !canViewDashboards) &&
      !(dashboardsOnly && n.key !== 'dashboards') &&
      !(n.key === 'admin' && !identity.roles.some((r) => ['admin', 'food_safety'].includes(r))) &&
      !(n.key === 'review' && !identity.roles.some((r) => ['supervisor', 'food_safety'].includes(r))),
  );
  return (
    <div className="app-layout">
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}wise.svg`} alt="" />
          <div>
            <strong>{t('brand')}</strong>
            <span>{t('traceability')}</span>
          </div>
          <button className="icon-button mobile-only" aria-label={t('close')} onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>
        <div className="coop-label">
          <span className="eyebrow">{t('organization')}</span>
          <strong>
            {String(data?.cooperatives.find((c) => c.id === identity.cooperative_id)?.name ?? t('loading'))}
          </strong>
          <span>{t('tagline')}</span>
        </div>
        <nav aria-label={t('more')}>
          {visibleNavigation.map((n) => (
            <NavLink key={n.key} to={n.path} end={n.path === '/'} onClick={() => setMenu(false)}>
              <n.icon size={19} />
              <span>{t(n.key)}</span>
              {n.key === 'home' && data && <small>{attentionTasks(data, identity).length}</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="person" onClick={() => setUserSheet(true)}>
            <span className="avatar">
              {identity.display_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span>
              <strong>{identity.display_name}</strong>
              <small>{t('accountMenu')}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      {menu && <button className="menu-backdrop" aria-label={t('close')} onClick={() => setMenu(false)} />}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMenu(true)} aria-label={t('more')}>
            <Menu />
          </button>
          <div className="breadcrumb">
            {t('brand')}
            <span>/</span>
            <strong>{t(section)}</strong>
          </div>
          <div className="topbar-actions">
            <Help
              key={identity.id}
              userId={identity.id}
              section={section}
              pages={visibleNavigation.map((n) => n.key)}
            />
            <ConnectionStatus onSendNow={reload} />
            <button
              className="language-button"
              onClick={() => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            >
              {i18n.language === 'ar' ? t('english') : t('language')}
            </button>
            <button className="icon-button" onClick={() => open('notifications')} aria-label={t('notifications')}>
              <Bell size={20} />
            </button>
          </div>
        </header>
        {data?.cooperatives.find((c) => c.id === identity.cooperative_id)?.service_plan === 'trial' && (
          <div className="demo-banner">{t('trialWorkspace')}</div>
        )}
        {data?.setupPending && (
          <div className="placeholder-banner" role="status">
            {t('workspaceSetupPending')}
          </div>
        )}
        {demo && <div className="demo-banner">{t('demo')}</div>}
        {data?.config.placeholder && (
          <div className="placeholder-banner">
            <ShieldCheck size={16} />
            {t('placeholder')}
          </div>
        )}
        <main className="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{t('traceability')}</p>
              <h1>{t(section === 'home' ? 'attention' : section)}</h1>
              <p className="intro">{t(section === 'home' ? 'attentionIntro' : `${section}Intro`)}</p>
            </div>
            <div className="page-actions">
              {['home', 'whey'].includes(section) && (
                <Button onClick={() => open('receipt')}>
                  <Plus size={18} />
                  {t('newReceipt')}
                </Button>
              )}
              {section === 'whey' && identity.roles.includes('manager') && (
                <Button variant="outline" onClick={() => open('registry:supplier')}>
                  {t('supplier')}
                </Button>
              )}
              {section === 'batches' && (
                <Button onClick={() => open('batch')}>
                  <Plus size={18} />
                  {t('newBatch')}
                </Button>
              )}
              {section === 'inventory' && (
                <Button onClick={() => open('sale')}>
                  <Plus size={18} />
                  {t('newSale')}
                </Button>
              )}
              {section === 'deviations' && (
                <Button onClick={() => open('deviation')}>
                  <Plus size={18} />
                  {t('newDeviation')}
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-box" role="alert">
              {t(error.message)}
            </div>
          )}
          {isLoading ? (
            <p>{t('loading')}</p>
          ) : (
            data && (
              <>
                {section === 'home' && (
                  <Home
                    data={data}
                    identity={identity}
                    canViewImpact={canViewImpact}
                    onTask={(task) => {
                      setLot(data.lots.find((l) => l.id === task.lot_id) ?? null);
                      if (task.kind === 'checkpoint_due') open('checkpoint:' + String(task.details.definition_key));
                      else if (task.kind === 'sync_conflict') open('conflicts');
                      else if (['training', 'training_due'].includes(task.kind))
                        open('training:' + String(task.details.module_id));
                      else if (task.kind === 'calibration') open('calibration');
                      else if (task.kind === 'storage_inspection_due') open('storage_inspection');
                    }}
                    onLot={(value) => {
                      setArchive(null);
                      setLot(value);
                    }}
                    open={open}
                  />
                )}
                {['whey', 'batches', 'inventory', 'review', 'recall'].includes(section) && (
                  <>
                    <div className="section-toolbar">
                      <div className="search">
                        <Search size={18} />
                        <input
                          aria-label={t('search')}
                          placeholder={t('search')}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <div className="button-group">
                        {section === 'batches' && (
                          <Button variant="outline" onClick={() => open('allocation')}>
                            {t('allocate')}
                          </Button>
                        )}
                        {section === 'inventory' && (
                          <>
                            <Button variant="outline" onClick={() => open('scan')}>
                              <ScanLine size={18} />
                              {t('quickSale')}
                            </Button>
                            <Button variant="outline" onClick={() => open('packaging')}>
                              {t('newPackaging')}
                            </Button>
                            <Button variant="outline" onClick={() => open('storage_inspection')}>
                              {t('newInspection')}
                            </Button>
                            <Button variant="outline" onClick={() => open('registry:stock_count')}>
                              {t('stockCount')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <LotTable
                      lots={data.lots.filter(
                        (l) =>
                          l.code.toLowerCase().includes(search.toLowerCase()) &&
                          (section === 'whey'
                            ? ['whey', 'ingredient', 'packaging_material'].includes(l.type)
                            : section === 'batches'
                              ? l.type === 'batch'
                              : section === 'inventory'
                                ? l.type === 'packaging'
                                : section === 'review'
                                  ? ['received', 'awaiting_review', 'on_hold', 'hold'].includes(l.state)
                                  : true),
                      )}
                      onLot={(value) => {
                        setArchive(null);
                        setLot(value);
                      }}
                      groupStock={section === 'inventory'}
                    />
                  </>
                )}
                {['whey', 'batches', 'inventory', 'review', 'recall'].includes(section) && (
                  <ArchiveSearch
                    data={data}
                    onOpen={(snapshot, lot) => {
                      setArchive(snapshot);
                      setLot(lot);
                    }}
                  />
                )}
                {section === 'recall' && <RecallCases data={data} onDone={refresh} />}
                {section === 'deviations' && (
                  <QualityPanel
                    data={data}
                    identity={identity}
                    onDone={refresh}
                    onClose={(row) => {
                      setFlow('close_deviation:' + row.id);
                      setLot(data.lots.find((l) => l.id === row.lot_id) ?? null);
                    }}
                  />
                )}
                {section === 'training' && <Knowledge data={data} identity={identity} open={open} />}
                {section === 'equipment' && (
                  <>
                    <div className="button-group">
                      <Button variant="outline" onClick={() => open('registry:equipment')}>
                        {t('equipment')}
                      </Button>
                      <Button variant="outline" onClick={() => open('calibration')}>
                        {t('calibrationCheck')}
                      </Button>
                    </div>
                    <RecordList
                      rows={data.equipment}
                      fields={['label', 'type', 'calibrated_at', 'next_due_at', 'status']}
                    />
                  </>
                )}
                {section === 'dashboards' && (
                  <Suspense fallback={<p>{t('loading')}</p>}>
                    <Dashboard data={data} identity={identity} />
                  </Suspense>
                )}
                {section === 'reports' && (
                  <ReportPage
                    data={data}
                    canViewImpact={canViewImpact}
                    canExportCooperative={identity.roles.some((r) => ['manager', 'admin', 'food_safety'].includes(r))}
                  />
                )}
                {section === 'organization' && (
                  <>
                    <div className="button-group">
                      {identity.roles.some((r) => ['admin', 'manager'].includes(r)) && (
                        <>
                          <Button onClick={() => open('registry:user')}>{t('newUser')}</Button>
                          <Button variant="outline" onClick={() => open('registry:reset_access')}>
                            {t('resetAccess')}
                          </Button>
                          <Button variant="outline" onClick={() => open('registry:account')}>
                            {t('authorization')}
                          </Button>
                          <Button variant="outline" onClick={() => open('registry:revoke_device')}>
                            {t('revokeDevice')}
                          </Button>
                          <Button variant="outline" onClick={() => open('registry:data_agreement')}>
                            {t('dataAgreement')}
                          </Button>
                          <Button variant="outline" onClick={() => open('registry:anonymize')}>
                            {t('anonymize')}
                          </Button>
                        </>
                      )}
                      <Button variant="outline" onClick={() => open('registry:consent')}>
                        {t('profile')}
                      </Button>
                      <Button variant="outline" onClick={() => open('registry:notification_preferences')}>
                        {t('notification_preferences')}
                      </Button>
                    </div>
                    {identity.roles.some((r) => ['admin', 'manager'].includes(r)) && <ReportSchedules data={data} />}
                    <RecordList rows={data.members} fields={['display_name', 'username', 'roles', 'status']} />
                    <h2>{t('equipmentId')}</h2>
                    <RecordList rows={data.devices} fields={['label', 'last_sync_at', 'revoked_at']} />
                  </>
                )}
                {section === 'admin' && (
                  <>
                    <div className="button-group">
                      <Button onClick={() => open('registry:cooperative')}>{t('newCooperative')}</Button>
                      <Button variant="outline" onClick={() => open('registry:supplier')}>
                        {t('supplier')}
                      </Button>
                      <Button variant="outline" onClick={() => open('registry:training_exception')}>
                        {t('trainingException')}
                      </Button>
                    </div>
                    {identity.roles.includes('admin') && (
                      <Button variant="outline" onClick={() => open('registry:sop_migration')}>
                        {t('sop_migration')}
                      </Button>
                    )}
                    {identity.roles.includes('admin') && (
                      <RegistrationReview cooperatives={data.cooperatives} onDone={refresh} />
                    )}
                    <AdminPanel data={data} identity={identity} onDone={refresh} />
                  </>
                )}
              </>
            )
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={15} />
              {t('tagline')}
            </span>
            <span>{t('noCertification')}</span>
          </footer>
        </main>
      </div>
      <Sheet
        open={!!flow}
        onClose={() => setFlow('')}
        title={t(
          flow === 'receipt'
            ? 'newReceipt'
            : flow === 'batch'
              ? 'newBatch'
              : flow === 'checkpoint'
                ? 'recordCheck'
                : flow === 'notifications'
                  ? 'notifications'
                  : flow === 'conflicts'
                    ? 'conflict'
                    : flow.split(':')[0],
        )}
      >
        {data &&
          identity &&
          (flow === 'scan' ? (
            <Scanner
              onToken={(token) => {
                const packaging = data.packaging.find((p) => p.public_token === token);
                const found = data.lots.find((l) => l.id === packaging?.lot_id);
                if (found) {
                  setLot(found);
                  setFlow('sale');
                } else setMessage('error');
              }}
            />
          ) : flow === 'notifications' ? (
            <Notifications rows={data.notifications} identity={identity} onDone={refresh} />
          ) : flow === 'conflicts' ? (
            <RecordList
              rows={data.tasks.filter((task) => task.kind === 'sync_conflict')}
              fields={['kind', 'details']}
            />
          ) : flow.startsWith('registry:') ? (
            <RegistryFlow
              entity={flow.split(':')[1]}
              data={data}
              identity={identity}
              onDone={async () => {
                setFlow('');
                setMessage('success');
                await refresh();
              }}
            />
          ) : (
            <Flow
              action={flow}
              data={archive ?? data}
              identity={identity}
              lot={lot}
              onDone={async () => {
                setFlow('');
                setLot(null);
                setMessage('success');
                await refresh();
              }}
            />
          ))}
      </Sheet>
      <Sheet open={!!lot && !flow} onClose={() => setLot(null)} title={lot?.code ?? ''}>
        {lot && data && (
          <LotDetail
            lot={data.lots.find((current) => current.id === lot.id) ?? lot}
            data={archive ?? data}
            identity={identity}
            open={open}
            onDone={refresh}
          />
        )}
      </Sheet>
      <AccountMenu open={userSheet} onClose={() => setUserSheet(false)} workspace="full">
        <DisplaySettings onChange={() => setDisplayRevision((value) => value + 1)} />
      </AccountMenu>
      {message && (
        <div className="toast" role="status">
          <Check size={20} />
          {t(message)}
        </div>
      )}
    </div>
  );
}
function Home({
  data,
  identity,
  canViewImpact,
  onTask,
  onLot,
  open,
}: {
  data: Snapshot;
  identity: Identity;
  canViewImpact: boolean;
  onTask: (task: Snapshot['tasks'][0]) => void;
  onLot: (lot: Lot) => void;
  open: (name: string) => void;
}) {
  const { t } = useTranslation();
  const tasks = attentionTasks(data, identity);
  const batches = data.lots.filter(
    (l) =>
      l.type === 'batch' &&
      ['draft', 'in_production', 'awaiting_review', 'on_hold'].includes(l.state) &&
      (identity.roles.some((r) => ['supervisor', 'manager', 'admin', 'food_safety'].includes(r)) ||
        responsibleFor(l, identity)),
  );
  return (
    <>
      <div className="stats-strip">
        {[
          { label: 'activeBatches', value: batches.length, icon: Factory },
          { label: 'attentionCount', value: tasks.length, icon: ClipboardCheck },
          {
            label: 'stockUnits',
            value: data.lots.filter((l) => l.type === 'packaging').reduce((sum, l) => sum + (l.available ?? 0), 0),
            icon: Boxes,
          },
        ].map((stat) => (
          <div key={stat.label}>
            <stat.icon size={20} />
            <strong>{stat.value}</strong>
            <span>{t(stat.label, { count: tasks.length })}</span>
          </div>
        ))}
      </div>
      <div className="home-columns">
        <section>
          <div className="section-title">
            <h2>{t('home')}</h2>
            <span className="count-label">{tasks.length}</span>
          </div>
          <div className="task-list">
            {tasks.length === 0 ? (
              <Empty>{t('allClearText')}</Empty>
            ) : (
              tasks.map((task, index) => {
                const l = data.lots.find((l) => l.id === task.lot_id);
                const overdue = Date.parse(task.due_at) < Date.now();
                return (
                  <motion.button
                    key={task.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={`task-card ${overdue ? 'task-overdue' : ''}`}
                    onClick={() => onTask(task)}
                  >
                    <span className="task-icon">
                      {task.kind === 'checkpoint_due' ? (
                        <Droplets size={26} />
                      ) : task.kind === 'expiry' ? (
                        <Leaf size={26} />
                      ) : (
                        <Wrench size={26} />
                      )}
                    </span>
                    <span className="task-copy">
                      <span className={`eyebrow ${overdue ? 'attention-text' : ''}`}>
                        {t(overdue ? 'overdue' : 'due')} · <bdi>{localDate(task.due_at)}</bdi>
                      </span>
                      <strong>{t(task.kind)}</strong>
                      {l ? <Label code={l.code} /> : <span>{String(task.details.label ?? '')}</span>}
                    </span>
                    <ChevronRight size={22} className="directional" />
                  </motion.button>
                );
              })
            )}
          </div>
          <div className="quick-actions">
            <Button variant="outline" onClick={() => open('batch')}>
              <Plus size={18} />
              {t('newBatch')}
            </Button>
            <Button variant="outline" onClick={() => open('deviation')}>
              <AlertTriangle size={18} />
              {t('newDeviation')}
            </Button>
          </div>
        </section>
        <section>
          <div className="section-title">
            <h2>{t('batches')}</h2>
            <NavLink to="/batches">
              {t('viewAll')}
              <ArrowUpRight size={15} />
            </NavLink>
          </div>
          {batches.map((batch) => (
            <button className="batch-card card" onClick={() => onLot(batch)} key={batch.id}>
              <div>
                <Label code={batch.code} />
                <Status value={batch.state} />
              </div>
              <h3>
                {lotConfig(data, batch).definition.stages.find((s) => s.key === batch.stage)?.label[
                  document.documentElement.lang === 'ar' ? 'ar' : 'en'
                ] ?? t('draft')}
              </h3>
              <div className="stage-thread">
                {lotConfig(data, batch).definition.stages.map((stage, index) => (
                  <span
                    key={stage.key}
                    className={
                      index <= lotConfig(data, batch).definition.stages.findIndex((s) => s.key === batch.stage)
                        ? 'done'
                        : ''
                    }
                  />
                ))}
              </div>
              <small>
                {t('stage')} · {lotConfig(data, batch).definition.stages.findIndex((s) => s.key === batch.stage) + 1}/
                {lotConfig(data, batch).definition.stages.length}
              </small>
            </button>
          ))}
          <article className="story-card">
            <Leaf size={30} />
            <p className="eyebrow">{t('brand')}</p>
            <h2>{t('projectStory')}</h2>
            <p>{t('impactIntro')}</p>
            {canViewImpact && (
              <NavLink to="/dashboards">
                {t('dashboards')}
                <ArrowUpRight size={18} />
              </NavLink>
            )}
            <div className="story-lines" />
          </article>
        </section>
      </div>
    </>
  );
}
function LotTable({
  lots,
  onLot,
  groupStock = false,
}: {
  lots: Lot[];
  onLot: (lot: Lot) => void;
  groupStock?: boolean;
}) {
  const { t } = useTranslation();
  if (groupStock)
    return (
      <>
        <h2>{t('availableStock')}</h2>
        <LotTable lots={lots.filter((l) => l.state === 'released')} onLot={onLot} />
        <h2>{t('restrictedStock')}</h2>
        <LotTable lots={lots.filter((l) => l.state !== 'released')} onLot={onLot} />
      </>
    );
  return lots.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('code')}</th>
            <th>{t('type')}</th>
            <th>{t('status')}</th>
            <th>{t('available')}</th>
            <th>{t('observed')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id}>
              <td>
                <button className="text-button" onClick={() => onLot(l)}>
                  <Label code={l.code} />
                </button>
              </td>
              <td>{t(l.type)}</td>
              <td>
                <Status value={l.state} />
                {l.sync_status && l.sync_status !== 'synced' && (
                  <small className="record-sync">{t(l.sync_status)}</small>
                )}
              </td>
              <td className="mono">
                {l.available ?? '—'} <bdi>{l.unit}</bdi>
              </td>
              <td className="quiet">
                <bdi>{localDate(l.observed_at)}</bdi>
              </td>
              <td>
                <button className="icon-button" aria-label={`${t('details')} ${l.code}`} onClick={() => onLot(l)}>
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
export function RecordList({ rows, fields, onClick }: { rows: Row[]; fields: string[]; onClick?: (row: Row) => void }) {
  const { t } = useTranslation();
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f}>{t(f)}</th>
            ))}
            {onClick && <th>{t('actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {fields.map((f) => (
                <td key={f}>{typeof row[f] === 'object' ? JSON.stringify(row[f]) : String(row[f] ?? '—')}</td>
              ))}
              {onClick && (
                <td>
                  <Button variant="outline" onClick={() => onClick(row)}>
                    {t('details')}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
