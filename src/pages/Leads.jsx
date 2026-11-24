import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, MessageCircle, Phone, Plus, Sparkles, X } from 'lucide-react';
import { useShopServices } from '../hooks/useBoutique';
import { useLeads, useAddLead, useChangeLead, useAppointments, SOURCES, LOST_REASONS, sourceWords, ago, dayKey } from '../hooks/useBookings';
import { usePermission } from '../hooks/usePermission';
import BookSheet from '../components/BookSheet';
import ReplySheet from '../components/ReplySheet';
import LoadFailed from '../components/LoadFailed';

/**
 * Leads (the mockup approved 20 Nov), for a boutique on CRM: people who asked but have not ordered yet, newest
 * question first. Call, reply on WhatsApp (typed here, sent by CRM from the shop's number), book a time, or "not now"
 * with why. Their first bill or work makes them a customer by itself. A shop that does not use Boutique never has it.
 */
const SHOW = [
  { key: 'new', label: 'New' }, { key: 'talking', label: 'Talking' }, { key: 'booked', label: 'Booked' },
  { key: 'won', label: 'Became customers' }, { key: 'lost', label: 'Not now' }
];
const PILL = { new: 'New', talking: 'Talking', booked: 'Booked', won: 'Customer', lost: 'Not now' };

function NotNow({ lead, onClose }) {
  const change = useChangeLead();
  const [why, setWhy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const save = async (e) => {
    e.preventDefault();
    if (!why) return setError('Pick why.');
    try { await change.mutateAsync({ id: lead.id, status: 'lost', lostReason: why, ...(note.trim() ? { note: note.trim() } : {}) }); toast.success('Moved to Not now. They come back if they ask again.'); onClose(); }
    catch (err) { setError(err?.message || 'It could not be saved.'); }
  };
  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog bk-sheet" role="dialog" aria-modal="true" aria-labelledby="nn-title" onSubmit={save} data-testid="not-now">
        <header className="cr-head"><div style={{ minWidth: 0 }}><h2 id="nn-title">Not now</h2><p>{lead.customer?.name}</p></div><button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="bk-chips" role="radiogroup" aria-label="Why">
          {LOST_REASONS.map(r => <button key={r.key} type="button" role="radio" aria-checked={why === r.key} className={`bk-chip${why === r.key ? ' on' : ''}`} onClick={() => setWhy(r.key)}>{r.label}</button>)}
        </div>
        <label className="pe-field"><span>Note (optional)</span><input className="input-field" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Will think after Diwali" /></label>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns"><button type="submit" className="btn-primary" disabled={change.isPending}>{change.isPending && <Loader2 size={14} className="animate-spin" />} Save</button><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
      </form>
    </div>, document.body);
}

function AddLead({ onClose }) {
  const add = useAddLead();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState('counter');
  const [ask, setAsk] = useState('');
  const [error, setError] = useState(null);
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await add.mutateAsync({ phone, name: name.trim() || undefined, source, ask: ask.trim() || undefined });
      toast.success(r.created ? 'Lead added.' : r.reopened ? 'They asked before: their lead is open again.' : 'Already a lead: their question is updated.');
      onClose();
    } catch (err) { setError(err?.message || 'It could not be saved.'); }
  };
  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog bk-sheet" role="dialog" aria-modal="true" aria-labelledby="al-title" onSubmit={save} data-testid="add-lead">
        <header className="cr-head"><div style={{ minWidth: 0 }}><h2 id="al-title">Add a lead</h2><p>Someone who asked. The same number is always the same person.</p></div><button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="bk-two">
          <label className="pe-field"><span>Phone</span><input ref={box} className="input-field" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98480 22338" required data-testid="lead-phone" /></label>
          <label className="pe-field"><span>Name</span><input className="input-field" value={name} maxLength={200} onChange={e => setName(e.target.value)} placeholder="Kavya" data-testid="lead-name" /></label>
        </div>
        <label className="pe-field"><span>Where they asked</span>
          <select className="input-field" value={source} onChange={e => setSource(e.target.value)}>{SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        <label className="pe-field"><span>What they asked (optional)</span><textarea className="ms-area" rows={2} maxLength={1000} value={ask} onChange={e => setAsk(e.target.value)} placeholder="Bridal lehenga for a February wedding" data-testid="lead-ask" /></label>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns"><button type="submit" className="btn-primary" disabled={add.isPending || !phone.trim()} data-testid="lead-save">{add.isPending && <Loader2 size={14} className="animate-spin" />} Add lead</button><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
      </form>
    </div>, document.body);
}

