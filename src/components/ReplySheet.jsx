import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import { useLead, useReplyLead, sourceWords, ago, clock, dayName } from '../hooks/useBookings';

/**
 * A reply to a lead (the owner, 20 Nov: "WhatsApp messages will be typed and sent automatically"). Typed here, sent
 * by CRM from the shop's number: WhatsApp never opens on a staff phone, and every message stays on their record.
 * What they asked and what the shop sent since read like a chat. Only a reply to their own question: no lists.
 */
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'them';
const TICKS = { SENT: '✓ sent', DELIVERED: '✓✓ delivered', READ: '✓✓ read', FAILED: 'not delivered' };

export default function ReplySheet({ leadId, onBook, onClose }) {
  const lead = useLead(leadId);
  const reply = useReplyLead();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const box = useRef(null);
  // One id per message typed: a double tap or a retry sends it once.
  const ref = useMemo(() => `${leadId}-${Date.now().toString(36)}`, [leadId, reply.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = lead.data?.lead;
  const first = firstOf(l?.customer?.name);

  const closing = useRef(onClose);
  closing.current = onClose;
  const opener = useRef(document.activeElement);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closing.current(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, []);

  const send = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await reply.mutateAsync({ id: leadId, text: text.trim(), ref });
      if (r?.message?.state === 'not-sent') { setError(`It did not go: ${r.message.reason}`); return; }
      toast.success(`Sent to ${first} on WhatsApp.`);
      setText('');
    } catch (err) { setError(err?.message || 'It could not be sent. Try again.'); }
  };

  const thread = [...(lead.data?.messages ?? [])].reverse();
  return createPortal(
    <div className="cr-backdrop bk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="cr-dialog bk-sheet" role="dialog" aria-modal="true" aria-labelledby="rp-title" onSubmit={send} data-testid="reply-sheet">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="rp-title">{l ? l.customer?.name : 'Reply'}</h2>
            <p>{l ? `Lead · ${sourceWords(l.source)}` : 'Loading…'}</p>
          </div>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {lead.isLoading ? <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p> : (
          <div className="rp-thread" aria-label="Messages">
            {l?.ask && <div className="rp-bubble them"><span>{l.ask}</span><small>{sourceWords(l.source)} · {ago(l.askedAt)}</small></div>}
            {thread.map((m, i) => (
              <div key={i} className={`rp-bubble me${m.state === 'not-sent' ? ' bad' : ''}`}>
                <span>{m.text}</span>
                <small>{m.by} · {m.state === 'not-sent' ? `not sent: ${m.reason}` : m.state === 'queued' ? 'going out' : TICKS[m.whatsapp] ?? 'sent'} · {dayName(m.at)}, {clock(m.at)}</small>
              </div>
            ))}
            {!l?.ask && thread.length === 0 && <p className="pe-hint">Nothing sent yet.</p>}
          </div>
        )}
        <label className="pe-field"><span>Your reply</span>
          <textarea ref={box} className="ms-area" rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder={`Hi ${first}, thank you for asking. Can you come in on Saturday?`} data-testid="reply-text" />
        </label>
        <p className="pe-hint">Goes from the shop's WhatsApp number, as you typed it. "Reply STOP" is added at the end.</p>
        {error && <p className="pe-err" role="alert">{error}</p>}
        <div className="pe-btns">
          <button type="submit" className="btn-primary" disabled={!text.trim() || reply.isPending} data-testid="reply-send">{reply.isPending && <Loader2 size={14} className="animate-spin" />} Send</button>
          {onBook && l && <button type="button" className="btn-secondary" onClick={() => onBook(l)}>Book a time instead</button>}
        </div>
      </form>
    </div>,
    document.body
  );
}
