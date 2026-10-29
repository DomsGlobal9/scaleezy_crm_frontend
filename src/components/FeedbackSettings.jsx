import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useFeedbackSettings, useSaveFeedback } from '../hooks/useMessages';
import LoadFailed from './LoadFailed';

/**
 * Automatic messages in Shop settings (the mockup approved 29 Oct): "Ask how the visit was" and the
 * shop's Google review link (decision N4: typed by the owner). On needs the link, because a happy
 * customer is sent there. The service checks the link and says what is wrong in its own words.
 */
export default function FeedbackSettings() {
  const s = useFeedbackSettings();
  const save = useSaveFeedback();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  if (s.isLoading) return <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the automatic messages…</div>;
  if (s.isError) return <LoadFailed what="the automatic messages" error={s.error} onRetry={() => s.refetch()} />;
  const d = s.data;
  const typed = url ?? d.reviewUrl ?? '';
  const send = async (body, ok) => {
    setError(null);
    try { await save.mutateAsync(body); setUrl(null); toast.success(ok); }
    catch (err) { setError(err?.message || 'The setting could not be saved. Try again.'); }
  };
  return (
    <div className="pe-auto" data-testid="automatic-messages">
      <h2>Automatic messages</h2>
      <p className="pe-hint">Sent only to customers who agreed to offers. STOP ends them all.</p>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-feedback">Ask how the visit was</h3>
          <p>A day after a bill. 4 or 5 stars are asked to tell others on Google; 1 to 3 also become a follow-up for you. Everyone can leave a Google review: asking only happy customers is against Google's rules.</p>
        </div>
        <button type="button" role="switch" aria-checked={d.on} aria-labelledby="pe-feedback" className={`pe-toggle${d.on ? ' on' : ''}`} disabled={save.isPending}
          onClick={() => send({ on: !d.on, ...(url !== null ? { reviewUrl: url } : {}) }, !d.on ? 'Customers are asked how the visit was, from tomorrow morning.' : 'Customers are no longer asked how the visit was.')} data-testid="feedback-switch" />
      </div>
      <label className="pe-field">
        <span>Google review link</span>
        <div className="pe-link-row">
          <input className="ms-input" value={typed} onChange={(e) => setUrl(e.target.value)} placeholder="https://g.page/r/…/review" inputMode="url" aria-label="Google review link" />
          {url !== null && url !== (d.reviewUrl ?? '') && (
            <button type="button" className="btn-primary ms-small" disabled={save.isPending} onClick={() => send({ reviewUrl: url }, 'The review link is saved.')}>Save the link</button>
          )}
        </div>
      </label>
      <p className="pe-hint">In Google, open your shop's profile and choose "Ask for reviews": copy the link it gives.</p>
      {error && <p className="pe-err" role="alert" data-testid="feedback-error">{error}</p>}
    </div>
  );
}
