import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X, Loader2, ShieldOff, Plus } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useCreateSegment, useSegment, useSegmentChoices, useSegmentPreview, useUpdateSegment } from '../hooks/useSegments';
import { RULES, RULE, WHEN_CHOICES, cleanRules, sentence, STARTERS } from '../utils/segmentWords';
import Select from '../components/common/Select';
import CustomerList from '../components/CustomerList';
import { Numbers } from './Segments';

/**
 * Building a segment: the rules read down the page as one sentence -- "Customers who spent at least
 * ₹20,000 and haven't been back in 60 days" -- and beside them, who meets them right now. Every
 * change is tried at once (a moment after typing stops), so the shop sees the answer before saving.
 *
 * Anyone who sees customers may try rules out; saving needs crm:segment:manage (owner and admin).
 */
export default function SegmentEditor() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const mayManage = can('crm:segment:manage');
  const existing = useSegment(id, 1);
  const choices = useSegmentChoices();
  const create = useCreateSegment();
  const update = useUpdateSegment(id);

  const starter = STARTERS.find(s => s.name === params.get('starter'));
  const [rules, setRules] = useState(() => (starter ? { ...starter.rules } : { spentAtLeast: 10000 }));
  const [name, setName] = useState(starter?.name ?? '');
  const [loaded, setLoaded] = useState(!editing);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  // Editing: start from what is saved.
  useEffect(() => {
    if (editing && existing.data && !loaded) {
      setRules({ ...existing.data.segment.rules });
      setName(existing.data.segment.name);
      setLoaded(true);
    }
  }, [editing, existing.data, loaded]);

  // Ask a moment after the last change, not on every key.
  const [asked, setAsked] = useState(() => cleanRules(rules));
  useEffect(() => {
    const t = setTimeout(() => { setAsked(cleanRules(rules)); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [rules]);
  const preview = useSegmentPreview(asked, page, loaded);

  const used = new Set(Object.keys(rules));
  const addable = RULES.filter(r => !used.has(r.key));
  const set = (key, value) => setRules(r => ({ ...r, [key]: value }));
  const drop = (key) => setRules(r => { const n = { ...r }; delete n[key]; return n; });
  const add = (key) => { if (RULE[key]) set(key, Array.isArray(RULE[key].start) ? [] : RULE[key].start); };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = { name, rules: cleanRules(rules) };
      const saved = editing ? await update.mutateAsync(body) : await create.mutateAsync(body);
      navigate(`/segments/${saved.id}`);
    } catch (err) {
      setError(err?.message || 'The list could not be saved. Try again.');
    }
  };

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }
  if (editing && !loaded) {
    return <main className="crm-page"><div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the list…</div></main>;
  }

  const look = preview.data;
  const keys = Object.keys(rules);
  const saving = create.isPending || update.isPending;

  return (
    <main className="crm-page sg-page">
      <Link to={editing ? `/segments/${id}` : '/segments'} className="sg-back"><ArrowLeft size={16} /> {editing ? 'Back to the list' : 'Saved lists'}</Link>
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1>{editing ? 'Change list' : 'New list'}</h1>
          <p>{mayManage ? 'Choose who belongs in it. The count beside it is who meets it right now.' : 'Try out who meets these rules. Saving a list is for the owner or an admin.'}</p>
        </div>
      </div>

      <div className="sg-build">
        <section className="crm-card sg-rules" aria-label="Rules">
          <p className="sg-lead">Customers who</p>
          <ol className="sg-rule-list">
            {keys.map((key, i) => (
              <li key={key} className="sg-rule" data-testid="rule">
                <span className="sg-and" aria-hidden="true">{i === 0 ? '' : 'and'}</span>
                <RuleInput rule={RULE[key]} value={rules[key]} onChange={(v) => set(key, v)} choices={choices.data} />
                <button type="button" className="crm-iconbtn sg-drop" onClick={() => drop(key)} aria-label={`Remove: ${RULE[key].label}`}><X size={16} /></button>
              </li>
            ))}
          </ol>
          {addable.length > 0 && (
            <div className="sg-add">
              <Plus size={16} aria-hidden="true" />
              <Select value="" onChange={(e) => add(e.target.value)} aria-label="Add a rule">
                <option value="">{keys.length ? 'And also…' : 'Add a rule…'}</option>
                {addable.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
            </div>
          )}
        </section>

        <aside className="crm-card sg-result" aria-live="polite" aria-label="Who meets it now">
          <p className="sg-result-sentence" data-testid="sentence">{sentence(rules)}</p>
          {preview.isError ? (
            <p className="sg-problem" role="alert" data-testid="rules-problem">{preview.error?.message || 'These rules could not be worked out.'}</p>
          ) : (
            <div className={preview.isFetching ? 'sg-fetching' : ''}><Numbers summary={look?.summary} big /></div>
          )}
          {mayManage && (
            <form className="sg-save" onSubmit={save}>
              <label htmlFor="sg-name">Name</label>
              <input id="sg-name" className="input-field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Big spenders not seen lately" />
              {error && <p className="si-error" role="alert">{error}</p>}
              <button type="submit" className="btn-primary" disabled={saving || preview.isError}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editing ? 'Save changes' : 'Save list'}
              </button>
            </form>
          )}
        </aside>
      </div>

      <section className="sg-people" aria-labelledby="sg-people-h">
        <div className="td-sec-head">
          <h2 id="sg-people-h">Who is in it now</h2>
          <span className="crm-muted">Biggest spenders first</span>
        </div>
        {look && look.customers.length === 0 ? (
          <div className="crm-card crm-muted" data-testid="nobody">Nobody meets these rules right now. Loosen one, or take one away.</div>
        ) : look ? (
          <>
            <CustomerList rows={look.customers} onOpen={(c) => navigate(`/customers/${c.id}`)} />
            <Pager look={look} page={page} setPage={setPage} busy={preview.isFetching} />
          </>
        ) : null}
      </section>
    </main>
  );
}

