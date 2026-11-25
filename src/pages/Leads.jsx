import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Inbox, Loader2, Plus, Search, X } from 'lucide-react';
import { useShopServices } from '../hooks/useBoutique';
import { useLeadInbox, useAddLead, SOURCES, ADD_SOURCES, sourceWords, ago, clock, dayName } from '../hooks/useBookings';
import { usePermission } from '../hooks/usePermission';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Select from '../components/common/Select';
import LeadPanel from '../components/LeadPanel';
import LoadFailed from '../components/LoadFailed';

/**
 * Leads (the inbox mockup approved 25 Nov): one place for everyone who showed interest and has not bought, wherever
 * they came from: WhatsApp messages, Shop floor visits and door check-ins that ended without a bill (all by
 * themselves), Instagram, calls, the website, a friend, a campaign, the Boutique app. Views for what needs the team now
 * (waiting for a reply, follow up today, mine, not taken, hot), each lead's source, and the open lead beside the list
 * on a laptop (on its own on a phone). Every shop; a boutique also sees its visits.
 */
const VIEWS = [
  { key: '', label: 'All open' }, { key: 'waiting', label: 'Waiting for a reply' }, { key: 'follow-up', label: 'Follow up today' },
  { key: 'mine', label: 'Mine' }, { key: 'unassigned', label: 'Not taken' }, { key: 'hot', label: 'Hot' }, { key: 'visits', label: 'Visits', boutique: true }
];
const STAGES = [
  { key: 'open', label: 'Open' }, { key: 'new', label: 'New' }, { key: 'talking', label: 'Talking' }, { key: 'booked', label: 'Booked', boutique: true },
  { key: 'won', label: 'Became customers' }, { key: 'lost', label: 'Not now' }, { key: 'all', label: 'All' }
];
const nameOf = (l) => (l.customer?.name && !/^\+?\d[\d\s]+$/.test(l.customer.name) ? l.customer.name : l.customer?.phone ?? 'Someone');
const waited = (iso) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} hr` : `${Math.round(m / 1440)} d`; };

function AddLead({ onClose, onAdded }) {
  const add = useAddLead();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState('instagram');
  const [detail, setDetail] = useState('');
  const [ask, setAsk] = useState('');
  const [error, setError] = useState(null);
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await add.mutateAsync({ phone, name: name.trim() || undefined, source, sourceDetail: detail.trim() || undefined, ask: ask.trim() || undefined });
      toast.success(r.created ? 'Lead added.' : r.reopened ? 'They asked before: their lead is open again.' : 'Already a lead: their question is added.');
      onAdded?.(r.lead);
      onClose();
    } catch (err) { setError(err?.message || 'It could not be saved.'); }
  };
  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog bk-sheet" role="dialog" aria-modal="true" aria-labelledby="al-title" onSubmit={save} data-testid="add-lead">
        <header className="cr-head"><div style={{ minWidth: 0 }}><h2 id="al-title">Add a lead</h2><p>Someone who asked on Instagram, on a call, at the counter… WhatsApp messages and walk-ins who left come in by themselves.</p></div><button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="bk-two">
          <label className="pe-field"><span>Phone</span><input ref={box} className="input-field" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98480 22338" required data-testid="lead-phone" /></label>
          <label className="pe-field"><span>Name</span><input className="input-field" value={name} maxLength={200} onChange={e => setName(e.target.value)} placeholder="Kavya" data-testid="lead-name" /></label>
        </div>
        <div className="bk-two">
          <label className="pe-field"><span>Where they asked</span>
            <Select value={source} onChange={e => setSource(e.target.value)} aria-label="Where they asked">{SOURCES.filter(s => ADD_SOURCES.includes(s.key)).map(s => <option key={s.key} value={s.key}>{s.long}</option>)}</Select>
          </label>
          <label className="pe-field"><span>Which one (optional)</span><input className="input-field" value={detail} maxLength={120} onChange={e => setDetail(e.target.value)} placeholder="Reel: Kanchi silk launch" data-testid="lead-detail" /></label>
        </div>
        <label className="pe-field"><span>What they asked (optional)</span><textarea className="ms-area" rows={2} maxLength={1000} value={ask} onChange={e => setAsk(e.target.value)} placeholder="Bridal lehenga for a February wedding" data-testid="lead-ask" /></label>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns"><button type="submit" className="btn-primary" disabled={add.isPending || !phone.trim()} data-testid="lead-save">{add.isPending && <Loader2 size={14} className="animate-spin" />} Add lead</button><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
      </form>
    </div>, document.body);
}

function Row({ l, on, onOpen }) {
  return (
    <button type="button" className={`ld-row${on ? ' on' : ''}${l.unread ? ' unread' : ''}`} onClick={() => onOpen(l.id)} data-testid="lead" aria-current={on ? 'true' : undefined}>
      <span className="ld-row-top">
        <b>{nameOf(l)}</b>
        {l.waiting ? <span className="ld-wait" title="Waiting for a reply">{waited(l.waitingSince)}</span>
          : l.followUpDue ? <span className="ld-due">Follow up today</span>
            : l.nextVisit ? <span className="crm-muted">{dayName(l.nextVisit.at)}, {clock(l.nextVisit.at)}</span>
              : <span className="crm-muted">{ago(l.lastContactAt ?? l.askedAt)}</span>}
      </span>
      <span className="ld-row-meta">
        <span className={`ld-src s-${l.source}`}>{sourceWords(l.source)}</span>
        {l.unread > 0 && <span className="ld-unread" aria-label={`${l.unread} unread`}>{l.unread}</span>}
        <span className="crm-muted ld-owner">{l.owner ? l.owner.name : 'Not taken'}</span>
        {l.temperature && <span className={`ld-temp t-${l.temperature}`}>{l.temperature[0].toUpperCase() + l.temperature.slice(1)}</span>}
        {l.stage === 'won' && <span className="ap-pill came">Customer</span>}
        {l.stage === 'lost' && <span className="ap-pill cancelled">Not now</span>}
      </span>
      {l.ask && <span className="ld-row-text">“{l.ask}”</span>}
    </button>
  );
}

export default function Leads() {
  const services = useShopServices();
  const boutique = !!services.data?.using;
  const { can } = usePermission();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [params, setParams] = useSearchParams();
  // An old link (?show=visits, from a customer's page) still opens the visits.
  const rawView = params.get('show') === 'visits' ? 'visits' : params.get('view') ?? '';
  const view = VIEWS.some(v => v.key === rawView && (!v.boutique || boutique)) ? rawView : '';
  const stage = STAGES.some(s => s.key === params.get('show')) ? params.get('show') : 'open';
  const source = SOURCES.some(s => s.key === params.get('source')) ? params.get('source') : '';
  const open = params.get('lead');
  const [typed, setTyped] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(typed.trim());
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);

  const leads = useLeadInbox({ show: view ? 'all' : stage, ...(view ? { view } : {}), ...(source ? { source } : {}), ...(q ? { q } : {}) });
  const [adding, setAdding] = useState(false);

  const set = (next) => {
    const merged = { view, show: stage === 'open' ? '' : stage, source, q, lead: open ?? '', ...next };
    if (merged.view) merged.show = '';
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)), { replace: true });
  };
  useEffect(() => { if (q !== (params.get('q') ?? '')) set({ q }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = leads.data?.items ?? [];
  const views = leads.data?.views ?? {};
  const sources = leads.data?.sources ?? {};

  // A laptop opens the first lead by itself; a phone shows the list until one is tapped.
  useEffect(() => { if (wide && !open && items[0]) set({ lead: items[0].id }); }, [wide, open, items[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = view === 'waiting' ? 'Nobody is waiting for a reply' : view === 'follow-up' ? 'No follow-ups today' : view === 'mine' ? 'No leads of yours'
    : view === 'unassigned' ? 'Every lead is taken' : view === 'hot' ? 'No hot leads' : view === 'visits' ? 'No visits booked' : 'No leads here';

  const list = (
    <section className="ld-list-pane" aria-label="Leads">
      <div className="ld-tools">
        <div className="bk-chips ld-views" role="group" aria-label="Show">
          {VIEWS.filter(v => !v.boutique || boutique).map(v => (
            <button key={v.key || 'all'} type="button" aria-pressed={view === v.key} className={`bk-chip${view === v.key ? ' on' : ''}${v.key === 'waiting' && views.waiting ? ' warn' : ''}`} onClick={() => set({ view: v.key, show: '', lead: '' })} data-testid={`lead-view-${v.key || 'all'}`}>
              {v.label}{v.key && views[v.key] !== undefined && <i>{views[v.key]}</i>}
            </button>
          ))}
        </div>
        <div className="ld-filters">
          <label className="ld-search"><Search size={15} aria-hidden="true" /><input className="input-field" type="search" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Name, number or what they asked" aria-label="Search leads" data-testid="lead-search" /></label>
          {!view && (
            <Select value={stage} onChange={(e) => set({ show: e.target.value === 'open' ? '' : e.target.value, lead: '' })} aria-label="Stage">
              {STAGES.filter(s => !s.boutique || boutique).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          )}
        </div>
        {(Object.keys(sources).length > 0 || source) && (
          <div className="bk-chips ld-sources" role="group" aria-label="Where they came from">
            <button type="button" className={`bk-chip${!source ? ' on' : ''}`} aria-pressed={!source} onClick={() => set({ source: '', lead: '' })} data-testid="lead-source-all">Every source</button>
            {SOURCES.filter(s => sources[s.key] || source === s.key).map(s => (
              <button key={s.key} type="button" className={`bk-chip${source === s.key ? ' on' : ''}`} aria-pressed={source === s.key} onClick={() => set({ source: source === s.key ? '' : s.key, lead: '' })} data-testid={`lead-source-${s.key}`}>
                <span className={`ld-dot s-${s.key}`} aria-hidden="true" />{s.label} <i>{sources[s.key] ?? 0}</i>
              </button>
            ))}
          </div>
        )}
      </div>
      {leads.isLoading ? <p className="crm-muted ld-pad" aria-busy="true"><Loader2 size={14} className="animate-spin" /> Loading the leads…</p>
        : leads.isError ? <div className="ld-pad"><LoadFailed what="the leads" error={leads.error} onRetry={() => leads.refetch()} /></div>
          : items.length === 0 ? (
            <div className="crm-empty ld-pad" data-testid="lead-empty"><Inbox size={22} aria-hidden="true" />
              <h3>{q ? `Nobody matches “${q}”` : empty}</h3>
              <p>WhatsApp messages, Shop floor visits and door check-ins that end without a bill come here by themselves. Add someone who asked on Instagram or on a call with “Add a lead”.</p>
            </div>
          ) : <div className="ld-rows">{items.map(l => <Row key={l.id} l={l} on={open === l.id} onOpen={(id) => set({ lead: id })} />)}</div>}
    </section>
  );

  return (
    <main className="crm-page ld-page">
      {!(open && !wide) && (
        <div className="crm-head">
          <div style={{ minWidth: 0 }}>
            <h1><Inbox size={24} aria-hidden="true" /> Leads</h1>
            <p>Everyone who showed interest and has not bought yet, wherever they came from.</p>
          </div>
          {can('crm:customer:create') && <button type="button" className="btn-primary ap-book" onClick={() => setAdding(true)} data-testid="lead-add"><Plus size={16} /> Add a lead</button>}
        </div>
      )}
      {wide ? (
        <div className="crm-card ld-inbox">
          {list}
          <section className="ld-open-pane" aria-label="The open lead">
            {open ? <LeadPanel key={open} id={open} boutique={boutique} /> : <div className="lp-empty crm-muted">Choose a lead to see what they asked and everything said since.</div>}
          </section>
        </div>
      ) : open ? (
        <div className="crm-card ld-phone-open"><LeadPanel key={open} id={open} boutique={boutique} onBack={() => set({ lead: '' })} /></div>
      ) : <div className="crm-card ld-inbox-phone">{list}</div>}
      {adding && <AddLead onClose={() => setAdding(false)} onAdded={(l) => l?.id && set({ lead: l.id })} />}
    </main>
  );
}
