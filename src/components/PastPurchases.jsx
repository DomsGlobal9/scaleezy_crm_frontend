import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';
import { budgetOf, payWord } from '../utils/customerFilters';

/**
 * What a customer bought before the shop came to ScaleEzy: the buying pattern as the module worked it out,
 * and their past bills. Any shop, the same way. A bill with no date says so: none is ever invented.
 */
export function usePast(customerId) {
  return useQuery({ queryKey: ['customer', customerId, 'past'], queryFn: async () => (await api.get(`/customers/${customerId}/past`)).data, enabled: !!customerId });
}

const band = (b) => (!b ? null : b.from === b.to ? `about ${formatRupees(b.from)}` : `${formatRupees(b.from)} to ${formatRupees(b.to)}`);
const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "Mostly buys Kurti, usually ₹1,200 to ₹1,800 a piece." In the shop's own words. Nothing is claimed when the records can't say. */
function sayIt(p) {
  const top = p.byKind?.[0];
  if (!top) return null;
  const words = `${p.byKind.length > 1 ? 'Mostly buys' : 'Buys'} ${top.name}`;
  const usual = band(top.usual);
  return usual ? `${words}, usually ${usual} a piece.` : `${words}.`;
}

/** One way of grouping what they kept: "Pattu: 11 pieces, 86% of what they kept". */
function Groups({ groups, testid }) {
  const total = (groups ?? []).reduce((t, g) => t + g.spend, 0);
  return (groups ?? []).slice(0, 4).map(g => <p key={g.name} data-testid={testid}>{g.name}: {plural(g.items, 'piece', 'pieces')}{total ? `, ${share(g.spend, total)}% of what they kept` : ''}</p>);
}

export default function PastPurchases({ customerId }) {
  const past = usePast(customerId);
  const [all, setAll] = useState(false);
  const bills = past.data?.bills ?? [];
  const p = past.data?.pattern;
  if (!p) return null;

  const shown = all ? bills : bills.slice(0, 3);
  const said = p ? sayIt(p) : null;
  const dated = bills.some(b => b.billedOn);
  return (
    <section className="pp-wrap" data-testid="past-purchases" aria-label="Past purchases">
      {said && <p className="pp-say" data-testid="past-sentence">{said}</p>}
      {bills.length > 0 && <p className="pp-note">{dated ? 'Including past purchases.' : 'Including past purchases, date not known.'}</p>}

      <div className="pp-facts">
          <div className="pp-fact" data-testid="past-spend">
            <h3>Spend</h3>
            <div className="pp-big">{formatRupees(p.netSpend)}</div>
            <p>{plural(p.billCount, 'bill', 'bills')}{p.visits > 0 ? `, ${p.visitsAreAnEstimate ? 'about ' : ''}${plural(p.visits, 'visit', 'visits')}` : ''}</p>
            {/* A bill that came to less than what came back does not count as a bill: they did still buy. */}
            {p.billCount === 0 && p.items > 0 && <p>{plural(p.items, 'piece', 'pieces')} kept, on a bill that came to less than what came back.</p>}
          </div>
          {p.items > 0 && (
            <div className="pp-fact" data-testid="past-buys">
              <h3>What they buy</h3>
              <div className="pp-big">{p.topKind ?? 'Not known'}</div>
              {p.byKind.length > 1 && <div className="pp-split" aria-hidden="true">{p.byKind.slice(0, 2).map(g => <i key={g.name} style={{ width: `${share(g.spend, p.byKind.reduce((t, x) => t + x.spend, 0))}%` }} />)}</div>}
              <Groups groups={p.byKind} />
            </div>
          )}
          {(p.byFabric.length > 0 || p.byCraft.length > 0 || p.byColour.length > 0 || p.bySize.length > 0) && (
            <div className="pp-fact" data-testid="past-details">
              <h3>Fabric, craft, colour and size</h3>
              <Groups groups={p.byFabric} />
              <Groups groups={p.byCraft} />
              <Groups groups={p.byColour} />
              <Groups groups={p.bySize} />
            </div>
          )}
          <div className="pp-fact" data-testid="past-budget">
            <h3>Budget</h3>
            <div className="pp-big">{budgetOf(p.typicalItem, past.data?.bands) ?? 'Not known'}</div>
            {p.typicalItem !== null && <p>A typical piece: {formatRupees(p.typicalItem)}</p>}
            {p.dearestItem !== null && <p>Dearest piece: {formatRupees(p.dearestItem)}</p>}
          </div>
          <div className="pp-fact" data-testid="past-returns">
            <h3>Returns and paying</h3>
            <div className="pp-big">{p.returnLines > 0 ? `${plural(p.returnLines, 'item', 'items')} returned` : 'No returns'}</div>
            {p.returnsNotInRecords > 0 && <p>{plural(p.returnsNotInRecords, 'return', 'returns')} of something from before these records</p>}
            <p>{p.usuallyPaysBy ? `Usually pays by ${payWord(p.usuallyPaysBy)}` : 'How they pay: not known'}</p>
          </div>
      </div>

      {bills.length > 0 && <div className="pp-bills" data-testid="past-bills">
        <h3>Past bills</h3>
        <p className="pp-note">{dated ? 'Newest bill number first.' : 'Date not known. Newest bill number first.'}</p>
        {shown.map(b => <Bill key={b.id} bill={b} />)}
        {bills.length > 3 && (
          <button type="button" className="si-link" onClick={() => setAll(a => !a)} data-testid="past-all">
            {all ? 'Show fewer' : `Show all ${bills.length.toLocaleString('en-IN')} bills`}
          </button>
        )}
      </div>}
    </section>
  );
}

function Bill({ bill: b }) {
  const lines = Array.isArray(b.lines) ? b.lines : [];
  return (
    <div className="pp-bill" data-testid="past-bill">
      <div className="pp-bill-top">
        <span>Bill {b.billNo}{b.billedOn ? ` · ${formatDay(b.billedOn)}` : ''}{b.paidBy ? ` · ${payWord(b.paidBy)}` : ''}</span>
        <span>{formatRupees(b.net)}</span>
      </div>
      {lines.map((l, i) => {
        const back = l.amount < 0 || l.quantity < 0;
        const word = [l.title || l.kind || 'Item', l.fabric, l.craft, l.colour, l.size].filter(Boolean).join(', ');
        return (
          <div key={i} className={`pp-line${back ? ' back' : ''}`}>
            <span>{back ? 'Returned: ' : ''}{word} × {Math.abs(l.quantity)}</span>
            <span>{formatRupees(l.amount)}</span>
          </div>
        );
      })}
      {b.net === 0 && <div className="pp-note">Sold and taken back on one bill. Not counted as a bill or a visit.</div>}
      {b.net < 0 && <div className="pp-note">Came to less than what came back. Not counted as a bill or a visit.</div>}
    </div>
  );
}

/** At the foot of the timeline: past purchases, kept together, never mixed in by date. */
export function PastOnTimeline({ customerId }) {
  const past = usePast(customerId);
  const bills = past.data?.bills ?? [];
  if (bills.length === 0) return null;
  const net = bills.reduce((t, b) => t + b.net, 0);
  return (
    <div className="pp-timeline" data-testid="past-on-timeline">
      <div className="pp-bill-top"><span>{plural(bills.length, 'past purchase', 'past purchases')}</span><span>{formatRupees(net)}</span></div>
      <div className="pp-note">Date not known unless the bill shows one. Kept here, never mixed in by date.</div>
    </div>
  );
}
