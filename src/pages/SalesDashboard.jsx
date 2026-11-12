import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LayoutDashboard, Loader2, MapPin, Search, ShieldOff, UserPlus, DoorOpen, ListChecks, Hand, X, ChevronDown } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useStores } from '../hooks/useCounter';
import { useAddCustomer, useCloseVisit, useFindCustomer, useNotHere, useSalesDashboard, useStartVisit } from '../hooks/useSales';
import { readStore, STORE_KEY } from '../components/WhatTheyWear';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { minutesAgo } from './Counter';
import Select from '../components/common/Select';
import LoadFailed from '../components/LoadFailed';
import SalesCues from '../components/SalesCues';

/**
 * Shop floor (the owner's OK, 11 Nov): the salesperson's own screen. The customer in front of them
 * comes first: who is in the shop (door QR, or started here by phone), what to know before saying hello,
 * and one tap to look after them. Then who to talk to today, and their own week.
 */
export default function SalesDashboard() {
  const { can, isOwner } = usePermission();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState(readStore);
  const stores = useStores();
  const storeList = stores.data ?? [];
  const store = storeList.find(s => s.id === storeId) ?? null;
  const dash = useSalesDashboard(store?.name);
  const start = useStartVisit();
  const d = dash.data;

  useEffect(() => { try { storeId ? localStorage.setItem(STORE_KEY, storeId) : localStorage.removeItem(STORE_KEY); } catch { /* fine */ } }, [storeId]);
  // Only one store to work in (the shop's only store, or the only one Team members gives them): that one.
  // A remembered store that is not one of theirs any more is dropped.
  useEffect(() => {
    if (!storeList.length) return;
    if (storeId && !storeList.some(s => s.id === storeId)) setStoreId(storeList.length === 1 ? storeList[0].id : '');
    else if (!storeId && storeList.length === 1) setStoreId(storeList[0].id);
  }, [storeList, storeId]);

  const serve = async (body) => {
    try {
      const v = await start.mutateAsync({ ...body, storeName: store?.name ?? null, locationId: store?.id ?? null });
      navigate(`/sales/visit/${v.id}`);
    } catch (err) { toast.error(err?.message || 'Could not start serving this customer.'); }
  };

  if (!can('crm:sales')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const first = (d?.me?.name ?? '').trim().split(/\s+/)[0];

  return (
    <main className="crm-page sd-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><LayoutDashboard size={24} aria-hidden="true" /> Shop floor</h1>
          <p>{hello}{first ? `, ${first}` : ''}. The customer in front of you first.</p>
        </div>
        {storeList.length > 0 && (
          <div className="ct-store">
            <MapPin size={15} aria-hidden="true" />
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Your store">
              <option value="">Choose your store</option>
              {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      {d && (
        <div className="sd-stats" data-testid="sd-stats">
          <div className="crm-card sd-stat"><b>{d.stats.inShop}</b><span>in the shop</span></div>
          <div className="crm-card sd-stat"><b>{d.stats.toTalk}</b><span>to talk to today</span></div>
          <div className="crm-card sd-stat"><b>{formatRupees(d.stats.broughtBack)}</b><span>brought back this week</span></div>
        </div>
      )}

      <FindCustomer onServe={serve} busy={start.isPending} mayAdd={can('crm:customer:create')} needsStore={!store && storeList.length > 0} />

      <section aria-labelledby="sd-in-h">
        <div className="td-sec-head"><h2 id="sd-in-h"><DoorOpen size={17} aria-hidden="true" /> In the shop now</h2><span className="crm-muted">From the door QR, and customers started here</span></div>
        {dash.isLoading ? (
          <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Checking the shop…</div>
        ) : dash.isError ? (
          <div className="crm-card"><LoadFailed what="the Shop floor" error={dash.error} onRetry={() => dash.refetch()} /></div>
        ) : d.inShop.length === 0 ? (
          <div className="crm-card ct-quiet" data-testid="sd-nobody">Nobody in the shop yet. When a customer comes to you, type their number above.</div>
        ) : (
          <ul className="sd-people">
            {d.inShop.map(p => (
              <li key={p.key} className={`crm-card sd-person${!p.taken ? ' free' : ''}${p.taken?.byMe ? ' mine' : ''}`} data-testid="sd-person">
                <div className="sd-person-top">
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.name || (p.phone ? formatPhone(p.phone) : 'Someone')}</strong>
                    <span className="crm-muted"> · {p.via === 'door' ? `came in ${minutesAgo(p.since)}` : `started ${minutesAgo(p.since)}`}</span>
                  </div>
                  <span className={`sd-tag${!p.taken ? ' warn' : p.taken.byMe ? ' good' : ''}`} data-testid="sd-taken">
                    {!p.taken ? 'Nobody yet' : p.taken.byMe ? 'With you' : <><Hand size={12} aria-hidden="true" /> With {p.taken.byName || 'someone'}</>}
                  </span>
                </div>
                {p.customerId ? <SalesCues cues={p.cues} max={4} /> : <p className="crm-muted sd-small">Not a customer yet. Add their name when you take them.</p>}
                <div className="sd-actions">
                  {p.taken?.byMe && p.taken.visitId && <Link className="btn-primary" to={`/sales/visit/${p.taken.visitId}`}>Continue</Link>}
                  {!p.taken && <button type="button" className="btn-primary" disabled={start.isPending} onClick={() => serve({ arrivalId: p.arrivalId, customerId: p.customerId })} data-testid="sd-take">I'll take her</button>}
                  {p.customerId && <Link className="btn-secondary" to={`/customers/${p.customerId}`}>Full story</Link>}
                  <CloseCard person={p} isOwner={isOwner} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d && d.toTalk.length > 0 && (
        <section aria-labelledby="sd-talk-h">
          <div className="td-sec-head"><h2 id="sd-talk-h"><ListChecks size={17} aria-hidden="true" /> To talk to today</h2><Link to="/today" className="si-link">See all {d.stats.toTalk}</Link></div>
          <ul className="crm-card sd-talk">
            {d.toTalk.map(t => (
              <li key={t.key}><Link to={`/customers/${t.customerId}`}><strong>{t.name}</strong></Link> <span className="crm-muted">· {TALK_WHY[t.kind] ?? 'to talk to'}</span></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const TALK_WHY = { promise: 'you promised to get back to them', stock: 'asked to be told when something comes in', notseen: 'a regular you have not seen lately' };

/** "Customer with you?": their number (or name, or a bill), then one tap to look after them, or add them. */
function FindCustomer({ onServe, busy, mayAdd, needsStore }) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  const found = useFindCustomer(q);
  const f = found.data;
  const isPhone = !!f?.phone;
  return (
    <section className="crm-card sd-find" aria-labelledby="sd-find-h">
      <h2 id="sd-find-h">Customer with you?</h2>
      <div className="ct-phone">
        <Search size={18} aria-hidden="true" />
        <input className="input-field" type="search" autoComplete="off" placeholder="Their mobile number, name or a bill number" aria-label="Their mobile number, name or a bill number"
          value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="sd-find" />
      </div>
      {needsStore && <p className="sd-small sd-warn">Choose your store at the top first: the pieces you show are the ones in stock there.</p>}
      {found.isError && <p className="si-error" role="alert">{found.error?.message}</p>}
      {f && f.people.length > 0 && (
        <ul className="sd-found" data-testid="sd-found">
          {f.people.map(p => (
            <li key={p.id}>
              <div style={{ minWidth: 0 }}><strong>{p.name}</strong> <span className="crm-muted">{p.phone ? formatPhone(p.phone) : ''}{p.matched ? ` · ${p.matched}` : ''}</span></div>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onServe({ customerId: p.id })} data-testid="sd-serve">I'll take her</button>
            </li>
          ))}
        </ul>
      )}
      {f && isPhone && f.people.length === 0 && (
        mayAdd ? <AddCustomer phone={f.phone} near={f.near} onServe={onServe} busy={busy} />
          : <p className="sd-small" data-testid="sd-not-customer">Nobody has {formatPhone(f.phone)} yet. Adding customers is not part of your role.</p>
      )}
      {f && !isPhone && q.length >= 2 && f.people.length === 0 && <p className="crm-muted sd-small">Nobody found. For a new customer, type their mobile number.</p>}
      <button type="button" className="si-link sd-nophone" disabled={busy} onClick={() => onServe({})} data-testid="sd-no-phone">No phone? Continue without one</button>
    </section>
  );
}

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A new customer: their name, their answer about WhatsApp offers (asked, never assumed), a birthday if they like. */
/**
 * Closing a card (the owner, 12 Nov). A walk-in nobody took: "Not here". A visit: "She left" (ends it as
 * Finish does, no sale) or "Started by mistake" (deleted, nothing saved). Visits only for the person
 * serving them and the owner. The choice itself is the confirm; "Keep" backs out.
 */
function CloseCard({ person: p, isOwner }) {
  const [open, setOpen] = useState(false);
  const close = useCloseVisit();
  const notHere = useNotHere();
  const who = (p.name ?? '').trim().split(/\s+/)[0] || 'them';
  const visitId = p.taken?.visitId;
  const mayClose = !!visitId && (p.taken.byMe || isOwner);
  const mayNotHere = !!p.arrivalId && !visitId;
  if (!mayClose && !mayNotHere) return null;
  const run = async (fn, done) => { try { await fn(); toast.success(done); setOpen(false); } catch (err) { toast.error(err?.message || 'That could not be done just now. Try again.'); } };
  return (
    <>
      <button type="button" className="si-link sd-close" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="sd-close">
        {mayNotHere ? <><X size={13} aria-hidden="true" /> Not here</> : <>Close <ChevronDown size={13} aria-hidden="true" /></>}
      </button>
      {open && (
        <div className="sd-close-box" role="group" aria-label={`Close ${who}'s card`} data-testid="sd-close-box">
          {mayNotHere ? (
            <>
              <p className="sd-small">Not here? Their card goes. The door scan stays on their timeline.</p>
              <div className="sd-actions">
                <button type="button" className="btn-primary" disabled={notHere.isPending} onClick={() => run(() => notHere.mutateAsync(p.arrivalId), 'Taken off the list.')} data-testid="sd-not-here">Yes, not here</button>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Keep</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="sd-close-choice" disabled={close.isPending} onClick={() => run(() => close.mutateAsync({ visitId, how: 'left' }), `Visit closed. Saved on ${p.customerId ? `${who}'s` : 'the'} timeline.`)} data-testid="sd-close-left">
                <b>{p.customerId ? `${who[0].toUpperCase()}${who.slice(1)} left` : 'They left'}</b><span>Ends the visit with no sale. What they tried is saved on their timeline.</span>
              </button>
              <button type="button" className="sd-close-choice danger" disabled={close.isPending} onClick={() => run(() => close.mutateAsync({ visitId, how: 'mistake' }), 'Visit removed.')} data-testid="sd-close-mistake">
                <b>Remove: started by mistake</b><span>Deletes this visit. Nothing is saved{p.arrivalId ? ', and the walk-in is back to "Nobody yet"' : ''}.</span>
              </button>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Keep</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function AddCustomer({ phone, near, onServe, busy }) {
  const add = useAddCustomer();
  const [name, setName] = useState('');
  const [offers, setOffers] = useState(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [error, setError] = useState(null);
  const [suggest, setSuggest] = useState(near ?? []);
  useEffect(() => { setSuggest(near ?? []); }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (confirmNew = false) => {
    setError(null);
    try {
      const r = await add.mutateAsync({ name, phone, offers: offers === 'yes' ? true : offers === 'no' ? false : undefined, birthday: day && month ? `${month}-${day}` : undefined, confirmNew });
      if (!r.customerId && r.near?.length) { setSuggest(r.near); return; }
      if (typeof r.offers === 'string' && !['saved', 'not_asked'].includes(r.offers)) toast(`${r.name} is added. Her answer about offers was not saved: ${r.offers}`);
      else toast.success(r.existing ? `${r.name} already has this number: opening her.` : `${r.name} is added. The till finds her by this number.`);
      onServe({ customerId: r.customerId });
    } catch (err) { setError(err?.message || 'She could not be added just now. Try again.'); }
  };
  return (
    <div className="sd-add" data-testid="sd-add">
      <p className="sd-small"><UserPlus size={15} aria-hidden="true" /> <strong>Not a customer yet.</strong> Nobody has {formatPhone(phone)}.</p>
      {suggest.length > 0 && (
        <div className="sd-near" role="status" data-testid="sd-near">
          {suggest.map(n => (
            <div key={n.id} className="sd-near-row"><span><b>Is this {n.name}?</b> {formatPhone(n.phone)} differs by one digit.</span>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onServe({ customerId: n.id })}>Yes, it's her</button></div>
          ))}
        </div>
      )}
      <label className="sd-field"><span>Name</span><input className="input-field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Her name" data-testid="sd-name" /></label>
      <div className="sd-field"><span>May we send her offers on WhatsApp? Ask her.</span>
        <div className="sd-chips" role="radiogroup" aria-label="Offers on WhatsApp">
          {[['yes', 'She said yes'], ['no', 'She said no'], [null, "Didn't ask"]].map(([k, l]) => (
            <button key={l} type="button" role="radio" aria-checked={offers === k} className={`sd-chip${offers === k ? ' on' : ''}`} onClick={() => setOffers(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="sd-field"><span>Birthday (optional)</span>
        <div className="sd-bday">
          <Select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Birthday day"><option value="">Day</option>{DAYS.map(x => <option key={x} value={x}>{Number(x)}</option>)}</Select>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Birthday month"><option value="">Month</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}</Select>
        </div>
      </div>
      {error && <p className="si-error" role="alert" data-testid="sd-add-error">{error}</p>}
      <div className="sd-actions">
        <button type="button" className="btn-primary" disabled={add.isPending || busy || !name.trim()} onClick={() => save(false)} data-testid="sd-add-save">{add.isPending ? <Loader2 size={14} className="animate-spin" /> : `Add ${name.trim().split(/\s+/)[0] || 'her'} and take her`}</button>
        {suggest.length > 0 && <button type="button" className="btn-secondary" disabled={add.isPending || !name.trim()} onClick={() => save(true)} data-testid="sd-add-anyway">Add as new anyway</button>}
      </div>
    </div>
  );
}
