import React, { useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { useCounterCard } from '../hooks/useCounter';
import { formatRupees } from '../utils/money';
import { since } from '../utils/dates';

/**
 * A customer's reading, as Inventory's counter card reads them (backend services/counter): their
 * colours, sizes per kind of garment, what they buy, what a bill usually comes to, the festivals they
 * buy for (in full on the Festivals tab), what is on the shelves for them in the store this device is
 * at, and what they looked at online lately.
 *
 * The first tab of the customer page, kept short (the owner, 28 Oct): one line each, labels in one
 * column so the values line up; three shelf picks, the rest on asking.
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
/** "Saree" -> "sarees": kinds of garment as people say them. */
const kindsWords = (xs) => xs.map(x => (/s$/i.test(x) ? x : `${x}s`).toLowerCase()).join(', ');
const PICKS_SHOWN = 3;

function Line({ label, children, testid }) {
  return <div className="ct-line" data-testid={testid}><span className="ct-label">{label}</span><div className="ct-value">{children}</div></div>;
}

export default function WhatTheyWear({ customerId, onFestivals }) {
  const locationId = readStore();
  const card = useCounterCard(customerId, locationId);
  const [allPicks, setAllPicks] = useState(false);
  if (card.isLoading) return <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Reading what they wear…</div>;
  if (card.isError) return <p className="crm-muted">What they wear could not be read just now.</p>;
  const { dna, suggestions: s, festivals: fb } = card.data;
  const looked = s.connected && Array.isArray(s.lookedAtOnline) ? s.lookedAtOnline : card.data.lookedAtOnline;
  const picks = s.connected && locationId ? s.picks : [];
  const nothing = dna.colours.length === 0 && dna.sizes.length === 0 && !dna.spend;
  const bought = fb?.festivals ?? [];

  return (
    <div className="ct-wear" data-testid="dna">
      {nothing ? (
        <p className="crm-muted">Nothing bought yet: no sizes or colours to go on.</p>
      ) : (
        <div className="ct-lines" data-testid="tastes">
          {dna.colours.length > 0 && (
            <Line label="Colours">
              <div className="ct-colours" data-testid="colours" aria-label={`Their colours: ${dna.colours.join(', ')}`}>
                {dna.colours.map((f, i) => (
                  <span key={f} className="ct-swatch"><span className={`ct-chip${i === 0 ? ' first' : ''}`} style={swatchStyle(f)} aria-hidden="true" />{f}</span>
                ))}
              </div>
            </Line>
          )}
          {dna.sizes.length > 0 && <Line label="Sizes">{dna.sizes.map(z => (z.kind === 'Other' ? z.size : `${z.kind} ${z.size}`)).join(' · ')}</Line>}
          {dna.kinds.length > 0 && <Line label="Buys">{kindsWords(dna.kinds).replace(/^./, c => c.toUpperCase())}</Line>}
          {dna.spend && <Line label="A bill" testid="spend">Usually {dna.spend.from === dna.spend.to ? formatRupees(dna.spend.from) : `${formatRupees(dna.spend.from)} – ${formatRupees(dna.spend.to)}`}</Line>}
          {bought.length > 0 && (
            <Line label="Festivals">
              {bought.map(f => (f.years.length > 1 && f.years.every(y => y.bought) ? `${f.name} every year` : f.name)).join(', ')}
              {fb.share != null && ` · ${fb.share}% of their spending`}
              {onFestivals && <> · <button type="button" className="si-link" onClick={onFestivals}>See festivals</button></>}
            </Line>
          )}
        </div>
      )}

      {fb?.soon && (
        <p className="fb-soon" data-testid="festival-soon-short">
          <b>{fb.soon.name} is {fb.soon.inDays === 0 ? 'today' : fb.soon.inDays === 1 ? 'tomorrow' : `in ${fb.soon.inDays} days`}</b>
          {` and they bought for it ${fb.soon.bought === fb.soon.of ? (fb.soon.of === 1 ? 'last year' : `the last ${fb.soon.of} years`) : `${fb.soon.bought} of the last ${fb.soon.of} years`}`}
          {fb.soon.about > 0 ? ` — about ${formatRupees(fb.soon.about)}${fb.soon.bought > 1 ? ' each time' : ''}` : ''}.
        </p>
      )}

      {picks.length > 0 && (
        <div className="ct-block">
          <div className="ct-block-head">
            <h3>On the shelves for them</h3>
            {picks.length > PICKS_SHOWN && <button type="button" className="si-link" onClick={() => setAllPicks(v => !v)}>{allPicks ? 'Show fewer' : `Show all ${picks.length}`}</button>}
          </div>
          <ul className="ct-items">{(allPicks ? picks : picks.slice(0, PICKS_SHOWN)).map(p => <Item key={p.variantId ?? p.title} item={p} />)}</ul>
        </div>
      )}

      {looked.length === 0 ? (
        <p className="crm-muted ct-nothing"><Eye size={14} aria-hidden="true" /> Looked at nothing online in the last 30 days.</p>
      ) : (
        <div className="ct-block">
          <div className="ct-block-head"><h3><Eye size={15} aria-hidden="true" /> Looked at online lately</h3></div>
          <ul className="ct-items" data-testid="looked">{looked.map((p, i) => <Item key={`${p.title}-${i}`} item={p} />)}</ul>
        </div>
      )}
    </div>
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
