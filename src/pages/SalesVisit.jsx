import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Heart, Loader2, Check, Store } from 'lucide-react';
import { useFinishVisit, usePieces, useSetItem, useSetPicks, useVisit } from '../hooks/useSales';
import { useStores } from '../hooks/useCounter';
import { readStore } from '../components/WhatTheyWear';
import { formatRupees } from '../utils/money';
import { rangeWord, rangesOf } from '../utils/customerFilters';
import LoadFailed from '../components/LoadFailed';
import SalesCues from '../components/SalesCues';

/**
 * Serving one customer (the owner's OK, 11 Nov): ask what she wants, show her the pieces in stock in this
 * store, she picks on the phone, bring them, and note how each went. "Show her" fills the screen with the
 * shop's name and the pieces only: no menu, no stock counts, nothing about her. No shelves: a piece is
 * found by its photo and the number on its price tag.
 */
const STEPS = [['ask', 'What she wants'], ['show', 'Show her'], ['bring', 'Bring these'], ['how', 'How did it go']];
const SWATCH = { Pink: '#e0569b', Orange: '#ee8a3c', Red: '#c62f3a', Gold: '#c9a227', Yellow: '#e8c93b', Green: '#3f9d4e', Blue: '#2f6fd0', Purple: '#7d4bc4', Brown: '#8a5a3b', White: '#f4f1ea', Grey: '#8b8f96', Black: '#1b1b1b', Maroon: '#7a1f33', Beige: '#d8c3a5', Cream: '#efe4c8', Multicolour: 'conic-gradient(#e0569b,#e8c93b,#3f9d4e,#2f6fd0,#e0569b)' };
const REASONS = [['price', 'Price'], ['colour', 'Colour'], ['fit', 'Fit'], ['fabric', 'Fabric'], ['think', 'Will think']];

