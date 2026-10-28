import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useAddFollowUp, useAddNote, useFollowUpDone, useFollowUps, useNotes, useStaff } from '../hooks/useWork';
import { addDays, dayWords, localToday } from '../utils/days';
import Select from './common/Select';
import FollowUpTag from './FollowUpTag';

/**
 * The customer page's follow-ups and notes (approved mockup, 27 Oct; shorter, 28 Oct): open
 * follow-ups as swing tags, adding one (what, when, who) from "Add", the last few done, and notes
 * from "Write". Notes cannot be changed once saved. Beside the tabs on a laptop; a tab on a phone.
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
  // The boxes for writing open on asking (the owner, 28 Oct: the page was too long). Arriving from
  // Today's "Add follow-up" (?followup=1), the follow-up box is open already.
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(params.get('followup') === '1');
  const [writing, setWriting] = useState(false);
  const open = followUps.data?.open ?? [];

  return (
    <aside className="cp-rail" data-testid="work-card">
      <section className="crm-card wk-card" aria-labelledby="fu-h">
        <div className="wk-head">
          <h2 id="fu-h">Follow-ups{followUps.data && open.length > 0 ? <span className="wk-count">{open.length}</span> : null}</h2>
          {canWrite && !adding && <button type="button" className="si-link wk-add" onClick={() => setAdding(true)} aria-label="New follow-up"><Plus size={14} aria-hidden="true" /> Add</button>}
        </div>
        {followUps.isLoading ? <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p> : (
          <>
            {open.length === 0 && !adding && <p className="crm-muted wk-none">Nothing to do for them.</p>}
            {open.length > 0 && (
              <div className="fu-list">
                {open.map(f => (
                  <FollowUpTag key={f.id} followUp={f} today={today} canAct={canWrite} busy={done.isPending}
                    onDone={() => done.mutate({ id: f.id, done: true })} />
                ))}
              </div>
            )}
          </>
        )}
        {canWrite && adding && <AddFollowUp customerId={customerId} today={today} me={user} staff={staff.data ?? []} onClose={() => setAdding(false)} />}
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

      <section className="crm-card wk-card" aria-labelledby="notes-h">
        <div className="wk-head">
          <h2 id="notes-h">Notes</h2>
          {canWrite && !writing && <button type="button" className="si-link wk-add" onClick={() => setWriting(true)} aria-label="New note"><Plus size={14} aria-hidden="true" /> Write</button>}
        </div>
        {canWrite && writing && <AddNote customerId={customerId} onClose={() => setWriting(false)} />}
        <div className="wk-notes" data-testid="notes">
          {(notes.data ?? []).slice(0, 5).map(n => (
            <div key={n.id} className="wk-note" data-testid="note">
              <p>{n.body}</p>
              <span className="crm-muted">{[n.byName, new Date(n.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })].filter(Boolean).join(', ')}</span>
            </div>
          ))}
          {notes.data && notes.data.length === 0 && !writing && <p className="crm-muted wk-none">No notes yet.</p>}
        </div>
      </section>
    </aside>
  );
}

function AddFollowUp({ customerId, today, me, staff, onClose }) {
  const add = useAddFollowUp(customerId);
  const [body, setBody] = useState('');
  const [when, setWhen] = useState('tomorrow');
  const [day, setDay] = useState(addDays(today, 1));
  const [who, setWho] = useState('');
  const [error, setError] = useState('');
  // Opened by "Add" (or arriving from Today's "Add follow-up"): the box is ready to type in.
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); box.current?.scrollIntoView({ block: 'nearest' }); }, []);

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
      <div className="wk-buttons">
        <button type="submit" className="btn-primary wk-save" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save follow-up'}</button>
        <button type="button" className="btn-secondary wk-save" onClick={onClose}>Close</button>
      </div>
    </form>
  );
}

function AddNote({ customerId, onClose }) {
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
        placeholder="Write a note for the team" aria-label="Write a note for the team" autoFocus />
      {error && <p className="si-error" role="alert">{error}</p>}
      <span className="wk-hint">Notes cannot be changed once saved, so the record stays honest. Every note is also on the timeline.</span>
      <div className="wk-buttons">
        <button type="submit" className="btn-primary wk-save" disabled={add.isPending}>{add.isPending ? 'Saving…' : 'Save note'}</button>
        <button type="button" className="btn-secondary wk-save" onClick={onClose}>Close</button>
      </div>
    </form>
  );
}
