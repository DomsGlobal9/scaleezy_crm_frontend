import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Trash2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useRemoveSegment, useSegment } from '../hooks/useSegments';
import { sentence } from '../utils/segmentWords';
import CustomerList from '../components/CustomerList';
import LoadFailed from '../components/LoadFailed';
import { Numbers } from './Segments';
import { Pager } from './SegmentEditor';

/**
 * One saved segment: what it is (its sentence), who is in it now, and -- for the owner or an admin --
 * change or remove it. Removing a segment takes it off the list; nobody's record is touched.
 */
export default function SegmentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const result = useSegment(id, page);
  const remove = useRemoveSegment();
  const mayManage = can('crm:segment:manage');
  const d = result.data;

  if (result.isLoading) {
    return <main className="crm-page"><div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the list…</div></main>;
  }
  if (result.isError) {
    return <main className="crm-page"><Link to="/segments" className="sg-back"><ArrowLeft size={16} /> Saved lists</Link><div className="crm-card"><LoadFailed what="this list" error={result.error} onRetry={() => result.refetch()} /></div></main>;
  }

  const doRemove = async () => {
    try { await remove.mutateAsync(id); navigate('/segments'); } catch { setConfirming(false); }
  };

  return (
    <main className="crm-page sg-page">
      <Link to="/segments" className="sg-back"><ArrowLeft size={16} /> Saved lists</Link>
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1 data-testid="segment-name">{d.segment.name}</h1>
          <p className="sg-sentence big">{sentence(d.segment.rules)}</p>
        </div>
        {mayManage && (
          <div className="crm-row sg-actions">
            <Link to={`/segments/${id}/edit`} className="btn-secondary"><Pencil size={14} /> Change</Link>
            {confirming ? (
              <span className="sg-confirm" role="group" aria-label="Remove this list?">
                <span>Remove it? Nobody's record changes.</span>
                <button type="button" className="btn-danger" onClick={doRemove} disabled={remove.isPending}>{remove.isPending ? 'Removing…' : 'Remove'}</button>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}><Trash2 size={14} /> Remove</button>
            )}
          </div>
        )}
      </div>

      <div className="crm-card sg-now"><Numbers summary={d.summary} big /></div>

      {d.customers.length === 0 ? (
        <div className="crm-card crm-muted" data-testid="nobody">Nobody is in it right now. People join by themselves as soon as they meet it.</div>
      ) : (
        <>
          <CustomerList rows={d.customers} onOpen={(c) => navigate(`/customers/${c.id}`)} />
          <Pager look={d} page={page} setPage={setPage} busy={result.isFetching} />
        </>
      )}
    </main>
  );
}
