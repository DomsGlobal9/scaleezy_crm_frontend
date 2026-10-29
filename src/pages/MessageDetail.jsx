import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useDeleteDraft, useMessage, useMessageAction, useMessagesOverview } from '../hooks/useMessages';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';
import MessageBubble from '../components/MessageBubble';
import LoadFailed from '../components/LoadFailed';
import { StatusPill } from './Messages';

/**
 * One message (Phase 3): as Inventory's campaign page -- who gets it, how it is going, why some were
 * not sent -- plus what CRM can add: who came in and bought afterwards. A draft is tested and started
 * here; one going out can be paused or stopped.
 */
const n = (x) => (x ?? 0).toLocaleString('en-IN');
const DONE_WORDS = { start: 'Started. It goes out slowly, from 10 am to 8 pm.', pause: 'Paused. Nobody else gets it until you carry on.', resume: 'Carrying on.', stop: 'Stopped. Nobody else gets it.' };

export default function MessageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const m = useMessage(id);
  const overview = useMessagesOverview();
  const act = useMessageAction(id);
  const del = useDeleteDraft(id);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const mayAct = can('campaign:send');

  if (m.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the message…</div></main>;
  if (m.isError) return <main className="crm-page"><Link to="/messages" className="cp-back"><ArrowLeft size={14} /> All messages</Link><div className="crm-card"><LoadFailed what="the message" error={m.error} onRetry={() => m.refetch()} /></div></main>;
  const d = m.data;
  const num = d.numbers ?? { total: 0, handed: 0, read: 0, tapped: 0, cameIn: 0, cameInAmount: 0 };

  const run = async (action) => {
    setError(null); setConfirm(null);
    try {
      if (action === 'test') {
        const r = await act.mutateAsync('test');
        toast.success(`Test sent to ${r.sentTo}.`);
      } else {
        await act.mutateAsync(action);
        toast.success(DONE_WORDS[action]);
      }
    } catch (err) { setError(err?.message || 'That did not work. Try again.'); }
  };
  const remove = async () => {
    try { await del.mutateAsync(); toast.success('Draft deleted.'); navigate('/messages', { replace: true }); }
    catch (err) { setError(err?.message || 'The draft could not be deleted. Try again.'); }
  };
  const busy = act.isPending || del.isPending;
  const kind = { manual: null, birthday: 'Automatic birthday wishes', anniversary: 'Automatic anniversary wishes', feedback: 'Automatic: how was the visit?', arrival: 'Automatic: new in their size and colour', one: 'A note to one customer' }[d.kind] ?? null;

  return (
    <main className="crm-page ms-page">
      <Link to={d.kind === 'manual' ? '/messages' : '/messages?tab=automatic'} className="cp-back"><ArrowLeft size={14} /> All messages</Link>
      <section className="crm-card ms-detail" data-testid="message-detail">
        <div className="ms-detail-head">
          <div style={{ minWidth: 0 }}>
            <h1>{d.name}</h1>
            <p>{[kind, d.startedAt ? `Started ${formatDay(d.startedAt)}${d.createdBy ? ` by ${d.createdBy}` : ''}` : `Draft${d.createdBy ? ` by ${d.createdBy}` : ''}`, d.audienceText].filter(Boolean).join(' · ')}</p>
          </div>
          <StatusPill status={d.status} />
        </div>

        {mayAct && d.kind === 'manual' && (
          <div className="pe-btns" data-testid="actions">
            {d.status === 'draft' && confirm !== 'start' && (
              <>
                <button type="button" className="btn-primary" disabled={busy || !overview.data?.moved?.campaigns} onClick={() => setConfirm('start')}>Start</button>
                <Link to={`/messages/${id}/edit`} className="btn-secondary">Change</Link>
                <button type="button" className="btn-secondary" disabled={busy || !overview.data?.sendingSetUp} onClick={() => run('test')}>{act.isPending && act.variables === 'test' && <Loader2 size={14} className="animate-spin" />} Send me a test</button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={remove}>Delete draft</button>
              </>
            )}
            {confirm === 'start' && (
              <div className="ms-confirm" role="group" aria-label="Start sending">
                <p>Send it to everyone who may get it now? It goes out slowly, up to {overview.data?.perDay ?? 20} a day, and cannot be changed once started.</p>
                <div className="pe-btns">
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => run('start')}>{act.isPending && <Loader2 size={14} className="animate-spin" />} Yes, start sending</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Not yet</button>
                </div>
              </div>
            )}
            {d.status === 'sending' && confirm !== 'stop' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => run('pause')}>Pause</button>}
            {d.status === 'paused' && confirm !== 'stop' && <button type="button" className="btn-primary" disabled={busy} onClick={() => run('resume')}>Carry on</button>}
            {['sending', 'paused'].includes(d.status) && confirm !== 'stop' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm('stop')}>Stop</button>}
            {confirm === 'stop' && (
              <div className="ms-confirm" role="group" aria-label="Stop for good">
                <p>Stop for good? Those still waiting do not get it, and it cannot be started again.</p>
                <div className="pe-btns">
                  <button type="button" className="pe-danger" disabled={busy} onClick={() => run('stop')}>Yes, stop it</button>
                  <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Keep sending</button>
                </div>
              </div>
            )}
          </div>
        )}
        {d.status === 'draft' && overview.data && !overview.data.moved?.campaigns && <p className="ms-note">It can be started once the owner moves campaigns from Inventory to CRM in Shop settings.</p>}
        {error && <p className="pe-err" role="alert">{error}</p>}

        {d.status !== 'draft' && (
          <>
            <div className="ms-stats" data-testid="stats">
              <div className="ms-stat"><b>{n(num.handed)}</b><span>sent of {n(num.total)}</span></div>
              <div className="ms-stat"><b>{n(num.read)}</b><span>read</span></div>
              {d.link && <div className="ms-stat"><b>{n(num.tapped)}</b><span>tapped the link</span></div>}
              <div className="ms-stat"><b>{n(num.cameIn)}</b><span>came in and bought</span></div>
              <div className="ms-stat"><b>{formatRupees(num.cameInAmount)}</b><span>those bills</span></div>
            </div>
            {d.waitingTurn > 0 && <p className="pe-hint">{n(d.waitingTurn)} {d.waitingTurn === 1 ? 'is' : 'are'} waiting out the 3 days since their last offer, and get it after.</p>}
            {d.notSent.length > 0 && (
              <div>
                <div className="ms-sub">Why some were not sent</div>
                <ul className="ms-skips">{d.notSent.map(r => <li key={r.reason}>{n(r.count)}: {r.reason}</li>)}</ul>
              </div>
            )}
            <p className="pe-hint">"Came in and bought": a bill within 14 days of their message, from Inventory or the till. Each is on that customer's timeline.</p>
          </>
        )}
      </section>
      <section className="ms-side">
        <MessageBubble text={d.text} media={d.media} link={!!d.link} shop={overview.data?.shopName} />
      </section>
    </main>
  );
}
