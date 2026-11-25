import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight, Gift, HandCoins, Loader2, PackageCheck, Shirt, Star, ThumbsUp, UserRoundCheck } from 'lucide-react';
import { useArrivalsSettings, useFeedbackSettings, useReviewAskSettings, useSaveArrivals, useSaveFeedback, useSaveReviewAsk, useSaveWinback, useWinbackSettings } from '../hooks/useMessages';
import Select from './common/Select';
import { Parcel, Dues, Referral } from './NextSettings';
import { parcelSetting, duesSetting, referralSetting } from '../hooks/useNext';
import { HowItWorks, Lede, SidePanel, filled } from './SettingsHelp';
import LoadFailed from './LoadFailed';

/**
 * Automatic messages in Settings (25 Nov, the owner: "pages are too long, do it user friendly"): a short list, one row
 * each (what it does in one sentence, on or off), and a panel that opens on the row with everything about that one
 * message: how it works, what the customer gets, its options and its switch. The panel is in the address (?msg=), so
 * Back closes it and a link opens one.
 */
const MESSAGES = [
  { key: 'feedback', title: 'Ask how the visit was', plain: 'The day after a bill, asks how the visit was. Happy customers get your Google review link.', icon: ThumbsUp },
  { key: 'review-ask', title: 'Ask online customers to rate what they bought', plain: 'After an online order arrives, one message asks them to rate it.', icon: Star },
  { key: 'arrivals', title: 'New in their size and colour', plain: 'When new pieces arrive, customers who would want them hear first, with a photo.', icon: Shirt },
  { key: 'winback', title: 'Win back regulars', plain: 'A good customer who stopped coming gets one offer to come back.', icon: UserRoundCheck },
  { key: 'parcel', title: 'Parcel updates', plain: 'Online buyers hear when their parcel ships and when it arrives.', icon: PackageCheck },
  { key: 'dues', title: 'Money owed reminders', plain: 'A gentle reminder of money still due, with a link to pay when there is one.', icon: HandCoins },
  { key: 'referral', title: 'Bring a friend', plain: 'Customers bring friends with a code; both get points when the friend buys.', icon: Gift }
];

export default function FeedbackSettings({ shop }) {
  const [params, setParams] = useSearchParams();
  const feedback = useFeedbackSettings();
  const reviewAsk = useReviewAskSettings();
  const arrivals = useArrivalsSettings();
  const winback = useWinbackSettings();
  const parcel = parcelSetting.use();
  const dues = duesSetting.use();
  const referral = referralSetting.use();
  const on = { feedback: feedback.data?.on, 'review-ask': reviewAsk.data?.on, arrivals: arrivals.data?.on, winback: winback.data?.on, parcel: parcel.data?.on, dues: dues.data?.on, referral: referral.data?.on };
  const openKey = MESSAGES.some(m => m.key === params.get('msg')) ? params.get('msg') : null;
  const open = (key) => setParams(p => { const n = new URLSearchParams(p); if (key) n.set('msg', key); else n.delete('msg'); return n; });
  const current = MESSAGES.find(m => m.key === openKey);
  const Body = { feedback: VisitAsk, 'review-ask': ReviewAsk, arrivals: Arrivals, winback: WinBack, parcel: Parcel, dues: Dues, referral: Referral }[openKey];

  if (feedback.isError) return <LoadFailed what="the automatic messages" error={feedback.error} onRetry={() => feedback.refetch()} />;
  return (
    <div className="pe-auto" data-testid="automatic-messages">
      <h2>Automatic messages</h2>
      <Lede>WhatsApp messages CRM sends by itself from your shop's number, at the right moment. Each stays off until you turn it on, and anyone who replies STOP gets nothing more.</Lede>
      <ul className="sh-list">
        {MESSAGES.map(m => {
          const Icon = m.icon;
          return (
            <li key={m.key}>
              <button type="button" className="sh-item" onClick={() => open(m.key)} data-testid={`auto-open-${m.key}`}>
                <span className="sh-item-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="sh-item-text"><b>{m.title}</b><span>{m.plain}</span></span>
                <span className={`st-chip${on[m.key] ? ' on' : ''}`}>{on[m.key] === undefined ? '…' : on[m.key] ? 'On' : 'Off'}</span>
                <ChevronRight size={16} aria-hidden="true" className="sh-item-go" />
              </button>
            </li>
          );
        })}
      </ul>
      <WeeklyLimit />
      {current && Body && (
        <SidePanel title={current.title} onClose={() => open(null)} testid="auto-panel">
          <Body shop={shop} />
        </SidePanel>
      )}
    </div>
  );
}

