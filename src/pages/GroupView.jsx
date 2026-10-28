import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, X, Search, Plus, Pencil, Merge, Trash2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useAddToGroup, useDeleteGroup, useGroup, useGroupRules, useGroups, useMergeGroup, useRemoveFromGroup, useRenameGroup } from '../hooks/useGroups';
import { useCustomers } from '../hooks/useCustomers';
import { formatPhone } from '../utils/phone';
import Select from '../components/common/Select';
import LoadFailed from '../components/LoadFailed';
import { RuleBadges } from './Groups';

/**
 * One group: who is in it (add and take out), its rules, rename, merge into another, delete.
 * Every change is made in Inventory, in your name; when Inventory says no ("an offer is only for this
 * group"), its sentence is shown where you made the change.
 */
export default function GroupView() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const group = useGroup(key);
  const all = useGroups();
  const mayManage = can('customer:manage_groups');
  const mayEdit = can('customer:update');
  const info = (all.data ?? []).find(g => g.key === key);

  if (group.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the group…</div></main>;
  if (group.isError) {
    return <main className="crm-page"><Link to="/groups" className="sg-back"><ArrowLeft size={16} /> Customer groups</Link><div className="crm-card"><LoadFailed what="this group" error={group.error} onRetry={() => group.refetch()} /></div></main>;
  }
  const g = group.data;
  const others = (all.data ?? []).filter(x => x.key !== key);

  return (
    <main className="crm-page gr-page">
      <Link to="/groups" className="sg-back"><ArrowLeft size={16} /> Customer groups</Link>
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1 data-testid="group-name"><span className="crm-tag gr-title">{g.name}</span></h1>
          <p>{g.members.length.toLocaleString('en-IN')} {g.members.length === 1 ? 'customer' : 'customers'}</p>
        </div>
      </div>
      {info && <RuleBadges group={info} />}

      <div className="gr-split">
        <section className="crm-card gr-members" aria-labelledby="gr-m">
          <h2 id="gr-m">Who is in it</h2>
          {mayEdit && <AddMember group={g} />}
          {g.members.length === 0 ? <p className="crm-muted" data-testid="no-members">Nobody yet.</p> : (
            <ul className="gr-people">
              {g.members.map(m => <Member key={m.inventoryId} m={m} groupKey={key} mayEdit={mayEdit} />)}
            </ul>
          )}
        </section>

        {mayManage && (
          <aside className="gr-side">
            <Rules groupKey={key} info={info} />
            <Rename groupKey={key} name={g.name} onDone={(k) => navigate(`/groups/${encodeURIComponent(k)}`, { replace: true })} />
            {others.length > 0 && <MergeInto groupKey={key} name={g.name} others={others} onDone={(k) => navigate(`/groups/${encodeURIComponent(k)}`, { replace: true })} />}
            <Delete groupKey={key} name={g.name} count={g.members.length} onDone={() => navigate('/groups')} />
          </aside>
        )}
      </div>
    </main>
  );
}

function Member({ m, groupKey, mayEdit }) {
  const remove = useRemoveFromGroup(groupKey);
  return (
    <li className="gr-person" data-testid="member">
      <div style={{ minWidth: 0 }}>
        {m.customerId ? <Link to={`/customers/${m.customerId}`} className="crm-name">{m.name}</Link> : <span className="crm-name">{m.name}</span>}
        <div className="crm-muted">{[m.phone ? formatPhone(m.phone) : null, m.code].filter(Boolean).join(' · ')}</div>
      </div>
      {mayEdit && m.customerId && (
        <button type="button" className="crm-iconbtn" onClick={() => remove.mutate(m.customerId)} disabled={remove.isPending} aria-label={`Take ${m.name} out of the group`}><X size={16} /></button>
      )}
    </li>
  );
}

/** Find a customer by name or phone and add them. */
function AddMember({ group }) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  const found = useCustomers({ search, page: 1 });
  const add = useAddToGroup();
  const [said, setSaid] = useState('');
  const inGroup = new Set(group.members.map(m => m.customerId));
  const results = search ? (found.data?.customers ?? []).filter(c => !inGroup.has(c.id)).slice(0, 6) : [];

  const addOne = async (c) => {
    setSaid('');
    try {
      const r = await add.mutateAsync({ group: group.name, customerIds: [c.id] });
      setSaid(r?.notInInventory ? `${c.name} is not in Inventory yet, so cannot join a group.` : `${c.name} added.`);
      setTyped('');
    } catch (e) { setSaid(e?.message || 'Could not add them.'); }
  };

  return (
    <div className="gr-add">
      <div className="ct-phone"><Search size={16} aria-hidden="true" />
        <input className="input-field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Add someone: name or phone" aria-label="Find a customer to add" />
      </div>
      {results.length > 0 && (
        <ul className="gr-found" data-testid="add-results">
          {results.map(c => (
            <li key={c.id}>
              <span><strong>{c.name}</strong> <span className="crm-muted">{c.phone ? formatPhone(c.phone) : ''}</span></span>
              <button type="button" className="btn-secondary" onClick={() => addOne(c)} disabled={add.isPending}><Plus size={13} /> Add</button>
            </li>
          ))}
        </ul>
      )}
      {said && <p className="crm-muted" role="status" data-testid="add-said">{said}</p>}
    </div>
  );
}

