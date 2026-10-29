import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, Loader2, ShieldCheck, ShieldOff, ExternalLink } from 'lucide-react';
import { useConsent } from '../hooks/useCustomer';
import { useProfileState, useSetOffers } from '../hooks/useProfileEdit';
import { formatDay } from '../utils/dates';
import LoadFailed from './LoadFailed';

/**
 * A customer's WhatsApp consent record (plan M6, the DPDP Act): where it stands now, in one sentence,
 * and every record behind it, newest first -- what was said, how, who recorded it, when, and which
 * part of ScaleEzy recorded it. Records are never changed; a later one says what happened next.
 *
 * `editable` (customer:update, and a customer Inventory knows): the answer can be changed at the top.
 * The change is made in Inventory, which sends the messages and reads consent there, so it is never
 * "done" here while messages keep going. STOP is the customer's own word: nobody can undo it here.
 * Otherwise read only, and changed where messages are sent (Inventory, the till).
 */
export default function ConsentRecord({ customerId, name, inventoryHref, editable = false, hasPhone = true, onClose }) {
  const consent = useConsent(customerId);
  const closeRef = useRef(null);
  const opener = useRef(document.activeElement);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const d = consent.data;
  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cr-dialog" role="dialog" aria-modal="true" aria-labelledby="cr-title" data-testid="consent-record">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="cr-title">{editable ? 'WhatsApp offers' : 'WhatsApp offers: consent record'}</h2>
            <p>{name}</p>
          </div>
          <button ref={closeRef} type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {consent.isLoading ? (
          <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the record…</div>
        ) : consent.isError ? (
          <LoadFailed what="the consent record" error={consent.error} onRetry={() => consent.refetch()} />
        ) : (
          <>
            {editable ? <Answer customerId={customerId} hasPhone={hasPhone} /> : <Standing now={d.now} first={d.records[0]} />}
            {d.records.length === 0 ? (
              <p className="crm-muted" data-testid="consent-none">Nothing recorded yet: nobody has asked them, or the answer was not written down. Offers on WhatsApp are not sent without a yes.</p>
            ) : (
              <ol className="cr-list" aria-label="Every record, newest first">
                {d.records.map(r => (
                  <li key={r.id} className={`cr-entry${r.granted ? '' : ' no'}`} data-testid="consent-entry">
                    <span className="cr-mark" aria-hidden="true">{r.granted ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cr-what">{r.title}</div>
                      <div className="cr-how">{[r.how, r.byName ? `recorded by ${r.byName}` : null, `from ${r.from}`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <time className="cr-when" dateTime={r.at}>{formatDay(r.at)}<span>{new Date(r.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span></time>
                  </li>
                ))}
              </ol>
            )}
            {editable ? (
              <p className="cr-foot">Records are kept as they were made and never changed. A change made here is saved in Inventory too, which sends the messages.</p>
            ) : (
              <p className="cr-foot">
                Records are kept as they were made and never changed. To change this customer's consent, do it where messages are sent: Inventory's customer card, or the till. It comes here by itself.
                {inventoryHref && <> <a href={inventoryHref} target="_blank" rel="noreferrer">Open in Inventory <ExternalLink size={12} /></a></>}
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Where it stands now, as one sentence a shop owner could read out. */
function Standing({ now, first }) {
  if (now?.stoppedAt) {
    return <p className="cr-now no" data-testid="consent-now">They replied STOP on {formatDay(now.stoppedAt)}. No offers go to them on WhatsApp.</p>;
  }
  if (now?.whatsappOffers && first) {
    return <p className="cr-now" data-testid="consent-now">They agreed on {formatDay(first.at)}{first.how ? `, ${first.how}` : ''}{first.byName ? `, recorded by ${first.byName}` : ''}. Offers may go to them on WhatsApp.</p>;
  }
  if (first) {
    return <p className="cr-now no" data-testid="consent-now">They said no on {formatDay(first.at)}. No offers go to them on WhatsApp.</p>;
  }
  return <p className="cr-now no" data-testid="consent-now">Not agreed yet. No offers go to them on WhatsApp.</p>;
}

/**
 * Their answer, to change: yes or no, as Inventory holds it, with who changed it last. After STOP, or
 * with no phone, it cannot be turned on, and the box says why instead.
 */
function Answer({ customerId, hasPhone }) {
  const state = useProfileState(customerId);
  const save = useSetOffers(customerId);
  const [choice, setChoice] = useState(null);
  const [error, setError] = useState(null);

  if (state.isLoading) return <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Reading their answer…</div>;
  if (state.isError) return <LoadFailed what="their answer" error={state.error} onRetry={() => state.refetch()} />;
  const s = state.data;
  if (s.stoppedAt) {
    return <p className="pe-locked" data-testid="offers-locked">They replied STOP on {formatDay(s.stoppedAt)}, so they get no offers. Only they can start them again, by messaging the shop.</p>;
  }
  if (!hasPhone && !s.agreed) {
    return <p className="pe-locked" data-testid="offers-locked">There is no phone number for them, so offers cannot be turned on. Add one in Inventory first.</p>;
  }
  const picked = choice ?? s.agreed;
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync(picked);
      setChoice(null);
      toast.success(picked ? 'Saved: they agreed to offers on WhatsApp.' : 'Saved: no offers for them on WhatsApp.');
    } catch (err) {
      setError(err?.message || 'Their answer could not be saved. Try again.');
    }
  };
  return (
    <div className="pe-answer" data-testid="offers-answer">
      <div className="pe-choice" role="radiogroup" aria-label="Their answer">
        <button type="button" role="radio" aria-checked={picked === true} className={`pe-opt${picked === true ? ' on' : ''}`} onClick={() => setChoice(true)}>
          Yes, send offers<small>They said yes to offers on WhatsApp</small>
        </button>
        <button type="button" role="radio" aria-checked={picked === false} className={`pe-opt${picked === false ? ' on' : ''}`} onClick={() => setChoice(false)}>
          No offers<small>They said no, or changed their mind</small>
        </button>
      </div>
      {s.changedAt && <p className="pe-said">Last changed{s.changedBy ? ` by ${s.changedBy}` : ''} on {formatDay(s.changedAt)}.</p>}
      {error && <p className="pe-err" role="alert">{error}</p>}
      <div className="pe-btns">
        <button type="button" className="btn-primary" disabled={picked === s.agreed || save.isPending} onClick={submit} data-testid="offers-save">
          {save.isPending && <Loader2 size={14} className="animate-spin" />} Save the answer
        </button>
      </div>
      <p className="pe-hint">Every change is kept below, newest first, with who recorded it.</p>
    </div>
  );
}
