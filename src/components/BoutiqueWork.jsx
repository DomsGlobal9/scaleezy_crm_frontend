import React from 'react';
import { ExternalLink, Loader2, Phone, Ruler, Scissors, ChevronRight } from 'lucide-react';
import { useCustomerWork, rupees } from '../hooks/useBoutique';
import { formatDay } from '../utils/dates';
import LoadFailed from './LoadFailed';

/**
 * A customer's work from the Boutique module (the mockup approved 19 Nov): open work first, each with where it stands
 * on its steps, when it is due, the balance and who has it; then what was done. The work is Boutique's: CRM shows it
 * and opens Boutique to change it. Shown only in a shop that uses Boutique.
 */
const STEPS = {
  pickup: [['taken', 'Taken'], ['in-progress', 'Work'], ['trial', 'Trial'], ['ready', 'Ready'], ['collected', 'Collected']],
  courier: [['taken', 'Taken'], ['in-progress', 'Work'], ['ready', 'Ready'], ['shipped', 'Sent'], ['collected', 'Delivered']]
};
const ORDER = ['taken', 'in-progress', 'trial', 'ready', 'shipped', 'collected'];

function stepsFor(w) {
  const all = STEPS[w.delivery === 'courier' ? 'courier' : 'pickup'];
  // A job that never had a trial shows no trial step.
  return all.filter(([k]) => k !== 'trial' || w.dates.trial || w.status === 'trial');
}
function tone(w) {
  if (w.status === 'cancelled') return 'cancelled';
  if (w.overdue) return 'over';
  if (w.status === 'ready') return 'ready';
  if (w.status === 'shipped') return 'ship';
  return 'work';
}
function pillWords(w) {
  if (w.overdue) {
    const late = Math.max(1, Math.round((Date.now() - Date.parse(w.dates.due)) / 86_400_000));
    return `Overdue ${late} day${late === 1 ? '' : 's'}`;
  }
  return w.statusWords.charAt(0).toUpperCase() + w.statusWords.slice(1);
}

function Track({ w }) {
  const steps = stepsFor(w);
  const at = ORDER.indexOf(w.status);
  const nowIndex = steps.reduce((best, [k], i) => (ORDER.indexOf(k) <= at ? i : best), 0);
  const dateOf = { taken: w.dates.taken, trial: w.dates.trial, ready: w.dates.ready, collected: w.dates.collected };
  return (
    <div className="bw-steps" aria-label={`Where it stands: ${w.statusWords}`}>
      <ol className="bw-track">
        {steps.map(([k, label], i) => (
          <li key={k} className={i < nowIndex ? 'done' : i === nowIndex ? 'now' : ''}>
            <span className="bw-dot" aria-hidden="true" />
            <span className="bw-step">{label}{dateOf[k] && <em> {formatDay(dateOf[k])}</em>}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Job({ w, phone, firstName }) {
  const t = tone(w);
  const facts = [
    w.overdue && w.dates.due ? ['Was due', formatDay(w.dates.due), 'late']
      : w.status === 'ready' && w.dates.ready ? ['Ready since', formatDay(w.dates.ready)]
        : w.dates.due ? ['Due', formatDay(w.dates.due)] : null,
    w.balancePaise !== null ? ['Balance', w.balancePaise === 0 ? 'Paid' : rupees(w.balancePaise)] : w.amountPaise !== null ? ['Amount', rupees(w.amountPaise)] : null,
    w.staff ? ['By', w.staff] : null
  ].filter(Boolean);
  return (
    <article className={`bw-job ${t}`} data-testid="boutique-job">
      <div className="bw-jt">
        <div className="bw-what">
          <b>{w.service.name}</b>
          {w.title && <small>{w.title}</small>}
        </div>
        <span className={`bw-pill ${t}`}>{pillWords(w)}</span>
      </div>
      {w.status !== 'cancelled' && <Track w={w} />}
      {facts.length > 0 && (
        <dl className="bw-facts">
          {facts.map(([k, v, late]) => <div key={k}><dt>{k}</dt><dd className={late ? 'late' : ''}>{v}</dd></div>)}
        </dl>
      )}
      {w.measurementsOnFile && <p className="bw-meas"><Ruler size={13} aria-hidden="true" /> Measurements on file in Boutique</p>}
      <div className="bw-acts">
        {w.status === 'ready' && phone && <a className="btn-primary bw-btn" href={`tel:${phone}`}><Phone size={14} /> Call {firstName || 'them'}</a>}
        {w.link && <a className="btn-secondary bw-btn" href={w.link} target="_blank" rel="noreferrer">Open in Boutique <ExternalLink size={13} /></a>}
      </div>
    </article>
  );
}

export default function BoutiqueWork({ customerId, phone, firstName }) {
  const work = useCustomerWork(customerId);
  if (work.isLoading) return <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading their work…</div>;
  if (work.isError) return <LoadFailed what="their work" error={work.error} onRetry={() => work.refetch()} />;
  const { open = [], done = [] } = work.data ?? {};
  if (!open.length && !done.length) {
    return (
      <div className="bw-empty" data-testid="boutique-empty">
        <Scissors size={22} aria-hidden="true" />
        <b>No stitching or alterations yet</b>
        <p>Work taken in Boutique shows here, with where it stands.</p>
      </div>
    );
  }
  return (
    <div className="bw" data-testid="boutique-work">
      <div className="bw-open">{open.map(w => <Job key={w.id} w={w} phone={phone} firstName={firstName} />)}</div>
      {done.length > 0 && (
        <section className="bw-done" aria-label="Done">
          <h3>Done</h3>
          <ul>
            {done.map(w => (
              <li key={w.id}>
                <span>{w.service.name}{w.title ? ` · ${w.title}` : ''}</span>
                <span className="crm-muted">{w.status === 'cancelled' ? `Cancelled ${formatDay(w.dates.cancelled)}` : `${w.statusWords.charAt(0).toUpperCase() + w.statusWords.slice(1)} ${formatDay(w.dates.collected)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Under the header: what needs the shop today (ready to collect, overdue). Nothing when nothing does. */
export function BoutiqueStrip({ customerId, onOpen }) {
  const work = useCustomerWork(customerId);
  const open = work.data?.open ?? [];
  const ready = open.filter(w => w.status === 'ready');
  const late = open.filter(w => w.overdue);
  if (!ready.length && !late.length) return null;
  const lead = ready[0] ?? late[0];
  const head = ready.length ? `${lead.title || lead.service.name} is ready to ${lead.delivery === 'courier' ? 'send' : 'collect'}` : `${lead.title || lead.service.name} is overdue`;
  const rest = [
    ready.length && lead.waitingDays !== null ? `waiting ${lead.waitingDays} day${lead.waitingDays === 1 ? '' : 's'}` : null,
    ready.length > 1 ? `${ready.length - 1} more ready` : null,
    late.length && ready.length ? `${late.length} overdue` : null
  ].filter(Boolean);
  return (
    <button type="button" className="bw-strip" onClick={onOpen} data-testid="boutique-strip">
      <span className="bw-strip-ico" aria-hidden="true"><Scissors size={15} /></span>
      <span className="bw-strip-words"><b>{head}</b>{rest.length > 0 && <small>{rest.map((r, i) => <span key={r} className={/overdue/.test(r) ? 'late' : ''}>{i ? ' · ' : ''}{r}</span>)}</small>}</span>
      <span className="bw-strip-go">See <ChevronRight size={14} /></span>
    </button>
  );
}
