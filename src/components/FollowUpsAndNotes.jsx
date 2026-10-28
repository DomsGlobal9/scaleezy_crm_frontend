import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useAddFollowUp, useAddNote, useFollowUpDone, useFollowUps, useNotes, useStaff } from '../hooks/useWork';
import { addDays, dayWords, localToday } from '../utils/days';
import Select from './common/Select';
import FollowUpTag from './FollowUpTag';

/**
 * The customer page's working card (approved mockup, 27 Oct): open follow-ups as swing tags, adding
 * one (what, when, who), the last few done, and notes. Notes cannot be changed once saved.
 */
const WHEN = [
  { key: 'today', label: 'Today', days: 0 },
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: 'week', label: 'In a week', days: 7 }
];

export default function FollowUpsAndNotes({ customerId }) {
  const { user } = useAuth();
  const { can } = usePermission();
  const canWrite = can('customer:update');
  const followUps = useFollowUps(customerId);
  const notes = useNotes(customerId);
  const staff = useStaff();
  const done = useFollowUpDone();
  const today = followUps.data?.today ?? localToday();

  return (
    <aside className="crm-card wk-card" data-testid="work-card">
      <section aria-labelledby="fu-h">
        <div className="wk-head">
          <h2 id="fu-h">Follow-ups</h2>
          {followUps.data && <span className="crm-muted">{followUps.data.open.length === 0 ? 'Nothing open' : `${followUps.data.open.length} open`}</span>}
        </div>
        {followUps.isLoading ? <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p> : (
          <div className="fu-list">
            {(followUps.data?.open ?? []).map(f => (
              <FollowUpTag key={f.id} followUp={f} today={today} canAct={canWrite} busy={done.isPending}
                onDone={() => done.mutate({ id: f.id, done: true })} />
            ))}
          </div>
        )}
        {canWrite && <AddFollowUp customerId={customerId} today={today} me={user} staff={staff.data ?? []} />}
        {(followUps.data?.recentlyDone ?? []).length > 0 && (
          <details className="wk-done">
            <summary>Done lately ({followUps.data.recentlyDone.length})</summary>
            <div className="fu-list">
              {followUps.data.recentlyDone.map(f => (
                <FollowUpTag key={f.id} followUp={f} today={today} canAct={canWrite} busy={done.isPending}
                  onUndo={() => done.mutate({ id: f.id, done: false })} />
              ))}
            </div>
          </details>
        )}
      </section>

      <hr className="wk-rule" />

      <section aria-labelledby="notes-h">
        <div className="wk-head"><h2 id="notes-h">Notes</h2></div>
        {canWrite && <AddNote customerId={customerId} />}
        <div className="wk-notes" data-testid="notes">
          {(notes.data ?? []).slice(0, 5).map(n => (
            <div key={n.id} className="wk-note" data-testid="note">
              <p>{n.body}</p>
              <span className="crm-muted">{[n.byName, new Date(n.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })].filter(Boolean).join(', ')}</span>
            </div>
          ))}
          {notes.data && notes.data.length === 0 && <p className="crm-muted">No notes yet. Anything the team should know about this customer goes here.</p>}
        </div>
        <p className="wk-small">Notes cannot be changed once saved, so the record stays honest. Every note is also on the timeline.</p>
      </section>
    </aside>
  );
}

function AddFollowUp({ customerId, today, me, staff }) {
  const add = useAddFollowUp(customerId);
  const [body, setBody] = useState('');
  const [when, setWhen] = useState('tomorrow');
  const [day, setDay] = useState(addDays(today, 1));
  const [who, setWho] = useState('');
  const [error, setError] = useState('');
  // Arriving from Today's "Add follow-up": the box is ready to type in.
  const [params] = useSearchParams();
  const box = useRef(null);
  useEffect(() => {
    if (params.get('followup') === '1' && box.current) { box.current.focus(); box.current.scrollIntoView({ block: 'center' }); }
  }, [params]);

  const people = useMemo(() => {
    const others = staff.filter(s => s.id !== me?.id);
    return [{ id: '', name: `Me (${me?.name ?? 'you'})` }, ...others];
  }, [staff, me]);

  const dueOn = when === 'pick' ? day : addDays(today, WHEN.find(w => w.key === when)?.days ?? 1);

  const submit = (e) => {
    e.preventDefault();
    if (!body.trim()) { setError('Write what needs doing.'); return; }
    if (!dueOn || dueOn < today) { setError('Choose today or a later day.'); return; }
    setError('');
    add.mutate({ body: body.trim(), dueOn, ...(who ? { assigneeId: who } : {}) }, {
      onSuccess: () => { setBody(''); setWhen('tomorrow'); setWho(''); }
    });
  };

  return (
    <form className="wk-form" onSubmit={submit} noValidate>
      <label className="wk-label" htmlFor={`fu-body-${customerId}`}>Add a follow-up</label>
      <textarea ref={box} id={`fu-body-${customerId}`} className="input-field" rows={2} maxLength={500} value={body}
        onChange={(e) => setBody(e.target.value)} placeholder="For example: call when the maroon Kanchipuram in L arrives" />
      <span className="wk-label" id={`fu-when-${customerId}`}>When</span>
      <div className="cp-chips" role="radiogroup" aria-labelledby={`fu-when-${customerId}`}>
        {WHEN.map(w => (
          <button key={w.key} type="button" role="radio" aria-checked={when === w.key} className={`cp-chip${when === w.key ? ' on' : ''}`} onClick={() => setWhen(w.key)}>{w.label}</button>
        ))}
        <button type="button" role="radio" aria-checked={when === 'pick'} className={`cp-chip${when === 'pick' ? ' on' : ''}`} onClick={() => setWhen('pick')}>Pick a day</button>
      </div>
      {when === 'pick' && (
        <input type="date" className="input-field" aria-label="Due day" min={today} max={addDays(today, 366)} value={day} onChange={(e) => setDay(e.target.value)} />
      )}
      <span className="wk-hint">{dueOn ? `Due ${dayWords(dueOn, today)}` : ''}</span>
      <label className="wk-label" htmlFor={`fu-who-${customerId}`}>Who</label>
      <Select id={`fu-who-${customerId}`} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who">
        {people.map(p => <option key={p.id || 'me'} value={p.id}>{p.name}</option>)}
      </Select>
      {error && <p className="si-error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary wk-save" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save follow-up'}</button>
    </form>
  );
}

function AddNote({ customerId }) {
  const add = useAddNote(customerId);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="wk-form" noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!body.trim()) { setError('Write the note first.'); return; }
      setError('');
      add.mutate(body.trim(), { onSuccess: () => setBody('') });
    }}>
      <textarea className="input-field" rows={2} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note for the team" aria-label="Write a note for the team" />
      {error && <p className="si-error" role="alert">{error}</p>}
      <button type="submit" className="btn-secondary wk-save" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save note'}</button>
    </form>
  );
}
