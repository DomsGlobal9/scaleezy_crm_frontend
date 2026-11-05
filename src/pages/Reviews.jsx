import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, ShieldOff, Star } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useReviewList } from '../hooks/useReviews';
import { formatPhone } from '../utils/phone';
import { since } from '../utils/dates';
import { rowLink } from '../components/common/rowLink';
import LoadFailed from '../components/LoadFailed';
import { FeedbackActions, ReviewActions, Stars, reviewItem } from '../components/ReviewCards';

/**
 * One simple list (the owner, 5 Nov): reviews waiting for a reply and open private feedback, each
 * opening that customer's page. Without it an unhappy review is only seen if someone opens that
 * customer. A review nobody can be matched to has no page, so its buttons are on the line itself.
 */
const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function Reviews() {
  const { can } = usePermission();
  const list = useReviewList();

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  const stats = list.data?.stats;
  const items = list.data?.items ?? [];
  return (
    <main className="crm-page rv-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Star size={24} aria-hidden="true" /> Reviews</h1>
          <p>What is waiting: reviews from the online shop with no reply yet, and open private feedback.</p>
        </div>
      </div>

      {list.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading reviews…</div>
      ) : list.isError ? (
        <div className="crm-card"><LoadFailed what="the reviews" error={list.error} onRetry={() => list.refetch()} /></div>
      ) : (
        <div className="crm-card">
          <div className="rv-facts" data-testid="review-facts">
            {stats.count > 0 && <span><b>{stats.average.toLocaleString('en-IN')}</b> of 5, from {stats.count.toLocaleString('en-IN')} {stats.count === 1 ? 'review' : 'reviews'}</span>}
            <span><b>{stats.needsReply.toLocaleString('en-IN')}</b> {stats.needsReply === 1 ? 'needs a reply' : 'need a reply'}</span>
            <span><b>{stats.feedbackOpen.toLocaleString('en-IN')}</b> private feedback open</span>
          </div>
          {items.length === 0 ? (
            <div className="crm-empty" data-testid="reviews-empty">
              <h3>Nothing is waiting</h3>
              <p>A review of 3 stars or fewer, or private feedback from an online order, appears here until someone answers it.</p>
            </div>
          ) : (
            <ul className="rv-list">{items.map(i => <Line key={`${i.kind}:${i.id}`} item={i} />)}</ul>
          )}
          {list.data.more && <p className="rv-note" data-testid="reviews-more">Showing the newest 200 of each.</p>}
        </div>
      )}
    </main>
  );
}

function Line({ item: i }) {
  const navigate = useNavigate();
  const review = i.kind === 'review';
  const page = i.customer ? `/customers/${i.customer.id}?tab=reviews` : null;
  const ago = sentence(since(i.at));
  return (
    <li {...(page ? rowLink(() => navigate(page), { label: `Open ${i.name}` }) : {})} className={`rv-line${page ? ' row-link' : ''}`}
      data-testid="review-line" data-kind={i.kind} data-has-page={page ? 'yes' : 'no'}>
      <div className="rv-top">
        <span className="rv-kind">
          {i.name}: {review ? <><Stars rating={i.rating} /> {reviewItem(i)}</> : <>private feedback on {i.orderNumber || 'an online order'}</>}
        </span>
        {page
          ? <Link className="rv-open" to={page}>Open customer <ChevronRight size={14} aria-hidden="true" /></Link>
          : i.phone && <span className="rv-note">{formatPhone(i.phone)}</span>}
      </div>
      {i.body ? <p className="rv-words clamp" data-testid="review-words">{i.body}</p> : <p className="rv-note">Stars only: no words.</p>}
      {page ? <div className="rv-note">{ago}</div> : review
        ? <ReviewActions review={i} note={`${ago} · no customer has this number yet`} />
        : <FeedbackActions feedback={i} note={`${ago} · no customer has this number yet`} />}
    </li>
  );
}
