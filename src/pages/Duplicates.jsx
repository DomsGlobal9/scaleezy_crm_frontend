import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, GitMerge, Users, ShieldOff, Undo2, CheckCircle2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useMergeAction, useMerges } from '../hooks/useWork';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';
import LoadFailed from '../components/LoadFailed';

/**
 * Customers who may be one person (plan M1): side by side like a fitting comparison -- what matches
 * is quiet, what differs is marked -- and one decision: the same person (keep one, merge), or two
 * different people. Merges are undone from the "Merged" tab. Owner and admin only (plan §8).
 */
const REASON = {
  same_phone_other_name: 'Same phone number, different names. A family often shares one phone, so check before merging.',
  same_email_other_phone: 'Same email, different phone numbers. Often one person who changed their number.'
};
const SOURCE = { inventory: 'Inventory', pos: 'Till', boutique: 'Boutique' };

export default function Duplicates() {
  const { can } = usePermission();
  const [tab, setTab] = useState('open');
  const allowed = can('crm:customer:merge');
  const list = useMerges(tab, allowed);

  if (!allowed) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>Only an owner or admin can merge customers</h2>
        <p>Merging changes who a customer is everywhere in CRM, so it is kept to the shop's owner and admins.</p>
      </div></div>
    );
  }

  const items = list.data?.suggestions ?? [];

  return (
    <main className="crm-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Users size={26} /> Duplicates to review</h1>
          <p>CRM found records that may be one person. Nothing is merged until you say so.</p>
        </div>
        <div className="cp-chips" role="tablist" aria-label="Show">
          {[['open', 'To review'], ['merged', 'Merged'], ['dismissed', 'Kept apart']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`cp-chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
              {l}{k === 'open' && list.data?.open ? ` (${list.data.open})` : ''}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : list.isError ? (
        <div className="crm-card"><LoadFailed what="the customers to review" error={list.error} onRetry={() => list.refetch()} /></div>
      ) : items.length === 0 ? (
        <div className="crm-card"><div className="crm-empty">
          <CheckCircle2 size={26} />
          <h3>{tab === 'open' ? 'Nothing to review' : tab === 'merged' ? 'No merges yet' : 'Nothing kept apart yet'}</h3>
          <p>{tab === 'open' ? 'When the same phone or email turns up on two records, they appear here.' : 'Decisions you make on the To review tab are listed here.'}</p>
        </div></div>
      ) : (
        <div className="dp-list">{items.map(s => <Pair key={s.id} s={s} />)}</div>
      )}
    </main>
  );
}

/** One row of the comparison. Only details that say WHO someone is are compared; the rest is context. */
function Field({ label, a, b, show = (v) => v || '—', compare = true }) {
  const same = !compare || (a ?? '') === (b ?? '');
  return (
    <div className={`dp-field${!compare ? ' info' : same ? ' same' : ' diff'}`}>
      <span className="dp-label">{label}{!same && <em className="dp-differs">differs</em>}</span>
      <span>{show(a)}</span>
      <span>{show(b)}</span>
    </div>
  );
}

function Pair({ s }) {
  const act = useMergeAction();
  const [keep, setKeep] = useState(null);
  const sources = (x) => x.sources.map(k => SOURCE[k] ?? k).join(', ');

  return (
    <article className="crm-card dp-pair" data-testid="pair" data-id={s.id}>
      <p className="dp-why">{REASON[s.reason] ?? 'These may be one person.'}</p>
      <div className="dp-grid">
        <div className="dp-field dp-names">
          <span className="dp-label" />
          {[s.a, s.b].map(x => (
            <span key={x.id} className="dp-name">
              <Link to={`/customers/${x.id}`}>{x.name}</Link>
              <span className="crm-muted">{x.codes[0] ? `${x.codes[0]}, ` : ''}from {sources(x)}</span>
            </span>
          ))}
        </div>
        <Field label="Phone" a={s.a.phone} b={s.b.phone} show={(v) => (v ? formatPhone(v) : '—')} />
        <Field label="Email" a={s.a.email} b={s.b.email} />
        <Field compare={false} label="Spent" a={String(s.a.totalSpent)} b={String(s.b.totalSpent)} show={(v) => formatRupees(Number(v))} />
        <Field compare={false} label="Bills" a={String(s.a.bills)} b={String(s.b.bills)} />
        <Field compare={false} label="Last visit" a={s.a.lastVisit ? formatDay(s.a.lastVisit) : null} b={s.b.lastVisit ? formatDay(s.b.lastVisit) : null} show={(v) => v || 'Not yet'} />
        <Field compare={false} label="Customer since" a={formatDay(s.a.since)} b={formatDay(s.b.since)} />
      </div>

      {s.status === 'open' ? (
        <div className="dp-decide">
          <span className="dp-label" id={`keep-${s.id}`}>If they are one person, keep</span>
          <div className="cp-chips" role="radiogroup" aria-labelledby={`keep-${s.id}`}>
            {[s.a, s.b].map(x => (
              <button key={x.id} type="button" role="radio" aria-checked={keep === x.id} className={`cp-chip${keep === x.id ? ' on' : ''}`} onClick={() => setKeep(x.id)}>{x.name}</button>
            ))}
          </div>
          <div className="dp-actions">
            <button type="button" className="btn-primary" disabled={!keep || act.isPending} onClick={() => act.mutate({ id: s.id, action: 'merge', keepId: keep })}>
              <GitMerge size={14} /> Merge into {keep ? [s.a, s.b].find(x => x.id === keep).name : 'the one kept'}
            </button>
            <button type="button" className="btn-secondary" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'dismiss' })}>
              Different people
            </button>
          </div>
          <p className="wk-small">Merging puts both records' bills, notes and follow-ups on one customer. You can undo it from the Merged tab.</p>
        </div>
      ) : (
        <div className="dp-decide">
          <span className="crm-muted">{s.status === 'merged' ? 'Merged' : 'Kept apart'}{s.decidedBy ? ` by ${s.decidedBy}` : ''}{s.decidedAt ? `, ${formatDay(s.decidedAt)}` : ''}.</span>
          {s.status === 'merged' && (
            <button type="button" className="btn-secondary" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'undo' })}>
              <Undo2 size={14} /> Undo the merge
            </button>
          )}
        </div>
      )}
    </article>
  );
}
