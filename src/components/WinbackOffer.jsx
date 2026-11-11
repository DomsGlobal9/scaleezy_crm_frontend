import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Gift } from 'lucide-react';
import { useGiveWinback, useWinbackOffer } from '../hooks/useWork';
import { usePermission } from '../hooks/usePermission';
import Select from './common/Select';

/** "9 Dec" for a shop day ("2026-12-09"). */
export const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * The win-back offer this customer was sent, at the top of their page while it is open (the owner's OK,
 * 9 Nov): what to give, their code to check on their phone, until when, and "Mark as given" with the bill.
 * Given or ended, it is gone from here and on their timeline instead.
 */
export default function WinbackOffer({ customerId }) {
  const { can } = usePermission();
  const q = useWinbackOffer(customerId);
  const give = useGiveWinback(customerId);
  const [giving, setGiving] = useState(false);
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const o = q.data?.open;
  if (!o) return null;
  const bills = q.data.bills ?? [];
  const today = new Date().toLocaleDateString('en-CA');
  const chosen = bill ?? (bills[0]?.id ?? '');
  const label = (b) => [b.on === today ? 'Today' : shortDay(b.on), b.title.replace(/^bill /i, ''), b.amount !== null ? rupees(b.amount) : null].filter(Boolean).join(' · ');

  const submit = async () => {
    setError(null);
    try {
      await give.mutateAsync({ offerId: o.id, billId: chosen });
      toast.success('Marked as given.');
      setGiving(false);
    } catch (err) { setError(err?.message || 'The offer could not be marked as given. Try again.'); }
  };

  return (
    <div className="wb-offer" role="status" data-testid="winback-offer">
      <div className="wb-top">
        <div>
          <div className="wb-label"><Gift size={14} /> Give them the win-back offer</div>
          <div className="wb-what">{o.offer.replace(/[.!]+$/, '')}</div>
          <div className="wb-when">Sent on WhatsApp {shortDay(o.sentOn)} · valid till {shortDay(o.validUntil)}. Check the code on their phone matches.</div>
        </div>
        <div className="wb-side">
          <div className="wb-code" data-testid="winback-code">{o.code}</div>
          {can('crm:customer:update') && !giving && (
            <button type="button" className="btn-primary cp-btn" style={{ marginTop: 6 }} onClick={() => { setGiving(true); setError(null); }} data-testid="winback-give">Mark as given</button>
          )}
        </div>
      </div>
      {giving && (
        <div className="wb-give" data-testid="winback-give-panel">
          <p>Which bill was it on?</p>
          <Select value={chosen} onChange={(e) => setBill(e.target.value)} aria-label="The bill it was given on">
            {bills.map(b => <option key={b.id} value={b.id}>{label(b)}</option>)}
            <option value="">Not in the list yet</option>
          </Select>
          <div className="wb-actions">
            <button type="button" className="btn-primary cp-btn" disabled={give.isPending} onClick={submit} data-testid="winback-give-confirm">Mark as given</button>
            <button type="button" className="btn-secondary cp-btn" disabled={give.isPending} onClick={() => { setGiving(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="wb-err" role="alert" data-testid="winback-give-error">{error}</p>}
    </div>
  );
}

/** Today: how many win-back offers are out, so staff know why someone may show a code. A count, not a list to call. */
export function WinbackToday({ winback: w }) {
  if (!w || (w.open === 0 && w.givenThisMonth === 0)) return null;
  return (
    <section className="crm-card wb-today" data-testid="winback-today">
      <div>
        <h2><Gift size={15} /> Win-back offers open</h2>
        <p>Regulars we've missed were sent your offer. If one comes in, their page shows the offer and code.{w.givenThisMonth ? ` ${w.givenThisMonth} given this month.` : ''}</p>
      </div>
      <strong>{w.open}</strong>
    </section>
  );
}
