import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, QrCode, ExternalLink, Search, Loader2, ShieldOff, UserPlus, Users, ArrowRight, Hand, Store, MapPin, Eye, Shirt, Ruler, Wallet, Star, CircleCheck, CircleSlash, CircleAlert, NotebookPen } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useArrivals, useCounterCard, useLookup, useStores, useTake } from '../hooks/useCounter';
import { useAddNote } from '../hooks/useWork';
import { formatPhone } from '../utils/phone';
import { formatRupees } from '../utils/money';
import { formatDay, since } from '../utils/dates';
import Select from '../components/common/Select';
import { INVENTORY_URL } from '../lib/config';
import LoadFailed from '../components/LoadFailed';

/**
 * The Counter (plan §7: Inventory's customer card and door check-ins, in CRM). What a salesperson
 * uses on the floor: who just walked in (the door QR), "I'll take them", a number typed at the
 * counter, and the card to read before saying hello -- their sizes, their colours, what they usually
 * spend, what they looked at online, what is on the shelves for them, the last notes.
 *
 * The person shown is in the address (?c=…), so Back goes back to whoever was before.
 */
const STORE_KEY = 'crm_counter_store';

/** On the shop floor the minutes matter: "just now", "4 min ago", "1 hr 10 min ago". */
export function minutesAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hr${r ? ` ${r} min` : ''} ago`;
}
const readStore = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; } };

export default function Counter() {
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const open = params.get('c') || '';
  const [storeId, setStoreId] = useState(readStore);
  const stores = useStores();
  const storeList = stores.data ?? [];
  const storeName = storeList.find(s => s.id === storeId)?.name ?? '';
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState('');
  const lookup = useLookup(asked);

  useEffect(() => { try { storeId ? localStorage.setItem(STORE_KEY, storeId) : localStorage.removeItem(STORE_KEY); } catch { /* fine */ } }, [storeId]);
  // One person found: open their card straight away.
  useEffect(() => {
    if (lookup.data?.found === 'one') setParams(p => { const n = new URLSearchParams(p); n.set('c', lookup.data.people[0].id); return n; });
  }, [lookup.data, setParams]);

  const show = (id) => setParams(p => { const n = new URLSearchParams(p); n.set('c', id); return n; });

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
          <h1><Store size={24} aria-hidden="true" /> Counter</h1>
          <p>Who just walked in, and what to know before you say hello.</p>
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

      <Arrivals store={storeName} onOpen={show} />

      <section className="crm-card ct-lookup" aria-labelledby="ct-lookup-h">
        <h2 id="ct-lookup-h">Look up a number</h2>
        <form className="ct-lookup-row" onSubmit={(e) => { e.preventDefault(); setAsked(typed.trim()); }}>
          <div className="ct-phone">
            <Search size={18} aria-hidden="true" />
            <input className="input-field" type="tel" inputMode="tel" autoComplete="off" placeholder="Their mobile number" aria-label="Their mobile number"
              value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={!typed.trim() || lookup.isFetching}>
            {lookup.isFetching ? <Loader2 size={14} className="animate-spin" /> : 'Look up'}
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
              {lookup.data.people.map(p => <button key={p.id} type="button" className="btn-secondary" onClick={() => show(p.id)}>{p.name}</button>)}
            </div>
          </div>
        )}
      </section>

      {open && <Card id={open} locationId={storeId} storeName={storeName} mayNote={can('customer:update')} />}
    </main>
  );
}

/** Who scanned the door QR in the last two hours, newest first. */
function Arrivals({ store, onOpen }) {
  const arrivals = useArrivals(store);
  const take = useTake();
  const [problem, setProblem] = useState('');
  const list = arrivals.data?.arrivals ?? [];

  const takeThem = async (a) => {
    setProblem('');
    try {
      const r = await take.mutateAsync(a.id);
      if (r.customerId) onOpen(r.customerId);
    } catch (e) { setProblem(e?.message || 'Could not take them just now.'); }
  };

  return (
    <section className="ct-door" aria-labelledby="ct-door-h">
      <div className="td-sec-head">
        <h2 id="ct-door-h"><DoorOpen size={18} aria-hidden="true" /> In the store now</h2>
        <span className="ct-door-sub">
          <span className="crm-muted">From the door QR, the last two hours{store ? ` · ${store}` : ''}</span>
          {/* The standee itself stays in Inventory: it depends on the shop's WhatsApp number there. */}
          <a className="ct-qr" href={`${INVENTORY_URL}/customers/door-qr`} target="_blank" rel="noreferrer" data-testid="door-qr">
            <QrCode size={14} aria-hidden="true" /> Door QR <ExternalLink size={12} aria-hidden="true" />
          </a>
        </span>
      </div>
      {problem && <p className="si-error" role="alert" data-testid="take-problem">{problem}</p>}
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
              {a.taken ? (
                <div className="ct-taken">
                  <span>{a.taken.byMe ? 'You are looking after them' : `${a.taken.byName || 'Someone'} is looking after them`}</span>
                  {a.customerId && <button type="button" className="btn-secondary" onClick={() => onOpen(a.customerId)}>Open card</button>}
                </div>
              ) : (
                <button type="button" className="btn-primary ct-take" onClick={() => takeThem(a)} disabled={take.isPending}><Hand size={14} /> I'll take them</button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const SWATCH = {
  Pink: '#e0569b', Orange: '#ee8a3c', Red: '#c62f3a', Gold: '#c9a227', Yellow: '#e8c93b', Green: '#3f9d4e', Blue: '#2f6fd0',
  Purple: '#7d4bc4', Brown: '#8a5a3b', White: '#f4f1ea', Grey: '#8b8f96', Black: '#1b1b1b'
};
const swatchStyle = (family) => family === 'Multicolour'
  ? { background: 'conic-gradient(#c62f3a, #ee8a3c, #e8c93b, #3f9d4e, #2f6fd0, #7d4bc4, #c62f3a)' }
  : { background: SWATCH[family] ?? 'var(--bg-input)' };

/** The card: what to know before saying hello. */
function Card({ id, locationId, storeName, mayNote }) {
  const card = useCounterCard(id, locationId);
  if (card.isLoading) return <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Getting their card…</div>;
  if (card.isError) return <div className="crm-card"><LoadFailed what="their card" error={card.error} onRetry={() => card.refetch()} /></div>;
  const { customer: c, visits: v, dna, notes, suggestions: s } = card.data;
  const looked = s.connected && Array.isArray(s.lookedAtOnline) ? s.lookedAtOnline : card.data.lookedAtOnline;

  return (
    <article className="ct-card" data-testid="counter-card" aria-label={`${c.name}'s card`}>
      <section className="crm-card ct-id">
        <div className="ct-id-top">
          <div style={{ minWidth: 0 }}>
            <h2 data-testid="card-name">{c.name}</h2>
            <div className="crm-muted">{[c.phone ? formatPhone(c.phone) : null, c.code].filter(Boolean).join(' · ')}</div>
          </div>
          <Link to={`/customers/${c.id}`} className="btn-secondary ct-full">Full page <ArrowRight size={14} /></Link>
        </div>
        {c.groups.length > 0 && <div className="ct-groups">{c.groups.map(g => <span key={g} className="crm-tag">{g}</span>)}</div>}
        <dl className="ct-facts">
          <div><dt>Last here</dt><dd>{v.lastVisit ? `${formatDay(v.lastVisit)} · ${since(v.lastVisit)}` : 'Not yet'}</dd></div>
          <div><dt>Bills</dt><dd>{v.bills ? `${v.bills} · ${v.inStore} in the shop, ${v.online} online` : 'None yet'}</dd></div>
          <div><dt>Points</dt><dd><Star size={13} aria-hidden="true" /> {c.loyaltyPoints.toLocaleString('en-IN')}</dd></div>
          <div><dt>Store credit</dt><dd><Wallet size={13} aria-hidden="true" /> {formatRupees(c.storeCredit)}</dd></div>
        </dl>
        <div className={`ct-wa${c.whatsapp.agreed ? '' : ' no'}`} data-testid="card-whatsapp">
          {c.whatsapp.stopped ? <><CircleSlash size={14} /> Replied STOP: no offers on WhatsApp</>
            : c.whatsapp.agreed ? <><CircleCheck size={14} /> Agreed to WhatsApp offers</>
              : <><CircleAlert size={14} /> Not agreed to WhatsApp offers: ask them today</>}
        </div>
      </section>

      <section className="crm-card ct-dna" aria-labelledby="ct-dna-h" data-testid="dna">
        <h3 id="ct-dna-h">What they wear</h3>
        {dna.colours.length === 0 && dna.sizes.length === 0 && !dna.spend ? (
          <p className="crm-muted">Nothing bought yet: no sizes or colours to go on.</p>
        ) : (
          <>
            {dna.colours.length > 0 && (
              <div className="ct-colours" data-testid="colours" aria-label={`Their colours: ${dna.colours.join(', ')}`}>
                {dna.colours.map((f, i) => (
                  <div key={f} className="ct-swatch">
                    <span className={`ct-chip${i === 0 ? ' first' : ''}`} style={swatchStyle(f)} aria-hidden="true" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
            <ul className="ct-traits">
              {dna.sizes.length > 0 && <li><Ruler size={15} aria-hidden="true" /> {dna.sizes.map(z => (z.kind === 'Other' ? `size ${z.size}` : `${z.kind} in ${z.size}`)).join(', ')}</li>}
              {dna.kinds.length > 0 && <li><Shirt size={15} aria-hidden="true" /> Buys mostly {dna.kinds.map(k => k.toLowerCase()).join(', ')}</li>}
              {dna.spend && <li data-testid="spend"><Wallet size={15} aria-hidden="true" /> Usually spends {dna.spend.from === dna.spend.to ? formatRupees(dna.spend.from) : `${formatRupees(dna.spend.from)} – ${formatRupees(dna.spend.to)}`} a bill</li>}
            </ul>
          </>
        )}
      </section>

      <section className="crm-card ct-shelf" aria-labelledby="ct-shelf-h" data-testid="picks">
        <h3 id="ct-shelf-h">On the shelves for them{storeName ? ` · ${storeName}` : ''}</h3>
        {!s.connected ? (
          <p className="crm-muted" data-testid="picks-off">Picks from your stock come from Inventory, which is not answering just now. The rest of the card is up to date.</p>
        ) : !locationId ? (
          <p className="crm-muted" data-testid="picks-choose">Choose your store at the top to see what is on its shelves in their size.</p>
        ) : s.picks.length === 0 ? (
          <p className="crm-muted" data-testid="picks-none">Nothing in their size on this store's shelves right now.</p>
        ) : (
          <ul className="ct-items">{s.picks.map(p => <Item key={p.variantId ?? p.title} item={p} />)}</ul>
        )}
        {s.connected && s.alsoBought?.length > 0 && (
          <>
            <h4>Others who buy like them also bought</h4>
            <ul className="ct-items">{s.alsoBought.map(p => <Item key={p.variantId ?? p.productId ?? p.title} item={p} />)}</ul>
          </>
        )}
      </section>

      <section className="crm-card ct-looked" aria-labelledby="ct-looked-h" data-testid="looked">
        <h3 id="ct-looked-h"><Eye size={16} aria-hidden="true" /> Looked at online lately</h3>
        {looked.length === 0 ? <p className="crm-muted">Nothing in the last 30 days.</p> : (
          <ul className="ct-items">{looked.map((p, i) => <Item key={`${p.title}-${i}`} item={p} />)}</ul>
        )}
      </section>

      <Notes customerId={c.id} notes={notes} mayNote={mayNote} />
    </article>
  );
}

function Item({ item: p }) {
  const bits = [p.colour, p.size].filter(Boolean).join(', ');
  return (
    <li className="ct-item">
      <div style={{ minWidth: 0 }}>
        <div className="ct-item-title">{p.title}</div>
        <div className="crm-muted">{[bits, p.shelf ? `shelf ${p.shelf}` : null, typeof p.inStock === 'number' ? `${p.inStock} here` : null, p.at ? since(p.at) : null].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="ct-item-end">
        {p.price != null && <strong>{formatRupees(p.price)}</strong>}
        {p.yourColour && <span className="ct-badge">their colour</span>}
      </div>
    </li>
  );
}

function Notes({ customerId, notes, mayNote }) {
  const add = useAddNote(customerId);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await add.mutateAsync(text.trim());
      setText('');
      // The card is its own answer: ask for it again so the note is on it at once.
      qc.invalidateQueries({ queryKey: ['counterCard', customerId] });
    } catch { /* the hook says so */ }
  };
  return (
    <section className="crm-card ct-notes" aria-labelledby="ct-notes-h" data-testid="card-notes">
      <h3 id="ct-notes-h"><NotebookPen size={16} aria-hidden="true" /> Notes</h3>
      {notes.length === 0 ? <p className="crm-muted">No notes yet.</p> : (
        <ul className="ct-note-list">
          {notes.map(n => (
            <li key={n.id}><p>{n.body}</p><span className="crm-muted">{[n.byName, formatDay(n.at)].filter(Boolean).join(' · ')}</span></li>
          ))}
        </ul>
      )}
      {mayNote && (
        <form className="ct-note-add" onSubmit={save}>
          <input className="input-field" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Add a note: what they asked for, what to keep aside…" aria-label="Add a note" />
          <button type="submit" className="btn-secondary" disabled={!text.trim() || add.isPending}>Save</button>
        </form>
      )}
    </section>
  );
}
