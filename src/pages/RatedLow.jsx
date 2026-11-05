import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRatedLow } from '../hooks/useReviews';
import CustomerList from '../components/CustomerList';
import LoadFailed from '../components/LoadFailed';

/**
 * "Rated 1 or 2": customers whose latest review or visit rating was 1 or 2. It works itself out, so
 * nobody adds or removes people. It is for staff to call and put things right, not a list to message.
 */
export default function RatedLow() {
  const navigate = useNavigate();
  const low = useRatedLow(true);
  const rows = low.data?.customers ?? [];
  return (
    <main className="crm-page gr-page">
      <Link to="/groups" className="sg-back"><ArrowLeft size={16} /> Customer groups</Link>
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1 data-testid="rated-low-title">Rated 1 or 2</h1>
          <p>Their latest review or visit rating was 1 or 2 out of 5. Ready-made: nobody adds or removes people. Call them and put it right.</p>
        </div>
      </div>
      {low.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : low.isError ? (
        <div className="crm-card"><LoadFailed what="this group" error={low.error} onRetry={() => low.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="crm-card crm-empty" data-testid="rated-low-empty"><h3>Nobody right now</h3><p>When a customer's latest rating is 1 or 2, they appear here.</p></div>
      ) : (
        <div className="crm-card" data-testid="rated-low-list">
          <CustomerList rows={rows} onOpen={(c) => navigate(`/customers/${c.id}?tab=reviews`)} />
          {low.data.count > rows.length && <p className="rv-note">Showing the newest {rows.length.toLocaleString('en-IN')} of {low.data.count.toLocaleString('en-IN')}.</p>}
        </div>
      )}
    </main>
  );
}
