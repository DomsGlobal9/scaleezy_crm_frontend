import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import { useSendOne } from '../hooks/useMessages';

/**
 * A note to one customer on WhatsApp, from their page (Phase 3). The same rules as any offer --
 * consent, STOP, one offer in 3 days -- and it goes at once, from the shop's number.
 */
export default function SendOne({ customerId, name, onClose }) {
  const send = useSendOne(customerId);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const box = useRef(null);
  const opener = useRef(document.activeElement);
  const first = (name || '').trim().split(/\s+/)[0] || 'them';

  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await send.mutateAsync(text);
      toast.success(r?.sent ? `Sent to ${first} on WhatsApp.` : (r?.message || 'It goes out in a few minutes.'));
      onClose();
    } catch (err) { setError(err?.message || 'It could not be sent. Try again.'); }
  };

  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog" role="dialog" aria-modal="true" aria-labelledby="so-title" onSubmit={submit} data-testid="send-one">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}><h2 id="so-title">Message to {first}</h2><p>On WhatsApp, from the shop's number.</p></div>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <textarea ref={box} className="ms-area" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Message to ${first}`}
          placeholder={`Hi ${first}, the green Kanchi you tried is back in your size.`} />
        <p className="pe-hint">Counts towards their 1 offer in 3 days. "Reply STOP to stop these messages" is added at the end.</p>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns">
          <button type="submit" className="btn-primary" disabled={!text.trim() || send.isPending}>{send.isPending && <Loader2 size={14} className="animate-spin" />} Send</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
