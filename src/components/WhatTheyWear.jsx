import React from 'react';
import { Loader2, Eye, Ruler, Shirt, Wallet } from 'lucide-react';
import { useCounterCard } from '../hooks/useCounter';
import { formatRupees } from '../utils/money';
import { since } from '../utils/dates';
import FestivalBuying from './FestivalBuying';

/**
 * A customer's reading, as Inventory's counter card reads them (backend services/counter): their
 * colours as swatches, sizes per kind of garment, what a bill usually comes to, what is on the
 * shelves for them in the store this device is at, what they looked at online lately, and what they
 * buy for festivals.
 *
 * On the customer page: the full story lives in CRM; the counter (taking customers as they walk in)
 * stays in Inventory.
 */
export const STORE_KEY = 'crm_counter_store';
export const readStore = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; } };

const SWATCH = {
  Pink: '#e0569b', Orange: '#ee8a3c', Red: '#c62f3a', Gold: '#c9a227', Yellow: '#e8c93b', Green: '#3f9d4e', Blue: '#2f6fd0',
  Purple: '#7d4bc4', Brown: '#8a5a3b', White: '#f4f1ea', Grey: '#8b8f96', Black: '#1b1b1b'
};
const swatchStyle = (family) => family === 'Multicolour'
  ? { background: 'conic-gradient(#c62f3a, #ee8a3c, #e8c93b, #3f9d4e, #2f6fd0, #7d4bc4, #c62f3a)' }
  : { background: SWATCH[family] ?? 'var(--bg-input)' };

export default function WhatTheyWear({ customerId }) {
  const locationId = readStore();
  const card = useCounterCard(customerId, locationId);
  if (card.isLoading) return <section className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Reading what they wear…</section>;
  if (card.isError) return null; // the rest of the page stands without it
  const { dna, suggestions: s } = card.data;
  const looked = s.connected && Array.isArray(s.lookedAtOnline) ? s.lookedAtOnline : card.data.lookedAtOnline;

  return (
    <section className="crm-card ct-wear" aria-labelledby="ct-wear-h" data-testid="dna">
      <h2 id="ct-wear-h">What they wear</h2>
      <div className="ct-wear-grid">
        <div className="ct-wear-col">
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
        </div>
        <div className="ct-wear-col">
          {s.connected && locationId && s.picks.length > 0 && (
            <>
              <h3>On the shelves for them</h3>
              <ul className="ct-items">{s.picks.map(p => <Item key={p.variantId ?? p.title} item={p} />)}</ul>
            </>
          )}
          <h3><Eye size={15} aria-hidden="true" /> Looked at online lately</h3>
          {looked.length === 0 ? <p className="crm-muted">Nothing in the last 30 days.</p> : (
            <ul className="ct-items" data-testid="looked">{looked.map((p, i) => <Item key={`${p.title}-${i}`} item={p} />)}</ul>
          )}
        </div>
      </div>
      <FestivalBuying data={card.data.festivals} />
    </section>
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
