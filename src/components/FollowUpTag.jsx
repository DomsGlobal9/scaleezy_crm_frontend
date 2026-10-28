import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Undo2, Phone } from 'lucide-react';
import { dueWords } from '../utils/days';
import { formatPhone } from '../utils/phone';

/**
 * One follow-up, drawn as a garment swing tag: the thing staff in a clothing shop handle all day.
 * The hole on the left is the done button; an overdue tag is marked in amber, a done one fades with
 * an Undo (a tap in the wrong place happens).
 */
export default function FollowUpTag({ followUp: f, today, canAct, onDone, onUndo, busy, customer, showWho = true }) {
  const state = f.done ? 'done' : f.overdue ? 'overdue' : f.dueToday ? 'today' : '';
  return (
    <article className={`fu-tag ${state}`} data-testid="followup" data-id={f.id} data-state={state || 'later'}>
      {canAct && !f.done ? (
        <button type="button" className="fu-hole" onClick={onDone} disabled={busy} aria-label={`Mark done: ${f.body}`} title="Mark done">
          <Check size={14} strokeWidth={3} />
        </button>
      ) : (
        <span className="fu-hole static" aria-hidden="true">{f.done && <Check size={14} strokeWidth={3} />}</span>
      )}
      <div className="fu-body">
        {customer && (
          <div className="fu-who">
            <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
            {customer.phone && <a className="fu-phone" href={`tel:${customer.phone}`}><Phone size={12} /> {formatPhone(customer.phone)}</a>}
          </div>
        )}
        <p className="fu-text">{f.body}</p>
        <p className="fu-meta">
          {f.done
            ? <>Done{f.doneByName ? ` by ${f.doneByName}` : ''}</>
            : <span className={f.overdue ? 'fu-late' : f.dueToday ? 'fu-today' : ''}>{dueWords(f.dueOn, today)}</span>}
          {showWho && f.assigneeName && !f.done && <span> · {f.assigneeName}</span>}
        </p>
      </div>
      {f.done && canAct && (
        <button type="button" className="fu-undo" onClick={onUndo} disabled={busy}>
          <Undo2 size={13} /> Undo
        </button>
      )}
    </article>
  );
}