export default function SalesVisit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const visit = useVisit(id);
  const v = visit.data;
  const stores = useStores();
  const [step, setStep] = useState('ask');
  const [ask, setAsk] = useState(null);
  const [locationId, setLocationId] = useState(null);
  useEffect(() => { if (v && ask === null) setAsk(v.ask ?? {}); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (v && locationId === null) setLocationId(v.locationId || readStore() || ''); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (v?.items?.some(i => i.picked) && step === 'ask' && ask === null) setStep('bring'); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieces = usePieces(id, ask, locationId && !v?.locationId ? locationId : undefined, !!v && ask !== null && !!(v.locationId || locationId));
  const finish = useFinishVisit(id);

  if (visit.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div></main>;
  if (visit.isError) return <main className="crm-page"><div className="crm-card"><LoadFailed what="this visit" error={visit.error} onRetry={() => visit.refetch()} /></div></main>;
  const who = v.customer?.name ?? 'Customer without a phone';
  const picked = v.items.filter(i => i.picked);
  const done = async () => {
    try { await finish.mutateAsync(); toast.success(v.customer ? `Saved on ${v.customer.firstName}'s timeline.` : 'Finished.'); navigate('/sales'); }
    catch (err) { toast.error(err?.message || 'Could not finish. Try again.'); }
  };
  if (v.endedAt) {
    return (
      <main className="crm-page sv-page">
        <Link to="/sales" className="cp-back"><ArrowLeft size={14} /> Sales dashboard</Link>
        <div className="crm-card"><h2>{who}: finished</h2><p className="crm-muted">This visit is saved{v.customer ? ' on her timeline' : ''}.</p></div>
      </main>
    );
  }
  const noStore = !v.locationId && !locationId;

  return (
    <main className="crm-page sv-page">
      <Link to="/sales" className="cp-back"><ArrowLeft size={14} /> Sales dashboard</Link>
      <div className="crm-card sv-who">
        <div className="sd-person-top"><div><h1 className="sv-name">{who}</h1><span className="crm-muted">with {v.staffName ?? 'you'}{v.storeName ? ` · ${v.storeName}` : ''}</span></div>
          {v.customer && <Link className="btn-secondary" to={`/customers/${v.customer.id}`}>Full story</Link>}</div>
        <SalesCues cues={v.cues} max={5} />
      </div>

      <nav className="sv-steps" aria-label="Serving steps">
        {STEPS.map(([k, l], i) => (
          <button key={k} type="button" className={`sv-step${step === k ? ' on' : ''}`} aria-current={step === k ? 'step' : undefined} onClick={() => setStep(k)} disabled={(k === 'bring' || k === 'how') && picked.length === 0}>
            <span>{i + 1}</span>{l}
          </button>
        ))}
      </nav>

      {noStore && (
        <div className="crm-card sd-small sd-warn" role="alert">
          Choose your store: the pieces shown are the ones in stock there.
          <div style={{ marginTop: 8 }}>{(stores.data ?? []).map(s => <button key={s.id} type="button" className="sd-chip" onClick={() => setLocationId(s.id)}>{s.name}</button>)}</div>
        </div>
      )}

      {step === 'ask' && ask !== null && !noStore && <Ask ask={ask} setAsk={setAsk} pieces={pieces} onShow={() => setStep('show')} />}
      {step === 'show' && <ShowHer v={v} pieces={pieces} ask={ask} onDone={() => setStep('bring')} onBack={() => setStep('ask')} />}
      {step === 'bring' && <Bring v={v} onAdd={() => setStep('ask')} onNext={() => setStep('how')} />}
      {step === 'how' && <How v={v} onFinish={done} finishing={finish.isPending} />}
    </main>
  );
}

function Chips({ label, values, chosen, onToggle, word = (x) => x, swatch = false, testid }) {
  if (!values?.length) return null;
  return (
    <div className="sd-field"><span>{label}</span>
      <div className="sd-chips" data-testid={testid}>
        {values.map(x => {
          const on = chosen.includes(x);
          return (
            <button key={x} type="button" aria-pressed={on} className={`sd-chip${on ? ' on' : ''}`} onClick={() => onToggle(x)}>
              {swatch && <i className="sv-sw" style={{ background: SWATCH[x] ?? '#ccc' }} aria-hidden="true" />}{word(x)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** What she is looking for: filled in from what she buys, changed as she speaks; the count updates as you tap. */
function Ask({ ask, setAsk, pieces, onShow }) {
  const o = pieces.data?.options;
  const toggle = (key) => (x) => setAsk(a => { const cur = a[key] ?? []; return { ...a, [key]: cur.includes(x) ? cur.filter(y => y !== x) : [...cur, x] }; });
  const bands = rangesOf(o?.bands ?? []);
  return (
    <section className="crm-card sv-ask" data-testid="sv-ask">
      <h2>What is she looking for?</h2>
      {pieces.isError && <p className="si-error" role="alert">{pieces.error?.message}</p>}
      {!o && pieces.isLoading && <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Looking in this store…</p>}
      {o && <>
        <Chips label="Kind" values={o.kinds} chosen={ask.kinds ?? []} onToggle={toggle('kinds')} testid="sv-kinds" />
        <div className="sd-field"><span>Price</span>
          <div className="sd-chips" data-testid="sv-bands">
            {bands.map(b => <button key={b} type="button" aria-pressed={ask.band === b} className={`sd-chip${ask.band === b ? ' on' : ''}`} onClick={() => setAsk(a => ({ ...a, band: a.band === b ? null : b }))}>{rangeWord(b).replace(' and above', ' or more')}</button>)}
          </div>
        </div>
        <Chips label="Colour" values={o.colours} chosen={ask.colours ?? []} onToggle={toggle('colours')} swatch testid="sv-colours" />
        <Chips label="Fabric" values={o.fabrics} chosen={ask.fabrics ?? []} onToggle={toggle('fabrics')} testid="sv-fabrics" />
        <Chips label="Size" values={o.sizes} chosen={ask.sizes ?? []} onToggle={toggle('sizes')} testid="sv-sizes" />
      </>}
      <button type="button" className="btn-primary sv-wide" disabled={!pieces.data || pieces.data.count === 0} onClick={onShow} data-testid="sv-show">
        {pieces.data ? (pieces.data.count === 0 ? 'Nothing in this store fits. Take something off.' : `Show her ${pieces.data.count} ${pieces.data.count === 1 ? 'piece' : 'pieces'}`) : 'Show her'}
      </button>
      <p className="crm-muted sd-small">Only pieces in stock in this store.</p>
    </section>
  );
}

/** The phone turned to her: the shop's name, big photos and prices; she taps the heart on what she likes. */
function ShowHer({ v, pieces, onDone, onBack }) {
  const setPicks = useSetPicks(v.id);
  const [chosen, setChosen] = useState(() => new Set(v.items.filter(i => i.picked).map(i => i.variantId)));
  const list = pieces.data?.pieces ?? [];
  const toggle = (vid) => setChosen(s => { const n = new Set(s); n.has(vid) ? n.delete(vid) : n.add(vid); return n; });
  // Her screen: any staff message still showing ("added", "the till finds her") goes first.
  useEffect(() => { toast.remove(); document.body.classList.add('sv-her-open'); return () => document.body.classList.remove('sv-her-open'); }, []);
  const save = async () => {
    try { await setPicks.mutateAsync([...chosen]); onDone(); }
    catch (err) { toast.error(err?.message || 'Her picks could not be saved. Try again.'); }
  };
  return (
    <div className="sv-her" role="dialog" aria-modal="true" aria-label="Pieces for the customer" data-testid="sv-her">
      <header className="sv-her-head">
        <div><div className="sv-her-shop"><Store size={14} aria-hidden="true" /> {v.shopName ?? 'Our shop'}</div><div className="sv-her-title">{v.customer ? `Picked for you, ${v.customer.firstName}` : 'Picked for you'}</div></div>
        <span className="sv-her-count" aria-live="polite"><Heart size={15} aria-hidden="true" /> {chosen.size}</span>
      </header>
      <ul className="sv-grid">
        {list.map(p => {
          const on = chosen.has(p.variantId);
          return (
            <li key={p.variantId} className={`sv-piece${on ? ' on' : ''}`}>
              <button type="button" className="sv-piece-btn" aria-pressed={on} onClick={() => toggle(p.variantId)} data-testid="sv-piece">
                <div className="sv-photo" style={p.photo ? { backgroundImage: `url(${p.photo})` } : undefined}>{!p.photo && <span>{p.title.slice(0, 1)}</span>}
                  <span className={`sv-heart${on ? ' on' : ''}`}><Heart size={16} aria-hidden="true" fill={on ? 'currentColor' : 'none'} /></span></div>
                <div className="sv-piece-name">{p.title}</div>
                <div className="sv-piece-sub">{[p.colour, p.size].filter(Boolean).join(' · ')}</div>
                <div className="sv-piece-price">{p.price !== null ? formatRupees(p.price) : ''}</div>
                {(p.hearted || p.newIn) && <div className="sv-piece-tags">{p.hearted && <span>You liked this online</span>}{p.newIn && <span>New in</span>}</div>}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="sv-her-foot">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn-primary" disabled={setPicks.isPending || chosen.size === 0} onClick={save} data-testid="sv-picked">{setPicks.isPending ? <Loader2 size={14} className="animate-spin" /> : `Done, bring ${chosen.size}`}</button>
      </footer>
    </div>
  );
}

/** Bring these: photo, name and the number on its price tag; tick each as you bring it. */
function Bring({ v, onAdd, onNext }) {
  const setItem = useSetItem(v.id);
  const picked = v.items.filter(i => i.picked);
  const all = picked.length > 0 && picked.every(i => i.brought);
  const tick = (i) => setItem.mutate({ itemId: i.id, brought: !i.brought }, { onError: (e) => toast.error(e?.message || 'Could not save that.') });
  return (
    <section className="crm-card sv-bring" data-testid="sv-bring">
      <h2>Bring {picked.length} for {v.customer?.firstName ?? 'her'}</h2>
      <p className="crm-muted sd-small">Find each by its photo and the number on its price tag.</p>
      <ul className="sv-list">
        {picked.map(i => (
          <li key={i.id} className={i.brought ? 'done' : ''}>
            <button type="button" className={`sv-box${i.brought ? ' on' : ''}`} role="checkbox" aria-checked={i.brought} aria-label={`Brought ${i.title}`} onClick={() => tick(i)} data-testid="sv-brought">{i.brought && <Check size={14} />}</button>
            <div className="sv-thumb" style={i.photo ? { backgroundImage: `url(${i.photo})` } : undefined} />
            <div style={{ minWidth: 0 }}><strong>{i.title}</strong>{i.price !== null && <> · {formatRupees(i.price)}</>}<div className="crm-muted sd-small">{[i.colour, i.size, i.sku ? `Tag ${i.sku}` : null].filter(Boolean).join(' · ')}</div></div>
          </li>
        ))}
      </ul>
      <div className="sd-actions">
        <button type="button" className="btn-secondary" onClick={onAdd}>Add more</button>
        <button type="button" className="btn-primary" onClick={onNext} data-testid="sv-to-how">{all ? 'Brought them all' : 'She is trying them'}</button>
      </div>
    </section>
  );
}

/** How each went: bought, tried and not for her (why), or did not try. Finishing puts it on her timeline. */
function How({ v, onFinish, finishing }) {
  const setItem = useSetItem(v.id);
  const picked = v.items.filter(i => i.picked);
  const put = (i, body) => setItem.mutate({ itemId: i.id, ...body }, { onError: (e) => toast.error(e?.message || 'Could not save that.') });
  const bought = picked.filter(i => i.outcome === 'bought');
  return (
    <section className="crm-card sv-how" data-testid="sv-how">
      <h2>How did they go?</h2>
      <ul className="sv-list">
        {picked.map(i => (
          <li key={i.id} className="sv-how-row">
            <div className="sv-thumb" style={i.photo ? { backgroundImage: `url(${i.photo})` } : undefined} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong>{i.title}</strong>{i.price !== null && <> · {formatRupees(i.price)}</>}
              <div className="sd-chips" role="radiogroup" aria-label={`How ${i.title} went`}>
                {[['bought', 'Bought'], ['not_for_her', 'Tried, not for her'], ['not_tried', "Didn't try"]].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={i.outcome === k} className={`sd-chip${i.outcome === k ? ' on' : ''}`} onClick={() => put(i, { outcome: k })} data-testid={`sv-${k}`}>{l}</button>
                ))}
              </div>
              {i.outcome === 'not_for_her' && (
                <div className="sd-chips sv-why" role="radiogroup" aria-label="Why">
                  {REASONS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={i.reason === k} className={`sd-chip small${i.reason === k ? ' on' : ''}`} onClick={() => put(i, { reason: k })} data-testid={`sv-why-${k}`}>{l}</button>)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {bought.length > 0 && <p className="sd-small">Bill {bought.length === 1 ? 'it' : 'them'} at the till: {bought.map(i => i.sku ? `Tag ${i.sku}` : i.title).join(', ')}.</p>}
      <button type="button" className="btn-primary sv-wide" disabled={finishing} onClick={onFinish} data-testid="sv-finish">{finishing ? <Loader2 size={14} className="animate-spin" /> : v.customer ? `Finish and save on ${v.customer.firstName}'s timeline` : 'Finish'}</button>
    </section>
  );
}
