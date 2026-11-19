import React, { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Phone, Scissors } from 'lucide-react';
import { useOpenWork, useShopServices, rupees, daysFrom } from '../hooks/useBoutique';
import { formatDay } from '../utils/dates';
import { useMediaQuery } from '../hooks/useMediaQuery';
import LoadFailed from '../components/LoadFailed';

/**
 * Due and ready (the mockup approved 19 Nov): the boutique's work across every customer, for whoever runs the counter.
 * Four counts that are also the filters; overdue first, then due this week, ready to collect (longest waiting first),
 * parcels on their way. A phone shows cards; a laptop one table. Only a shop that uses Boutique has it.
 */
const GROUPS = [
  { key: 'overdue', label: 'Overdue', test: w => w.overdue },
  { key: 'week', label: 'Due this week', test: w => !w.overdue && ['taken', 'in-progress', 'trial'].includes(w.status) && w.dates.due && daysFrom(w.dates.due) <= 7 },
  { key: 'ready', label: 'Ready to collect', test: w => w.status === 'ready' },
  { key: 'shipped', label: 'Sent by courier', test: w => w.status === 'shipped' }
];
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function when(w) {
  if (w.overdue) { const d = Math.max(1, -daysFrom(w.dates.due)); return { big: d, small: d === 1 ? 'day late' : 'days late', tone: 'over', tag: `${plural(d, 'day')} late` }; }
  if (w.status === 'ready') { const d = w.waitingDays ?? 0; return { big: d, small: d === 1 ? 'day waiting' : 'days waiting', tone: 'ready', tag: `Ready · ${plural(d, 'day')}` }; }
  if (w.status === 'shipped') return { big: '↗', small: 'sent', tone: 'ship', tag: 'Sent by courier' };
  if (w.status === 'trial' && w.dates.trial) return { big: formatDay(w.dates.trial).split(' ')[0], small: 'trial', tone: 'week', tag: `Trial ${formatDay(w.dates.trial)}` };
  const d = daysFrom(w.dates.due);
  return { big: d === 0 ? 'Today' : d, small: d === 0 ? 'due' : d === 1 ? 'day left' : 'days left', tone: 'week', tag: d === 0 ? 'Due today' : `Due in ${plural(d, 'day')}` };
}

export default function DueAndReady() {
  const services = useShopServices();
  const work = useOpenWork(!!services.data?.using);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 861px)');
  const rows = work.data ?? [];
  const counts = useMemo(() => Object.fromEntries(GROUPS.map(g => [g.key, rows.filter(g.test).length])), [rows]);
  const pick = params.get('show');
  const shown = GROUPS.filter(g => !pick || g.key === pick);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  if (services.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div></main>;
  if (!services.data?.using) {
    return <main className="crm-page"><div className="crm-card"><div className="crm-empty"><Scissors size={24} /><h3>This shop does not use Boutique</h3><p>Stitching and alterations show here for shops that take them in Boutique.</p><Link className="btn-secondary" to="/today">Go to To do today</Link></div></div></main>;
  }
  const choose = (key) => setParams(key === pick ? {} : { show: key }, { replace: true });
  const open = (w) => navigate(`/customers/${w.customer.id}?tab=boutique`);

  return (
    <main className="crm-page dr-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Scissors size={24} aria-hidden="true" /> Due and ready</h1>
          <p>{today}. Overdue first; ready to collect, longest waiting first.</p>
        </div>
      </div>
      <div className="dr-counts" role="group" aria-label="Show">
        {GROUPS.map(g => (
          <button key={g.key} type="button" aria-pressed={pick === g.key} className={`dr-count${pick === g.key ? ' on' : ''}${g.key === 'overdue' && counts.overdue ? ' red' : ''}`} onClick={() => choose(g.key)} data-testid={`dr-count-${g.key}`}>
            <b>{counts[g.key] ?? 0}</b><small>{g.label}</small>
          </button>
        ))}
      </div>
      {work.isLoading ? <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the work…</div>
        : work.isError ? <div className="crm-card"><LoadFailed what="the open work" error={work.error} onRetry={() => work.refetch()} /></div>
          : !rows.length ? (
            <div className="crm-card"><div className="crm-empty" data-testid="dr-empty"><Scissors size={22} /><h3>Nothing due or waiting</h3><p>New stitching and alterations from Boutique show here as soon as they are taken.</p></div></div>
          ) : wide ? (
            <div className="crm-card dr-table-card">
              <table className="dr-table" data-testid="dr-table">
                <thead><tr><th>Where it stands</th><th>Customer</th><th>Work</th><th>Due</th><th>Balance</th><th>By</th></tr></thead>
                <tbody>
                  {shown.flatMap(g => rows.filter(g.test).map(w => {
                    const x = when(w);
                    return (
                      <tr key={`${g.key}-${w.id}`} onClick={() => open(w)} className="dr-row">
                        <td><span className={`dr-tag ${x.tone}`}>{x.tag}</span></td>
                        <td><Link to={`/customers/${w.customer.id}?tab=boutique`} onClick={e => e.stopPropagation()}>{w.customer.name}</Link>{w.customer.code && <small>{w.customer.code}</small>}</td>
                        <td>{w.service.name}{w.title && <small>{w.title}</small>}</td>
                        <td>{w.dates.due ? formatDay(w.dates.due) : '—'}</td>
                        <td>{w.balancePaise === null ? '—' : w.balancePaise === 0 ? 'Paid' : rupees(w.balancePaise)}</td>
                        <td>{w.staff ?? '—'}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          ) : (
            shown.map(g => {
              const list = rows.filter(g.test);
              if (!list.length) return null;
              return (
                <section key={g.key} className="dr-group" aria-label={g.label}>
                  <h2>{g.label}</h2>
                  {list.map(w => {
                    const x = when(w);
                    return (
                      <div key={w.id} className={`dr-item ${x.tone}`} data-testid="dr-item">
                        <button type="button" className="dr-open" onClick={() => open(w)}>
                          <span className={`dr-when ${x.tone}`}><b>{x.big}</b><small>{x.small}</small></span>
                          <span className="dr-what"><b>{w.customer.name}</b><small>{w.service.name}{w.title ? ` · ${w.title}` : ''}</small></span>
                          {w.balancePaise !== null && <span className="dr-bal"><b>{w.balancePaise === 0 ? 'Paid' : rupees(w.balancePaise)}</b>{w.balancePaise > 0 && <small>due</small>}</span>}
                        </button>
                        {w.customer.phone && <a className="dr-call" href={`tel:${w.customer.phone}`} aria-label={`Call ${w.customer.name}`}><Phone size={16} /></a>}
                      </div>
                    );
                  })}
                </section>
              );
            })
          )}
    </main>
  );
}