function Rules({ groupKey, info }) {
  const save = useGroupRules(groupKey);
  const [noOffers, setNoOffers] = useState(!!info?.noOfferMessages);
  const [noWishes, setNoWishes] = useState(!!info?.noWishes);
  const [auto, setAuto] = useState(!!info?.autoMinSpend);
  const [spend, setSpend] = useState(info?.autoMinSpend ?? '');
  const [days, setDays] = useState(info?.autoDays ?? '');
  const [problem, setProblem] = useState('');
  useEffect(() => {
    setNoOffers(!!info?.noOfferMessages); setNoWishes(!!info?.noWishes);
    setAuto(!!info?.autoMinSpend); setSpend(info?.autoMinSpend ?? ''); setDays(info?.autoDays ?? '');
  }, [info?.noOfferMessages, info?.noWishes, info?.autoMinSpend, info?.autoDays]);

  const submit = async (e) => {
    e.preventDefault();
    setProblem('');
    try {
      await save.mutateAsync({ noOfferMessages: noOffers, noWishes, ...(auto ? { autoMinSpend: Number(spend), autoDays: Number(days) } : { autoMinSpend: null, autoDays: null }) });
    } catch (err) { setProblem(err?.message || 'The rules could not be saved.'); }
  };
  return (
    <form className="crm-card gr-box" onSubmit={submit} aria-labelledby="gr-r">
      <h3 id="gr-r">Rules</h3>
      <label className="gr-check"><input type="checkbox" checked={noOffers} onChange={(e) => setNoOffers(e.target.checked)} /> No offer messages to them</label>
      <label className="gr-check"><input type="checkbox" checked={noWishes} onChange={(e) => setNoWishes(e.target.checked)} /> No birthday or anniversary wishes</label>
      <label className="gr-check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Customers join by themselves when they spend…</label>
      {auto && (
        <div className="gr-auto">
          <span>₹</span><input className="input-field" type="number" min="1" value={spend} onChange={(e) => setSpend(e.target.value)} aria-label="At least this much (₹)" />
          <span>in</span><input className="input-field" type="number" min="1" max="3650" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Over this many days" />
          <span>days</span>
        </div>
      )}
      {problem && <p className="si-error" role="alert">{problem}</p>}
      <button type="submit" className="btn-secondary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save rules'}</button>
    </form>
  );
}

function Rename({ groupKey, name, onDone }) {
  const rename = useRenameGroup(groupKey);
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState('');
  useEffect(() => setValue(name), [name]);
  const submit = async (e) => {
    e.preventDefault();
    setProblem('');
    try { const r = await rename.mutateAsync(value.trim()); onDone(r?.key ?? groupKey); } catch (err) { setProblem(err?.message || 'The group could not be renamed.'); }
  };
  return (
    <form className="crm-card gr-box" onSubmit={submit} aria-labelledby="gr-rn">
      <h3 id="gr-rn"><Pencil size={14} aria-hidden="true" /> Rename</h3>
      <input className="input-field" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} aria-label="New name" />
      {problem && <p className="si-error" role="alert" data-testid="rename-problem">{problem}</p>}
      <button type="submit" className="btn-secondary" disabled={!value.trim() || value.trim() === name || rename.isPending}>Rename</button>
    </form>
  );
}

function MergeInto({ groupKey, name, others, onDone }) {
  const merge = useMergeGroup(groupKey);
  const [into, setInto] = useState('');
  const [problem, setProblem] = useState('');
  const target = others.find(o => o.key === into);
  const submit = async (e) => {
    e.preventDefault();
    setProblem('');
    try { const r = await merge.mutateAsync(target.name); onDone(r?.key ?? into); } catch (err) { setProblem(err?.message || 'The groups could not be merged.'); }
  };
  return (
    <form className="crm-card gr-box" onSubmit={submit} aria-labelledby="gr-mg">
      <h3 id="gr-mg"><Merge size={14} aria-hidden="true" /> Merge into another group</h3>
      <p className="crm-muted">Everyone in {name} joins the other group, and {name} goes. Its rules go with it.</p>
      <Select value={into} onChange={(e) => setInto(e.target.value)} aria-label="Merge into">
        <option value="">Choose a group</option>
        {others.map(o => <option key={o.key} value={o.key}>{o.name}</option>)}
      </Select>
      {problem && <p className="si-error" role="alert" data-testid="merge-problem">{problem}</p>}
      <button type="submit" className="btn-secondary" disabled={!target || merge.isPending}>Merge</button>
    </form>
  );
}

function Delete({ groupKey, name, count, onDone }) {
  const del = useDeleteGroup(groupKey);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState('');
  const go = async () => {
    setProblem('');
    try { await del.mutateAsync(); onDone(); } catch (err) { setProblem(err?.message || 'The group could not be deleted.'); setAsking(false); }
  };
  return (
    <div className="crm-card gr-box">
      <h3><Trash2 size={14} aria-hidden="true" /> Delete</h3>
      {asking ? (
        <div className="sg-confirm" role="group" aria-label="Delete this group?">
          <span>Delete {name}? {count} {count === 1 ? 'customer is' : 'customers are'} taken out of it; nobody's record is lost.</span>
          <button type="button" className="btn-danger" onClick={go} disabled={del.isPending}>{del.isPending ? 'Deleting…' : 'Delete'}</button>
          <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>Keep</button>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setAsking(true)}>Delete {name}</button>
      )}
      {problem && <p className="si-error" role="alert" data-testid="delete-problem">{problem}</p>}
    </div>
  );
}
