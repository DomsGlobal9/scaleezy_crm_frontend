import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ShieldCheck, ShieldOff, ExternalLink } from 'lucide-react';
import { useConsent } from '../hooks/useCustomer';
import { formatDay } from '../utils/dates';
import LoadFailed from './LoadFailed';

/**
 * A customer's WhatsApp consent record (plan M6, the DPDP Act): where it stands now, in one sentence,
 * and every record behind it, newest first -- what was said, how, who recorded it, when, and which
 * part of ScaleEzy recorded it. Records are never changed; a later one says what happened next.
 *
 * Read only. Messages are sent from Inventory and the till, which read their own consent, so consent
 * is changed there; a change made only here would look done while messages kept going.
 */
export default function ConsentRecord({ customerId, name, inventoryHref, onClose }) {
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
            <h2 id="cr-title">WhatsApp offers: consent record</h2>
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
            <Standing now={d.now} first={d.records[0]} />
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
            <p className="cr-foot">
              Records are kept as they were made and never changed. To change this customer's consent, do it where messages are sent: Inventory's customer card, or the till. It comes here by itself.
              {inventoryHref && <> <a href={inventoryHref} target="_blank" rel="noreferrer">Open in Inventory <ExternalLink size={12} /></a></>}
            </p>
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
