import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListFilter, Plus, Loader2, ShieldOff, Sparkles } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useSegments } from '../hooks/useSegments';
import { formatRupees } from '../utils/money';
import { sentence, STARTERS } from '../utils/segmentWords';
import { rowLink } from '../components/common/rowLink';
import LoadFailed from '../components/LoadFailed';

/**
 * Segments (plan §6, screen 4): groups of customers by what they do. Each reads as a sentence and
 * shows, as of now, how many people are in it, what they have spent, and how many a WhatsApp could
 * reach. With none saved yet, the questions shops ask most, ready to try.
 */
export default function Segments() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const segments = useSegments();
  const mayManage = can('crm:segment:manage');

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  const list = segments.data ?? [];
  const tryStarter = (s) => navigate(`/segments/new?starter=${encodeURIComponent(s.name)}`);

  return (
    <main className="crm-page sg-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><ListFilter size={24} aria-hidden="true" /> Segments</h1>
          <p>Groups of customers by what they do: who to call, who to wish, who to message.</p>
        </div>
        <Link to="/segments/new" className="btn-primary sg-new"><Plus size={16} /> {mayManage ? 'New segment' : 'Try a segment'}</Link>
      </div>

      {segments.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading segments…</div>
      ) : segments.isError ? (
        <div className="crm-card"><LoadFailed what="the segments" error={segments.error} onRetry={() => segments.refetch()} /></div>
      ) : list.length === 0 ? (
        <section className="sg-empty" aria-labelledby="sg-start">
          <div className="sg-empty-head">
            <Sparkles size={20} aria-hidden="true" />
            <div>
              <h2 id="sg-start">No segments yet</h2>
              <p>Start from one of these, change it to suit your shop{mayManage ? ', and save it' : ''}.</p>
            </div>
          </div>
          <div className="sg-grid">
            {STARTERS.map(s => (
              <article key={s.name} data-testid="starter" {...rowLink(() => tryStarter(s), { label: `Try ${s.name}` })} className="crm-card sg-card sg-starter row-link">
                <h3>{s.name}</h3>
                <p className="sg-sentence">{sentence(s.rules)}</p>
                <p className="crm-muted">{s.why}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="sg-grid">
          {list.map(s => (
            <article key={s.id} data-testid="segment" {...rowLink(() => navigate(`/segments/${s.id}`), { label: `Open ${s.name}` })} className="crm-card sg-card row-link">
              <h3>{s.name}</h3>
              <p className="sg-sentence">{sentence(s.rules)}</p>
              <Numbers summary={s.summary} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

/** The three numbers every look at a segment gives. */
export function Numbers({ summary, big = false }) {
  const { people = 0, spent = 0, whatsappAgreed = 0 } = summary ?? {};
  return (
    <dl className={`sg-numbers${big ? ' big' : ''}`} data-testid="numbers">
      <div><dt>{people === 1 ? 'person' : 'people'}</dt><dd>{people.toLocaleString('en-IN')}</dd></div>
      <div><dt>spent in all</dt><dd>{formatRupees(spent)}</dd></div>
      <div><dt>can get WhatsApp</dt><dd>{whatsappAgreed.toLocaleString('en-IN')}</dd></div>
    </dl>
  );
}