/** The feedback ask: "How was your visit?" the day after a till bill, with the shop's Google review link. */
function VisitAsk({ shop }) {
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
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id="pe-feedback">Ask how the visit was</h3>
          <p className="sh-plain">The day after a bill, CRM asks the customer how their visit was.</p>
          <HowItWorks testid="how-feedback" rows={[
            ['When', 'A day after a till bill.'],
            ['Who gets it', 'Customers who agreed to offers, once a visit. It does not count towards their weekly offers.'],
            ['What happens next', '4 or 5 stars: they are asked to tell others on Google, with your review link. 1 to 3 stars: it also becomes a follow-up for you in To do today.'],
            ['Good to know', "Everyone can leave a Google review: asking only happy customers is against Google's rules."],
            ['You decide', 'Your Google review link, below. It is needed to turn this on.']
          ]} message={{ text: filled('Hi {name}, thank you for shopping at {shop} yesterday. How was your visit? Tap to tell us, it takes a second: {link}', shop), foot: 'Reply STOP to stop these messages.' }} />
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
    </>
  );
}

/** Online orders, once they have arrived: the link to rate what they bought (the owner, 5 Nov). */
function ReviewAsk({ shop }) {
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
          <p className="sh-plain">After an online order arrives, one message asks the customer to rate what they bought.</p>
          <HowItWorks testid="how-review-ask" rows={[
            ['When', 'The morning after an online order has all arrived.'],
            ['Who gets it', 'The customer who ordered, once per order. Not if they have already rated everything.'],
            ['What happens next', 'The link opens their order, where each item has "Rate this item". Ratings show in Reviews.'],
            ['From when', 'Orders that arrive after you turn it on.']
          ]} message={{ text: filled('Hi {name}, your order SO-1042 from {shop} has arrived. We hope you love it! Tap to rate what you bought, it takes a minute: {link}', shop), foot: 'Reply STOP to stop these messages.' }} />
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="pe-review-ask" className={`pe-toggle${on ? ' on' : ''}`} disabled={save.isPending} onClick={flip} data-testid="review-ask-switch" />
      </div>
      {error && <p className="pe-err" role="alert" data-testid="review-ask-error">{error}</p>}
    </>
  );
}

/** A2: when new stock comes in, tell those who hearted it or wear that size and colour. From the moment it goes on. */
function Arrivals({ shop }) {
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
          <p className="sh-plain">When new pieces arrive, the customers who would want them hear about it first, with a photo.</p>
          <HowItWorks testid="how-arrivals" rows={[
            ['When', 'New stock comes into your shop.'],
            ['Who gets it', 'First those who hearted that piece in the online shop, then those who wear that size and colour. Only customers who agreed to offers.'],
            ['How often', 'One a week at most for each customer, with the photo.'],
            ['Who never does', 'Anyone who replied STOP, and anyone who already got this week\'s offers.']
          ]} message={{ text: filled('{name}, a new Kanchi silk saree just came in, in green, your colour, and in your size. See it and try it on before you visit: {link}', shop), foot: 'Reply STOP to stop offers.' }} />
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="pe-arrivals" className={`pe-toggle${on ? ' on' : ''}`} disabled={save.isPending} onClick={flip} data-testid="arrivals-switch" />
      </div>
      {error && <p className="pe-err" role="alert" data-testid="arrivals-error">{error}</p>}
    </>
  );
}

/** A4: regulars not seen lately get the shop's own offer, once each; and the weekly limit for all of these. */
function WinBack({ shop }) {
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
          <p className="sh-plain">A good customer who stopped coming gets one offer to come back.</p>
          <HowItWorks testid="how-winback" rows={[
            ['When', `A customer with ${d.bills} or more bills has not been in for ${d.days} days.`],
            ['Good to know', 'Once each, until they come back. Only bills with a real date count.'],
            ['Who gets it', 'Only customers who agreed to offers.'],
            ['Who never does', 'Anyone who replied STOP, and anyone who already had this week\'s offers.'],
            ['Your staff see', 'The offer and its code on the customer\'s page. They mark it given with the bill.'],
            ['You decide', 'The offer, and how long the code works, below.']
          ]} />
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
      {error && <p className="pe-err" role="alert" data-testid="winback-error">{error}</p>}
    </>
  );
}

/** How many offers one customer can get in a week, all of them together. */
function WeeklyLimit() {
  const s = useWinbackSettings();
  const save = useSaveWinback();
  const [error, setError] = useState(null);
  if (!s.data) return null;
  const put = async (n) => {
    setError(null);
    try { await save.mutateAsync({ weeklyLimit: n }); toast.success('The weekly limit is saved.'); }
    catch (err) { setError(err?.message || 'The setting could not be saved. Try again.'); }
  };
  return (
    <>
      <div className="sh-limit">
        <div>
          <h3 id="pe-limit">Offers per customer</h3>
          <p>No customer gets more offers than this in a week, all of these together. "How was your visit?", parcel updates and money owed reminders don't count.</p>
        </div>
        <span className="sh-limit-pick">
          <Select value={String(s.data.weeklyLimit)} onChange={(e) => put(Number(e.target.value))} aria-label="Offers per customer per week" data-testid="weekly-limit">
            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>At most {n} a week</option>)}
          </Select>
        </span>
      </div>
      {error && <p className="pe-err" role="alert">{error}</p>}
    </>
  );
}
