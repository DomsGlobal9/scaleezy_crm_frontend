import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, QrCode, ExternalLink, Search, Loader2, ShieldOff, UserPlus, Users, MapPin, Hand } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useArrivals, useLookup, useStores } from '../hooks/useCounter';
import { formatPhone } from '../utils/phone';
import Select from '../components/common/Select';
import LoadFailed from '../components/LoadFailed';
import { INVENTORY_URL } from '../lib/config';
import { STORE_KEY, readStore } from '../components/WhatTheyWear';

/**
 * In the store: who scanned the door QR in the last two hours, and who is looking after them -- read
 * only. Taking a customer happens at Inventory's counter, where sales staff already sign in (the
 * owner, 28 Oct), so it happens in one place; who took whom arrives through the feed. A known
 * customer opens their full story in CRM. A number typed here does the same.
 */

/** On the shop floor the minutes matter: "just now", "4 min ago", "1 hr 10 min ago". */
export function minutesAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hr${r ? ` ${r} min` : ''} ago`;
}

export default function Counter() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState(readStore);
  const stores = useStores();
  const storeList = stores.data ?? [];
  const storeName = storeList.find(s => s.id === storeId)?.name ?? '';
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState('');
  const lookup = useLookup(asked);
  const open = (id) => navigate(`/customers/${id}`);

  // The store this device is in, remembered: nobody re-picks the store they are standing in.
  useEffect(() => { try { storeId ? localStorage.setItem(STORE_KEY, storeId) : localStorage.removeItem(STORE_KEY); } catch { /* fine */ } }, [storeId]);
  useEffect(() => { if (lookup.data?.found === 'one') open(lookup.data.people[0].id); }, [lookup.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  return (
    <main className="crm-page ct-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><DoorOpen size={24} aria-hidden="true" /> At the door</h1>
          <p>Who walked in through the door QR, and who is looking after them. Staff take customers at Inventory's counter.</p>
        </div>
        {storeList.length > 0 && (
          <div className="ct-store">
            <MapPin size={15} aria-hidden="true" />
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Your store">
              <option value="">All stores</option>
              {storeList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      <Arrivals store={storeName} storeId={storeId} onOpen={open} />

      <section className="crm-card ct-lookup" aria-labelledby="ct-lookup-h">
        <h2 id="ct-lookup-h">Open a customer by phone</h2>
        <form className="ct-lookup-row" onSubmit={(e) => { e.preventDefault(); setAsked(typed.trim()); }}>
          <div className="ct-phone">
            <Search size={18} aria-hidden="true" />
            <input className="input-field" type="tel" inputMode="tel" autoComplete="off" placeholder="Their mobile number" aria-label="Their mobile number"
              value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={!typed.trim() || lookup.isFetching}>
            {lookup.isFetching ? <Loader2 size={14} className="animate-spin" /> : 'Open'}
          </button>
        </form>
        {lookup.isError && <p className="si-error" role="alert" data-testid="lookup-problem">{lookup.error?.message}</p>}
        {lookup.data?.found === 'none' && (
          <div className="ct-none" data-testid="lookup-none">
            <UserPlus size={18} aria-hidden="true" />
            <span><strong>New customer.</strong> Nobody has {formatPhone(lookup.data.phone)} yet. Add them at the till as you bill; they come here by themselves.</span>
          </div>
        )}
        {lookup.data?.found === 'several' && (
          <div className="ct-several" data-testid="lookup-several">
            <p><Users size={16} aria-hidden="true" /> {lookup.data.people.length} people share {formatPhone(lookup.data.phone)}. Who is it?</p>
            <div className="ct-choose">
              {lookup.data.people.map(p => <button key={p.id} type="button" className="btn-secondary" onClick={() => open(p.id)}>{p.name}</button>)}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/** Who scanned the door QR in the last two hours, newest first. Read only. */
function Arrivals({ store, storeId, onOpen }) {
  const arrivals = useArrivals(store);
  const list = arrivals.data?.arrivals ?? [];
  return (
    <section className="ct-door" aria-labelledby="ct-door-h">
      <div className="td-sec-head">
        <h2 id="ct-door-h">Walked in</h2>
        <span className="ct-door-sub">
          <span className="crm-muted">From the door QR, the last two hours{store ? ` · ${store}` : ''}</span>
          {/* Printing the standee is one-time setup, in Inventory, for THIS store: a standee printed for
              another store would send this store's customers to the wrong list. */}
          {storeId && (
            <a className="ct-qr" href={`${INVENTORY_URL}/customers/door-qr?locationId=${encodeURIComponent(storeId)}`} target="_blank" rel="noreferrer" data-testid="door-qr">
              <QrCode size={13} aria-hidden="true" /> Door QR for {store} <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </span>
      </div>
      {arrivals.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Checking the door…</div>
      ) : arrivals.isError ? (
        <div className="crm-card"><LoadFailed what="who is in the store" error={arrivals.error} onRetry={() => arrivals.refetch()} /></div>
      ) : list.length === 0 ? (
        <div className="crm-card ct-quiet" data-testid="nobody-in">Nobody has scanned the door QR in the last two hours.</div>
      ) : (
        <ol className="ct-arrivals">
          {list.map(a => (
            <li key={a.id} className={`ct-arrival${a.taken ? ' taken' : ''}`} data-testid="arrival">
              <div className="ct-who">
                <strong>{a.name || (a.phone ? formatPhone(a.phone) : 'Someone')}</strong>
                <span className="crm-muted">{a.name ? (a.phone ? formatPhone(a.phone) : '') : 'Not a customer yet'}</span>
                {a.groups.length > 0 && <span className="ct-groups">{a.groups.map(g => <span key={g} className="crm-tag">{g}</span>)}</span>}
              </div>
              <div className="ct-when">Came in {minutesAgo(a.arrivedAt)}{a.storeName && !store ? ` · ${a.storeName}` : ''}</div>
              <div className="ct-taken">
                <span data-testid="who-has-them">{a.taken
                  ? <><Hand size={13} aria-hidden="true" /> {a.taken.byName || 'Someone'} is looking after them</>
                  : 'Nobody has taken them yet (at Inventory\'s counter)'}</span>
                {a.customerId && <button type="button" className="btn-secondary" onClick={() => onOpen(a.customerId)}>Full story</button>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