export default function Leads() {
  const services = useShopServices();
  // Every shop keeps its leads here (retail too, 24 Nov).
  const using = true;
  const boutique = !!services.data?.using;
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const show = SHOW.some(s => s.key === params.get('show')) ? params.get('show') : 'new';
  const leads = useLeads(show, using);
  const diary = useAppointments({ from: dayKey(new Date()), to: dayKey(new Date()) }, using);
  const [reply, setReply] = useState(null);
  const [book, setBook] = useState(null);
  const [notNow, setNotNow] = useState(null);
  const [adding, setAdding] = useState(false);

  if (services.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div></main>;
  const counts = leads.data?.counts ?? {};
  const items = leads.data?.items ?? [];
  const canReply = can('crm:messages:send');

  return (
    <main className="crm-page ld-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Sparkles size={24} aria-hidden="true" /> Leads</h1>
          <p>People who asked but have not ordered yet. Their first order makes them a customer by itself.</p>
        </div>
        {can('crm:customer:create') && <button type="button" className="btn-primary ap-book" onClick={() => setAdding(true)} data-testid="lead-add"><Plus size={16} /> Add a lead</button>}
      </div>
      <div className="bk-chips ap-views" role="group" aria-label="Show">
        {SHOW.map(s => (
          <button key={s.key} type="button" aria-pressed={show === s.key} className={`bk-chip${show === s.key ? ' on' : ''}`} onClick={() => setParams(s.key === 'new' ? {} : { show: s.key }, { replace: true })} data-testid={`lead-show-${s.key}`}>
            {s.label} {counts[s.key] !== undefined && <i>{counts[s.key]}</i>}
          </button>
        ))}
      </div>

      {leads.isLoading ? <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the leads…</div>
        : leads.isError ? <div className="crm-card"><LoadFailed what="the leads" error={leads.error} onRetry={() => leads.refetch()} /></div>
          : items.length === 0 ? (
            <div className="crm-card"><div className="crm-empty" data-testid="lead-empty"><Sparkles size={22} />
              <h3>{show === 'new' ? 'No new leads' : show === 'won' ? 'No leads have ordered yet' : show === 'lost' ? 'Nobody in Not now' : `No one ${show === 'talking' ? 'being talked to' : 'booked'}`}</h3>
              <p>{show === 'new' ? (boutique ? 'Questions from Boutique\'s website form, Instagram, or "Add a lead" show here.' : 'Questions from Instagram, phone calls, the counter, or "Add a lead" show here.') : 'They show here as leads move on.'}</p>
            </div></div>
          ) : (
            <div className="ld-list">
              {items.map(l => (
                <article key={l.id} className={`ld-card ${l.stage}`} data-testid="lead">
                  <div className="ap-top">
                    <div className="ap-who">
                      <Link to={`/customers/${l.customer?.id}`}>{l.customer?.name}</Link>
                      <small>{sourceWords(l.source)} · {ago(l.askedAt)}</small>
                    </div>
                    <span className={`ap-pill ${l.stage === 'new' ? 'new' : l.stage === 'won' ? 'came' : l.stage === 'lost' ? 'cancelled' : 'booked'}`}>{PILL[l.stage]}</span>
                  </div>
                  {l.ask && <p className="ld-ask">“{l.ask}”</p>}
                  {(l.lastNote || l.lostReason) && <p className="ld-last">{l.stage === 'lost' && l.lostReason ? `Why: ${LOST_REASONS.find(r => r.key === l.lostReason)?.label ?? l.lostReason}. ` : ''}{l.lastNote ? `Last: ${l.changedBy ? `${l.changedBy}, ` : ''}${ago(l.lastContactAt ?? l.changedAt)}: “${l.lastNote}”` : ''}</p>}
                  {l.stage !== 'won' && (
                    <div className="ap-acts">
                      {l.customer?.phone && <a className="btn-primary bw-btn" href={`tel:${l.customer.phone}`}><Phone size={15} /> Call</a>}
                      {canReply && l.customer?.phone && <button type="button" className="btn-secondary bw-btn" onClick={() => setReply(l.id)} data-testid="lead-reply"><MessageCircle size={15} /> Reply</button>}
                      {can('crm:customer:update') && l.stage !== 'booked' && <button type="button" className="btn-secondary" onClick={() => setBook(l)} data-testid="lead-book">Book</button>}
                      {can('crm:customer:update') && l.stage !== 'lost' && <button type="button" className="btn-secondary" onClick={() => setNotNow(l)} data-testid="lead-notnow">Not now</button>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

      {reply && <ReplySheet leadId={reply} onClose={() => setReply(null)} onBook={(l) => { setReply(null); setBook(l); }} />}
      {book && <BookSheet customer={{ id: book.customer.id, name: book.customer.name }} staffNames={diary.data?.staff ?? []} reminders={diary.data?.reminders ?? true} boutique={boutique} onClose={() => setBook(null)} />}
      {notNow && <NotNow lead={notNow} onClose={() => setNotNow(null)} />}
      {adding && <AddLead onClose={() => setAdding(false)} />}
    </main>
  );
}