/** The part of a rule that is filled in: an amount, a number of days, a month, a kind… */
function RuleInput({ rule, value, onChange, choices }) {
  const number = (v) => (v === '' ? '' : Number(v));
  switch (rule.input) {
    case 'rupees':
      return (
        <label className="sg-rule-body">
          <span>{rule.key === 'spentAtLeast' ? 'spent at least' : 'spent at most'}</span>
          <span className="sg-money"><span aria-hidden="true">₹</span>
            <input className="input-field" type="number" inputMode="numeric" min="1" step="1" value={value} onChange={(e) => onChange(number(e.target.value))} aria-label={rule.label.replace('…', ' (₹)')} />
          </span>
        </label>
      );
    case 'count':
      return (
        <label className="sg-rule-body">
          <span>bought at least</span>
          <input className="input-field sg-small" type="number" inputMode="numeric" min="1" step="1" value={value} onChange={(e) => onChange(number(e.target.value))} aria-label="Number of times" />
          <span>times</span>
        </label>
      );
    case 'days':
      return (
        <label className="sg-rule-body">
          <span>{rule.key === 'notSeenForDays' ? "haven't been back in" : 'came in within the last'}</span>
          <input className="input-field sg-small" type="number" inputMode="numeric" min="1" max="3650" step="1" value={value} onChange={(e) => onChange(number(e.target.value))} aria-label="Number of days" />
          <span>days</span>
        </label>
      );
    case 'when':
      return (
        <div className="sg-rule-body">
          <span>{rule.key === 'birthday' ? 'have a birthday' : 'have an anniversary'}</span>
          <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="When">
            {WHEN_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
      );
    case 'channel':
      return (
        <div className="sg-rule-body">
          <span>bought</span>
          <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Where they bought">
            <option value="in_store">in the shop</option>
            <option value="online">online</option>
          </Select>
        </div>
      );
    case 'whatsapp':
      return (
        <div className="sg-rule-body">
          <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="WhatsApp offers">
            <option value="agreed">agreed</option>
            <option value="not_agreed">have not agreed</option>
          </Select>
          <span>to WhatsApp offers</span>
        </div>
      );
    case 'kinds':
    case 'groups': {
      const options = (rule.input === 'kinds' ? choices?.kinds : choices?.groups) ?? [];
      const left = options.filter(o => !value.includes(o));
      return (
        <div className="sg-rule-body sg-pick">
          <span>{rule.input === 'kinds' ? 'bought' : 'are in'}</span>
          {value.map((v, i) => (
            <span key={v} className="sg-chip">
              {i > 0 && <em>or</em>} {v}
              <button type="button" onClick={() => onChange(value.filter(x => x !== v))} aria-label={`Take away ${v}`}><X size={12} /></button>
            </span>
          ))}
          {left.length > 0 ? (
            <Select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} aria-label={rule.input === 'kinds' ? 'Add a kind' : 'Add a group'}>
              <option value="">{value.length ? 'or…' : rule.input === 'kinds' ? 'choose a kind' : 'choose a group'}</option>
              {left.map(o => <option key={o} value={o}>{o}</option>)}
            </Select>
          ) : value.length === 0 ? (
            <span className="crm-muted">{rule.input === 'kinds' ? 'No kinds of garment on any bill yet.' : 'No customer is in a group yet.'}</span>
          ) : null}
        </div>
      );
    }
    default: // flags: nothing to fill in
      return <div className="sg-rule-body"><span>{rule.says(true)}</span></div>;
  }
}

export function Pager({ look, page, setPage, busy }) {
  if (!look || look.pages <= 1) return null;
  const first = (look.page - 1) * look.pageSize + 1;
  const last = Math.min(look.summary.people, look.page * look.pageSize);
  return (
    <nav className="crm-pager" aria-label="Pages">
      <button type="button" className="btn-secondary" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>Previous</button>
      <span className="crm-muted">{first}–{last} of {look.summary.people.toLocaleString('en-IN')} · Page {look.page} of {look.pages}</span>
      <button type="button" className="btn-secondary" disabled={page >= look.pages || busy} onClick={() => setPage(p => p + 1)}>Next</button>
    </nav>
  );
}

