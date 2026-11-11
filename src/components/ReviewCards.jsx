import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useHideReasons, useReviewAct } from '../hooks/useReviews';
import { formatDay } from '../utils/dates';
import LoadFailed from './LoadFailed';

/**
 * A customer's review or private feedback, and what the shop may do with it: reply, hide for a listed
 * reason, mark handled. Their words are shown as plain text, exactly as written, and nothing here can
 * change them. What Inventory refuses is shown in its own sentence.
 */
const REPLY_LIMIT = 500;

export function Stars({ rating }) {
  return (
    <span className={`rv-stars${rating <= 2 ? ' low' : ''}`} role="img" aria-label={`${rating} of 5`} data-testid="stars">
      {'★'.repeat(rating)}{'☆'.repeat(Math.max(0, 5 - rating))}
    </span>
  );
}

const webAddress = (u) => /^https?:\/\//i.test(u || '');

function Photos({ photos }) {
  const shown = (photos ?? []).filter(webAddress);
  if (shown.length === 0) return null;
  return (
    <div className="rv-pics">
      {shown.map(u => (
        <a key={u} href={u} target="_blank" rel="noreferrer noopener" aria-label="Open the customer's photo">
          {/* A photo can stop working once a customer is erased: it just goes, with no broken picture. */}
          <img src={u} alt="" loading="lazy" onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
        </a>
      ))}
    </div>
  );
}

export const reviewItem = (r) => [r.title, r.variant].filter(Boolean).join(', ');
export const feedbackTitle = (f) => (f.orderNumber ? `Private feedback on ${f.orderNumber}` : 'Private feedback on an online order');

/** Reply, change or take off the reply, hide, show again. Nothing for someone who may only look. */
export function ReviewActions({ review: r, note }) {
  const { can } = usePermission();
  const act = useReviewAct();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [error, setError] = useState(null);
  const box = useRef(null);
  const closeHide = useCallback(() => setHiding(false), []);

  useEffect(() => { if (replying) box.current?.focus(); }, [replying]);
  if (!can('crm:reviews')) return note ? <div className="rv-note">{note}</div> : null;

  const run = async (what, done) => {
    setError(null);
    try {
      await act.mutateAsync(what);
      done();
    } catch (e) {
      setError(e?.message || 'That could not be saved. Try again.');
    }
  };
  const saveReply = (e) => {
    e.preventDefault();
    run({ act: 'reply', id: r.id, value: text }, () => { setReplying(false); toast.success('Reply saved.'); });
  };

  if (replying) {
    return (
      <form className="rv-form" onSubmit={saveReply}>
        <textarea ref={box} className="input-field rv-area" rows={3} maxLength={REPLY_LIMIT} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your reply" data-testid="reply-box" />
        {error && <p className="pe-err" role="alert" data-testid="review-error">{error}</p>}
        <div className="rv-acts">
          <button type="submit" className="btn-primary cp-btn" disabled={!text.trim() || act.isPending} data-testid="reply-save">
            {act.isPending && <Loader2 size={14} className="animate-spin" />} Save the reply
          </button>
          <button type="button" className="btn-secondary cp-btn" onClick={() => { setReplying(false); setError(null); }}>Cancel</button>
          <span className="rv-note">{text.length} of {REPLY_LIMIT} letters. It shows on the shop.</span>
        </div>
      </form>
    );
  }

  const openReply = () => { setText(r.reply ?? ''); setError(null); setReplying(true); };
  return (
    <>
      {error && <p className="pe-err" role="alert" data-testid="review-error">{error}</p>}
      {r.hidden ? (
        <div className="rv-acts">
          <button type="button" className="btn-secondary cp-btn" disabled={act.isPending} data-testid="review-unhide"
            onClick={() => run({ act: 'unhide', id: r.id }, () => toast.success('It is showing on the shop again.'))}>Show again</button>
          {note && <span className="rv-note">{note}</span>}
        </div>
      ) : confirmingOff ? (
        <div className="rv-acts" data-testid="reply-off-confirm">
          <span className="rv-ask">Take this reply off the shop?</span>
          <button type="button" className="btn-secondary cp-btn" disabled={act.isPending} data-testid="reply-off-yes"
            onClick={() => run({ act: 'removeReply', id: r.id }, () => { setConfirmingOff(false); toast.success('Reply taken off.'); })}>Take it off</button>
          <button type="button" className="btn-secondary cp-btn" onClick={() => setConfirmingOff(false)}>Keep it</button>
        </div>
      ) : (
        <div className="rv-acts">
          {r.reply ? (
            <>
              <button type="button" className="btn-secondary cp-btn" onClick={openReply} data-testid="reply-open">Change reply</button>
              <button type="button" className="btn-secondary cp-btn" onClick={() => setConfirmingOff(true)} data-testid="reply-off">Take reply off</button>
            </>
          ) : (
            <button type="button" className={`${r.needsReply ? 'btn-primary' : 'btn-secondary'} cp-btn`} onClick={openReply} data-testid="reply-open">Reply</button>
          )}
          <button type="button" className="btn-secondary cp-btn" onClick={() => setHiding(true)} data-testid="hide-open">Hide…</button>
          {note && <span className="rv-note">{note}</span>}
        </div>
      )}
      {hiding && <HideDialog review={r} onClose={closeHide} />}
    </>
  );
}

