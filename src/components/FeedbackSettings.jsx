import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useArrivalsSettings, useFeedbackSettings, useReviewAskSettings, useSaveArrivals, useSaveFeedback, useSaveReviewAsk, useSaveWinback, useWinbackSettings } from '../hooks/useMessages';
import Select from './common/Select';
import LoadFailed from './LoadFailed';

/**
 * Automatic messages in Shop settings (the mockup approved 29 Oct): "Ask how the visit was" with the
 * shop's Google review link (decision N4: typed by the owner), and "New in their size and colour" (A2). On needs the link, because a happy
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
          <p>A day after a till bill. 4 or 5 stars are asked to tell others on Google; 1 to 3 also become a follow-up for you. Everyone can leave a Google review: asking only happy customers is against Google's rules.</p>
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
      <ReviewAsk />
      <Arrivals />
      <WinBack />
    </div>
  );
}

/** Online orders, once they have arrived: the link to rate what they bought (the owner, 5 Nov). */
function ReviewAsk() {
  const s = useReviewAskSettings();
  const save = useSaveReviewAsk();
  const [error, setError] = useState(null);
  if (s.isLoading || s.isError) return s.isError ? <LoadFailed what="this setting" error={s.error} onRetry={() => s.refetch()} /> : null;
  const on = s.data.on;
  const flip = async () => {
    setError(null);
    try { await save.mutateAsync({ on: !on }); toast.success(!on ? 'From now on, online customers are asked to rate what they bought.' : 'Online customers are no longer asked.'); }
    catch (err) { setError(err?.message || 'The setting could not be saved. Try again.'); }
  };
  return (
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-review-ask">Ask online customers to rate what they bought</h3>
          <p>The morning after an online order has all arrived, with a link to their order, where each item has "Rate this item". Once per order, and not if they have already rated everything. From the moment you turn it on.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="pe-review-ask" className={`pe-toggle${on ? ' on' : ''}`} disabled={save.isPending} onClick={flip} data-testid="review-ask-switch" />
      </div>
      {error && <p className="pe-err" role="alert" data-testid="review-ask-error">{error}</p>}
    </>
  );
}

/** A2: when new stock comes in, tell those who hearted it or wear that size and colour. From the moment it goes on. */
function Arrivals() {
  const s = useArrivalsSettings();
  const save = useSaveArrivals();
  const [error, setError] = useState(null);
  if (s.isLoading || s.isError) return s.isError ? <LoadFailed what="the new-stock setting" error={s.error} onRetry={() => s.refetch()} /> : null;
  const on = s.data.on;
  const flip = async () => {
    setError(null);
    try { await save.mutateAsync({ on: !on }); toast.success(!on ? 'From now on, customers hear about new stock in their size and colour.' : 'Customers are no longer told about new stock.'); }
    catch (err) { setError(err?.message || 'The setting could not be saved. Try again.'); }
  };
  return (
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-arrivals">New in their size and colour</h3>
          <p>When new stock comes in: first those who hearted that piece in the online shop, then those who wear that size and colour. One a week at most, with the photo.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="pe-arrivals" className={`pe-toggle${on ? ' on' : ''}`} disabled={save.isPending} onClick={flip} data-testid="arrivals-switch" />
      </div>
      {error && <p className="pe-err" role="alert" data-testid="arrivals-error">{error}</p>}
    </>
  );
}

/** A4: regulars not seen lately get the shop's own offer, once each; and the weekly limit for all of these. */
function WinBack() {
  const s = useWinbackSettings();
  const save = useSaveWinback();
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState(null);
  if (s.isLoading || s.isError) return s.isError ? <LoadFailed what="the win-back setting" error={s.error} onRetry={() => s.refetch()} /> : null;
  const d = s.data;
  const typed = offer ?? d.offer;
  const send = async (body, ok) => {
    setError(null);
    try { await save.mutateAsync(body); setOffer(null); toast.success(ok); }
    catch (err) { setError(err?.message || 'The setting could not be saved. Try again.'); }
  };
  return (
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-winback">Win back regulars</h3>
          <p>{d.bills}+ bills, not seen for {d.days} days. Once each, until they come back. Only bills with a real date count.</p>
        </div>
        <button type="button" role="switch" aria-checked={d.on} aria-labelledby="pe-winback" className={`pe-toggle${d.on ? ' on' : ''}`} disabled={save.isPending}
          onClick={() => send({ on: !d.on }, !d.on ? 'From tomorrow morning, regulars not seen lately get your offer.' : 'Regulars are no longer sent the offer.')} data-testid="winback-switch" />
      </div>
      <label className="pe-field">
        <span>Their offer</span>
        <div className="pe-link-row">
          <input className="ms-input" value={typed} maxLength={120} onChange={(e) => setOffer(e.target.value)} aria-label="Their offer" data-testid="winback-offer" />
          {offer !== null && offer.trim() !== d.offer && (
            <button type="button" className="btn-primary ms-small" disabled={save.isPending} onClick={() => send({ offer }, 'The offer is saved.')} data-testid="winback-save">Save the offer</button>
          )}
        </div>
      </label>
      <p className="pe-hint" data-testid="winback-preview">They get: {d.text.replace('{name}', 'Meena').replace('{shop}', 'your shop').replace('{code}', 'MEENA4821').replace('{until}', `${d.validDays} days from sending`)} Reply STOP to stop offers.</p>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-valid">Valid for</h3>
          <p>Your staff see the offer and code on the customer's page, and mark it given with the bill.</p>
        </div>
        <span style={{ minWidth: 150 }}>
          <Select value={String(d.validDays)} onChange={(e) => send({ validDays: Number(e.target.value) }, 'How long the offer lasts is saved.')} aria-label="How long the offer lasts">
            {[15, 30, 45, 60].map(n => <option key={n} value={n}>{n} days</option>)}
          </Select>
        </span>
      </div>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-limit">No more than</h3>
          <p>Offers per customer per week, all of these together. "How was your visit?" doesn't count.</p>
        </div>
        <span style={{ minWidth: 150 }}>
          <Select value={String(d.weeklyLimit)} onChange={(e) => send({ weeklyLimit: Number(e.target.value) }, 'The weekly limit is saved.')} aria-label="Offers per customer per week" data-testid="weekly-limit">
            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} a week</option>)}
          </Select>
        </span>
      </div>
      {error && <p className="pe-err" role="alert" data-testid="winback-error">{error}</p>}
    </>
  );
}
