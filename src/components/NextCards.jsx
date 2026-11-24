import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Check, Gift, Loader2, Send, Star, Wallet, X, ShoppingBag } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { formatDay } from '../utils/dates';
import {
  useLevel, useDues, useRemindDues, useStopDues, useReferral, useMakeCode, useUseCode, lookupCode,
  usePickChoices, usePicksSent, useSendPicks, rupees, rupeesFromPaise
} from '../hooks/useNext';

/**
 * A customer's page, the side column (the mockups approved 19 Nov): their level and how far to the next (C9), what
 * they owe and when they were reminded (C7), bring a friend (C8), and Send picks (A3). Each card shows only when it
 * has something to say: no levels, nothing owed, bring a friend off: no card.
 */
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'them';

export function LevelCard({ customerId }) {
  const q = useLevel(customerId);
  if (!q.data?.levels) return null;
  const { level, next, spent, days } = q.data;
  const span = days >= 360 && days <= 370 ? 'the last 12 months' : `the last ${days} days`;
  return (
    <section className="crm-card wk-card nx-card" aria-labelledby="nx-level-h" data-testid="level-card">
      <div className="wk-head"><h2 id="nx-level-h">Level</h2>{level && <span className="nx-badge"><Star size={13} aria-hidden="true" /> {level.name}</span>}</div>
      <p className="nx-big">{rupees(spent)} <small>spent in {span}</small></p>
      {level?.perk && <p className="nx-line">{level.name}: {level.perk}{level.pointsPer100 ? ` · ${level.pointsPer100} point${level.pointsPer100 === 1 ? '' : 's'} per ₹100` : ''}</p>}
      {next ? <p className="nx-line">{next.need > 0 ? <><b>{rupees(next.need)}</b> more for {next.name}</> : <>Spent enough for {next.name}: it shows after tonight's update.</>}</p>
        : level ? <p className="nx-line crm-muted">The shop's top level.</p> : null}
      {next && next.minSpend > 0 && <div className="nx-bar" role="progressbar" aria-label={`Towards ${next.name}`} aria-valuemin={0} aria-valuemax={next.minSpend} aria-valuenow={Math.min(spent, next.minSpend)}><span style={{ width: `${Math.min(100, Math.round((spent / next.minSpend) * 100))}%` }} /></div>}
    </section>
  );
}

export function MoneyOwedCard({ customerId }) {
  const { can } = usePermission();
  const q = useDues(customerId);
  const remind = useRemindDues(customerId);
  const stop = useStopDues(customerId);
  if (!q.data || (q.data.totalPaise <= 0 && !q.data.reminders.length)) return null;
  const d = q.data;
  const doRemind = async () => {
    try { const r = await remind.mutateAsync(); toast.success(r?.sent?.links ? 'Reminder sent on WhatsApp, with a link to pay online.' : 'Reminder sent on WhatsApp.'); }
    catch (e) { toast.error(e?.message || 'It could not be sent.'); }
  };
  return (
    <section className="crm-card wk-card nx-card nx-owed" aria-labelledby="nx-owed-h" data-testid="dues-card">
      <div className="wk-head"><h2 id="nx-owed-h"><Wallet size={15} aria-hidden="true" /> Owes the shop</h2></div>
      {d.totalPaise > 0 ? <p className="nx-big">{rupeesFromPaise(d.totalPaise)} <small>oldest {d.oldestDays} day{d.oldestDays === 1 ? '' : 's'}</small></p> : <p className="crm-muted">Nothing owed now.</p>}
      {d.items.length > 0 && (
        <ul className="nx-list">
          {d.items.map(i => <li key={i.orderId}><span>Bill {i.orderNumber ?? ''} · {i.kind === 'kept' ? 'kept order' : 'pay later'}{i.payAt === 'till' ? ' · at the counter' : ' · pay link'}</span><b>{rupeesFromPaise(i.amountPaise)}</b></li>)}
        </ul>
      )}
      <p className="nx-line crm-muted">
        {d.reminders[0] ? `Reminded ${formatDay(d.reminders[0].at)}` : 'Not reminded yet'}
        {d.stopped ? ' · reminders stopped' : d.nextOn ? ` · next on ${formatDay(`${d.nextOn}T12:00`)}` : ''}
      </p>
      {can('crm:customer:update') && d.totalPaise > 0 && (
        <div className="nx-acts">
          <button type="button" className="btn-primary cp-btn" disabled={remind.isPending} onClick={doRemind} data-testid="dues-remind">{remind.isPending && <Loader2 size={14} className="animate-spin" />} Remind now</button>
          <button type="button" className="pe-chg" disabled={stop.isPending} onClick={() => stop.mutate(!d.stopped)} data-testid="dues-stop">{d.stopped ? 'Start reminders again' : 'Stop reminders'}</button>
        </div>
      )}
    </section>
  );
}

export function BringAFriendCard({ customerId, name }) {
  const { can } = usePermission();
  const q = useReferral(customerId);
  const make = useMakeCode(customerId);
  const use = useUseCode(customerId);
  const [typed, setTyped] = useState('');
  const [whose, setWhose] = useState(null);
  useEffect(() => {
    const code = typed.trim();
    setWhose(null);
    if (code.length < 5) return undefined;
    const t = setTimeout(() => lookupCode(code).then(r => setWhose({ ok: true, name: r.customer.name })).catch(e => setWhose({ ok: false, why: e?.message })), 350);
    return () => clearTimeout(t);
  }, [typed]);
  if (!q.data) return null;
  const d = q.data;
  if (!d.on && !d.code && !d.friends.length && !d.sentBy) return null;
  const mayChange = can('crm:customer:update');
  const save = async () => {
    try { await use.mutateAsync(typed.trim()); toast.success(`Both get ${d.points} points when ${firstOf(name)}'s first bill is saved.`); setTyped(''); }
    catch (e) { toast.error(e?.message || 'It could not be saved.'); }
  };
  return (
    <section className="crm-card wk-card nx-card" aria-labelledby="nx-ref-h" data-testid="referral-card">
      <div className="wk-head"><h2 id="nx-ref-h"><Gift size={15} aria-hidden="true" /> Bring a friend</h2><small className="cg-sub">{d.points} points each</small></div>
      {d.code ? <p className="nx-code" data-testid="referral-code">{d.code}</p>
        : mayChange && d.on ? <button type="button" className="btn-secondary cp-btn" disabled={make.isPending} onClick={() => make.mutate()} data-testid="referral-make">Give {firstOf(name)} a code to share</button> : null}
      {d.friends.length > 0 && (
        <ul className="nx-list">
          {d.friends.map(f => <li key={f.id}><span>{f.name}</span><span className={f.status === 'credited' ? 'nx-ok' : 'crm-muted'}>{f.status === 'credited' ? `first bill · +${f.points} each` : f.status === 'refused' ? 'points not added' : 'not bought yet'}</span></li>)}
        </ul>
      )}
      {d.sentBy ? <p className="nx-line">Came with <b>{d.sentBy.name}</b>'s code · {d.sentBy.status === 'credited' ? 'points added' : d.sentBy.status === 'refused' ? (d.sentBy.note || 'points not added') : 'points on the first bill'}</p>
        : d.on && mayChange && (
          <div className="nx-use">
            <label className="pe-field"><span>Who sent {firstOf(name)}? Friend's code</span>
              <input className="input-field" value={typed} onChange={e => setTyped(e.target.value.toUpperCase())} placeholder="ANJALI-7K2" maxLength={20} data-testid="referral-input" />
            </label>
            {whose && <p className={whose.ok ? 'nx-ok' : 'pe-err'} data-testid="referral-whose">{whose.ok ? <><Check size={13} /> {whose.name}</> : whose.why}</p>}
            {whose?.ok && <button type="button" className="btn-primary cp-btn" disabled={use.isPending} onClick={save} data-testid="referral-save">Save</button>}
          </div>
        )}
    </section>
  );
}

export function PicksSheet({ customerId, name, onClose, asReply = false }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState([]);
  const params = { ...(all ? { all: '1' } : {}), ...(q.trim().length >= 2 ? { q: q.trim() } : {}) };
  const list = usePickChoices(customerId, params, true);
  const send = useSendPicks(customerId);
  const box = useRef(null);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const flip = (id) => setChosen(c => c.includes(id) ? c.filter(x => x !== id) : c.length >= 6 ? c : [...c, id]);
  const go = async () => {
    try {
      const r = await send.mutateAsync(chosen);
      if (r.sent || r.queued) { toast.success(`Sent to ${firstOf(name)} on WhatsApp: the pieces, with a link to buy them online.`); onClose(); }
      else toast.error(r.reason || 'It could not be sent.');
    } catch (e) { toast.error(e?.message || 'It could not be sent.'); }
  };
  const pieces = list.data?.pieces ?? [];
  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cr-dialog bk-sheet nx-picks" role="dialog" aria-modal="true" aria-labelledby="pk-title" data-testid="picks-sheet">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}><h2 id="pk-title">Send picks to {firstOf(name)}</h2><p>{chosen.length} of 6 chosen · in stock, with a photo</p></div>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="bk-two">
          <input ref={box} className="input-field" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a piece" aria-label="Find a piece" />
          <div className="bk-chips"><button type="button" className={`bk-chip${!all ? ' on' : ''}`} aria-pressed={!all} onClick={() => setAll(false)}>In stock here</button><button type="button" className={`bk-chip${all ? ' on' : ''}`} aria-pressed={all} onClick={() => setAll(true)}>All stores</button></div>
        </div>
        {list.isLoading ? <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading the pieces…</p>
          : list.isError ? <p className="pe-err">{list.error?.message || 'The pieces could not be loaded.'}</p>
          : pieces.length === 0 ? <p className="crm-muted" data-testid="picks-none">No pieces to send: only pieces shown online, with a photo and in stock, can be picked.</p>
          : (
            <ul className="nx-grid" aria-label="Pieces">
              {pieces.map(p => {
                const on = chosen.includes(p.variantId);
                return (
                  <li key={p.variantId}>
                    <button type="button" className={`nx-piece${on ? ' on' : ''}`} aria-pressed={on} onClick={() => flip(p.variantId)} data-testid="pick">
                      <span className="nx-photo">{p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" /> : <ShoppingBag size={22} />}{on && <span className="nx-tick"><Check size={14} /></span>}</span>
                      <b>{p.title}</b><small>{[p.colour, p.size, p.priceRupees ? rupees(p.priceRupees) : null].filter(Boolean).join(' · ')}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        <p className="pe-hint">{asReply ? 'A reply to what they asked: one link to see, try on and buy these online. A bill through the link is credited to you.' : "Only to customers who agreed to offers; it counts as the shop's one offer in 3 days. A bill through the link is credited to you."}</p>
        <div className="pe-btns">
          <button type="button" className="btn-primary bk-go" disabled={!chosen.length || send.isPending} onClick={go} data-testid="picks-send">{send.isPending && <Loader2 size={14} className="animate-spin" />} Send {chosen.length || ''} pick{chosen.length === 1 ? '' : 's'}</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>, document.body);
}

export function SendPicksCard({ customerId, name, phone, consent }) {
  const { can } = usePermission();
  const sent = usePicksSent(customerId);
  const [open, setOpen] = useState(false);
  if (!can('crm:customer:update') || !phone) return null;
  const last = sent.data?.[0];
  return (
    <section className="crm-card wk-card nx-card" aria-labelledby="nx-picks-h" data-testid="picks-card">
      <div className="wk-head"><h2 id="nx-picks-h"><Send size={15} aria-hidden="true" /> Send picks</h2></div>
      <p className="nx-line crm-muted">A few pieces they would like, with one link to see and try them on.</p>
      {last && <p className="nx-line">Last sent {formatDay(last.sentAt)}{last.by ? ` by ${last.by}` : ''}{last.credited ? ' · bought from it' : ''}</p>}
      {consent?.whatsappOffers && !consent?.stoppedAt
        ? <button type="button" className="btn-secondary cp-btn" onClick={() => setOpen(true)} data-testid="picks-open">Choose pieces</button>
        : <p className="nx-line crm-muted" data-testid="picks-no-consent">{consent?.stoppedAt ? 'They replied STOP, so picks cannot be sent.' : `${firstOf(name)} has not agreed to offers on WhatsApp, so picks cannot be sent yet.`}</p>}
      {open && <PicksSheet customerId={customerId} name={name} onClose={() => setOpen(false)} />}
    </section>
  );
}