export function FeedbackActions({ feedback: f, note }) {
  const { can } = usePermission();
  const act = useReviewAct();
  const [error, setError] = useState(null);
  if (!can('crm:reviews')) return note ? <div className="rv-note">{note}</div> : null;
  const open = !f.handledAt;
  const change = async () => {
    setError(null);
    try {
      await act.mutateAsync({ act: 'handled', id: f.id, value: open });
      toast.success(open ? 'Marked handled.' : 'Opened again.');
    } catch (e) { setError(e?.message || 'That could not be saved. Try again.'); }
  };
  return (
    <>
      {error && <p className="pe-err" role="alert" data-testid="review-error">{error}</p>}
      <div className="rv-acts">
        <button type="button" className={`${open ? 'btn-primary' : 'btn-secondary'} cp-btn`} onClick={change} disabled={act.isPending} data-testid="feedback-handled">
          {open ? 'Mark handled' : 'Open again'}
        </button>
        {note && <span className="rv-note">{note}</span>}
      </div>
    </>
  );
}

/** Hide always asks why, from Inventory's list. Nothing is chosen for them, and Hide stays off until something is. */
function HideDialog({ review: r, onClose }) {
  const reasons = useHideReasons(true);
  const act = useReviewAct();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const closeRef = useRef(null);
  const opener = useRef(document.activeElement);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await act.mutateAsync({ act: 'hide', id: r.id, value: reason });
      toast.success('The review is hidden.');
      onClose();
    } catch (err) { setError(err?.message || 'The review could not be hidden. Try again.'); }
  };

  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cr-dialog" role="dialog" aria-modal="true" aria-labelledby="rv-hide-title" data-testid="hide-dialog">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="rv-hide-title">Hide this review?</h2>
            <p>It leaves the shop and the average. You can bring it back.</p>
          </div>
          <button ref={closeRef} type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {reasons.isLoading ? (
          <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the reasons…</div>
        ) : reasons.isError ? (
          <LoadFailed what="the reasons" error={reasons.error} onRetry={() => reasons.refetch()} />
        ) : (
          <form className="rv-reasons" onSubmit={submit}>
            <fieldset>
              <legend className="sr-only">Why is it being hidden?</legend>
              {(reasons.data ?? []).map(o => (
                <label key={o.key} className={`rv-opt${reason === o.key ? ' on' : ''}`}>
                  <input type="radio" name="hide-reason" value={o.key} checked={reason === o.key} onChange={() => setReason(o.key)} />
                  {o.label}
                </label>
              ))}
            </fieldset>
            <p className="rv-note">A low rating is not a reason. Reply to it instead.</p>
            {error && <p className="pe-err" role="alert" data-testid="review-error">{error}</p>}
            <div className="pe-btns">
              <button type="submit" className="pe-danger" disabled={!reason || act.isPending} data-testid="hide-go">
                {act.isPending && <Loader2 size={14} className="animate-spin" />} Hide it
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Keep showing</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

function reviewPill(r) {
  if (r.hidden) return <span className="rv-pill grey" data-testid="review-state">Hidden: {r.hiddenReason ?? 'by the shop'}</span>;
  if (r.needsReply) return <span className="rv-pill" data-testid="review-state">Needs a reply</span>;
  if (r.reply) return <span className="rv-pill grey" data-testid="review-state">Replied</span>;
  return null;
}

/** One review on the customer's page. */
export function ReviewCard({ review: r }) {
  const when = [
    formatDay(r.at),
    r.editedAt ? `edited by the customer ${formatDay(r.editedAt)}` : null,
    r.hidden && r.hiddenAt ? `hidden${r.hiddenBy ? ` by ${r.hiddenBy}` : ''} on ${formatDay(r.hiddenAt)}` : null
  ].filter(Boolean).join(' · ');
  return (
    <article className="rv-card" data-testid="review-card" data-review={r.id}>
      <div className="rv-top"><Stars rating={r.rating} />{reviewPill(r)}</div>
      <div className="rv-item">{reviewItem(r)}</div>
      {r.body ? <p className="rv-words" data-testid="review-words">{r.body}</p> : <p className="rv-note">Stars only: no words.</p>}
      <Photos photos={r.photos} />
      <div className="rv-note">{when}</div>
      {r.reply && (
        <div className="rv-reply" data-testid="review-reply">
          <b>Your reply{r.replyBy ? `, by ${r.replyBy}` : ''}{r.replyAt ? `, on ${formatDay(r.replyAt)}` : ''}</b>
          <span>{r.reply}</span>
        </div>
      )}
      <ReviewActions review={r} />
    </article>
  );
}

/** One private feedback on the customer's page. Only the shop ever sees it. */
export function FeedbackCard({ feedback: f }) {
  const open = !f.handledAt;
  return (
    <article className="rv-card" data-testid="feedback-card" data-feedback={f.id}>
      <div className="rv-top">
        <span className="rv-kind">{feedbackTitle(f)}</span>
        <span className={`rv-pill${open ? '' : ' grey'}`} data-testid="feedback-state">{open ? 'Open' : 'Handled'}</span>
      </div>
      <p className="rv-words">{f.body}</p>
      <div className="rv-note">
        {[formatDay(f.at), 'only the shop sees this', !open ? `handled${f.handledBy ? ` by ${f.handledBy}` : ''} on ${formatDay(f.handledAt)}` : null].filter(Boolean).join(' · ')}
      </div>
      <FeedbackActions feedback={f} />
    </article>
  );
}
