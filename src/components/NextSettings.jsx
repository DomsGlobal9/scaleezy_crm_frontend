import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Star } from 'lucide-react';
import Select from './common/Select';
import LoadFailed from './LoadFailed';
import { HowItWorks, HowSteps, Lede, filled } from './SettingsHelp';
import { parcelSetting, duesSetting, referralSetting, useLevels, useSaveLevels, rupees } from '../hooks/useNext';

/**
 * The owner's switches for the next features (the mockups approved 19 Nov), under Automatic messages: parcel updates
 * (C10), money owed reminders (C7), bring a friend (C8). Each starts off. And the shop's levels (C9), its own section.
 */
function Switch({ id, title, on, busy, onFlip, children, testid }) {
  return (
    <div className="pe-sw-row">
      <div><h3 id={id}>{title}</h3>{children}</div>
      <button type="button" role="switch" aria-checked={!!on} aria-labelledby={id} className={`pe-toggle${on ? ' on' : ''}`} disabled={busy} onClick={onFlip} data-testid={testid} />
    </div>
  );
}

export function Parcel({ shop }) {
  const s = parcelSetting.use();
  const save = parcelSetting.save();
  const [error, setError] = useState(null);
  if (s.isError) return <LoadFailed what="this setting" error={s.error} onRetry={() => s.refetch()} />;
  if (!s.data) return null;
  const flip = async () => {
    setError(null);
    try { await save.mutateAsync({ on: !s.data.on }); toast.success(!s.data.on ? 'From now on, customers hear when their parcel is on its way and when it arrives.' : 'Parcel updates are off.'); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };
  return (
    <>
      <Switch id="pe-parcel" title="Parcel updates" on={s.data.on} busy={save.isPending} onFlip={flip} testid="parcel-switch">
        <p className="sh-plain">Online buyers hear when their parcel ships and when it arrives.</p>
        <HowItWorks testid="how-parcel" rows={[
          ['When', 'An online order is shipped, and again when it is delivered.'],
          ['Who gets it', 'The customer who ordered. It is about their own order, so it goes even if they did not agree to offers, and it does not count as an offer.'],
          ['Who never does', 'Anyone who replied STOP.'],
          ['From when', 'Orders shipped after you turn it on.']
        ]} message={{ text: filled('Hello {name}, your order SO-1042 from {shop} is on its way with Delhivery. Track it: {link}', shop), foot: 'Then, when it arrives: "…has been delivered. Thank you for shopping with us!"' }} />
      </Switch>
      {error && <p className="pe-err" role="alert">{error}</p>}
    </>
  );
}

export function Dues({ shop }) {
  const s = duesSetting.use();
  const save = duesSetting.save();
  const [error, setError] = useState(null);
  if (s.isError) return <LoadFailed what="this setting" error={s.error} onRetry={() => s.refetch()} />;
  if (!s.data) return null;
  const d = s.data;
  const put = async (body, said) => {
    setError(null);
    try { await save.mutateAsync({ on: d.on, ...body }); if (said) toast.success(said); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  return (
    <>
      <Switch id="pe-dues" title="Money owed reminders" on={d.on} busy={save.isPending} onFlip={() => put({ on: !d.on }, !d.on ? 'Gentle reminders of money owed are on.' : 'Reminders of money owed are off.')} testid="dues-switch">
        <p className="sh-plain">A customer who still owes money gets a gentle reminder, with a link to pay when there is one.</p>
        <HowItWorks testid="how-dues" rows={[
          ['When', 'On the schedule below, counted from the bill.'],
          ['Who gets it', 'Customers with kept orders or "pay later" bills that are not fully paid.'],
          ['Who never does', 'Anyone who replied STOP. Never more than the schedule.'],
          ['Paying', 'Bills bought online get a pay link from your own Razorpay. Till bills are paid at the counter.'],
          ['Your staff', 'Can also press "Remind now" on a customer\'s page.']
        ]} message={{ text: filled('Hello {name}, a gentle reminder from {shop}: ₹2,400 is still due. Pay online here: {link} Or pay at the shop when you next come in. Thank you!', shop), foot: 'Reply STOP to stop these messages.' }} />
      </Switch>
      <div className="nx-sched">
        <label className="pe-field"><span>First reminder</span>
          <Select value={String(d.firstDays)} onChange={(e) => put({ firstDays: Number(e.target.value) }, 'Saved.')} aria-label="First reminder">
            {[3, 7, 10, 14, 21, 30].map(n => <option key={n} value={n}>{days(n)} after the bill</option>)}
          </Select>
        </label>
        <label className="pe-field"><span>Then every</span>
          <Select value={String(d.everyDays)} onChange={(e) => put({ everyDays: Number(e.target.value) }, 'Saved.')} aria-label="Then every">
            {[7, 14, 21, 30].map(n => <option key={n} value={n}>{days(n)}</option>)}
          </Select>
        </label>
        <label className="pe-field"><span>At most</span>
          <Select value={String(d.times)} onChange={(e) => put({ times: Number(e.target.value) }, 'Saved.')} aria-label="At most">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} time{n === 1 ? '' : 's'}</option>)}
          </Select>
        </label>
      </div>
      {d.payLinkProblem
        ? <p className="nx-warn" role="status" data-testid="dues-paylink-problem"><b>Pay links can't be made yet:</b> your shop's Razorpay is not connected. Connect it in Inventory, Settings → Payments. Until then, reminders ask customers to pay at the shop.</p>
        : <p className="pe-hint" data-testid="dues-paylink-ok">Bills bought online get a pay link from your own Razorpay in the reminder; till bills are paid at the counter.</p>}
      {error && <p className="pe-err" role="alert">{error}</p>}
    </>
  );
}

export function Referral({ shop }) {
  const s = referralSetting.use();
  const save = referralSetting.save();
  const [points, setPoints] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { if (s.data) setPoints(String(s.data.points)); }, [s.data]);
  if (s.isError) return <LoadFailed what="this setting" error={s.error} onRetry={() => s.refetch()} />;
  if (!s.data) return null;
  const put = async (body, said) => {
    setError(null);
    try { await save.mutateAsync({ on: s.data.on, ...body }); toast.success(said); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };
  const n = Number(points);
  return (
    <>
      <Switch id="pe-referral" title="Bring a friend" on={s.data.on} busy={save.isPending} onFlip={() => put({ on: !s.data.on }, !s.data.on ? 'Bring a friend is on.' : 'Bring a friend is off.')} testid="referral-switch">
        <p className="sh-plain">Customers bring friends with a code, and both get points when the friend buys.</p>
        <HowItWorks testid="how-referral" rows={[
          ['How', 'Each customer has a short code, like ANJALI-7K2, on their page. They share it with a friend.'],
          ['When', 'A new customer says whose code brought them (at the counter, or on their page), and their first bill or boutique order comes in.'],
          ['What they get', 'Both get the points you set below, in Inventory\'s points.'],
          ['Rules', 'One friend counts once. Nobody can bring themselves, or someone on their own number.']
        ]} />
      </Switch>
      <label className="pe-field nx-points"><span>Points each</span>
        <div className="pe-link-row">
          <input className="ms-input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} aria-label="Points each" data-testid="referral-points" />
          {points !== String(s.data.points) && <button type="button" className="btn-primary ms-small" disabled={!n || save.isPending} onClick={() => put({ points: n }, `Both get ${n} points from now.`)}>Save</button>}
        </div>
      </label>
      {error && <p className="pe-err" role="alert">{error}</p>}
    </>
  );
}

export default function NextSettings({ shop }) {
  return (<><Parcel shop={shop} /><Dues shop={shop} /><Referral shop={shop} /></>);
}

/** C9: the shop's levels are its groups with a spending rule, each with a points rate and a perk. */
export function LevelsSettings() {
  const q = useLevels();
  const save = useSaveLevels();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (q.data) setRows(q.data.groups.map(g => ({ ...g, points: g.pointsPer100 ?? '', perk: g.perk ?? '' }))); }, [q.data]);
  if (q.isLoading || !rows) return <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>;
  if (q.isError) return <LoadFailed what="the levels" error={q.error} onRetry={() => q.refetch()} />;
  const setRow = (key, patch) => setRows(r => r.map(x => x.key === key ? { ...x, ...patch } : x));
  const submit = async () => {
    setError(null);
    const levels = rows.filter(r => r.isLevel).map(r => ({ key: r.key, pointsPer100: Number(r.points), perk: r.perk.trim() || null }));
    if (levels.some(l => !Number.isInteger(l.pointsPer100) || l.pointsPer100 < 0 || l.pointsPer100 > 100)) return setError('Give each level\'s points for every ₹100 as a whole number from 0 to 100.');
    try { await save.mutateAsync(levels); toast.success(levels.length ? 'Levels saved. Points at the till follow them now.' : 'No levels now.'); }
    catch (e) { setError(e?.message || 'Could not save.'); }
  };
  return (
    <div className="nx-levels" data-testid="levels-settings">
      <h2><Star size={18} aria-hidden="true" /> Customer levels</h2>
      <Lede>Reward customers who spend more: a level like Silver or Gold gives them more points on every bill.</Lede>
      <HowSteps testid="levels-steps" steps={[
        ['Make a group with a spending rule', 'In Customer groups, for example "spent ₹25,000 in a year".'],
        ['Customers join by themselves', 'Their bills in the shop and online, and boutique work, count. They leave if they stop spending.'],
        ['They earn more points', 'At the till and online. Staff see the level and its perk on their page.']
      ]} />
      <p className="pe-hint">A level is one of your groups with a spending rule ("spent ₹25,000 in a year"). Customers in it earn its points at the till and online, never less than your usual {q.data.normalPointsPer100 ?? 1} per ₹100, and see its perk on their page.{q.data.loyaltyOn === false ? ' Points are off in Inventory, so levels earn nothing until you switch points on there.' : ''}</p>
      {rows.length === 0 ? <p className="sh-none" data-testid="levels-none"><b>You have no levels yet.</b> None of your groups has a spending rule. Give a group one (Customer groups, Rules) and it can be a level. <Link to="/groups">Open Customer groups</Link></p> : (
        <ul className="nx-lv-list">
          {rows.map(r => (
            <li key={r.key} className={r.isLevel ? 'on' : ''}>
              <label className="nx-lv-name"><input type="checkbox" checked={r.isLevel} onChange={(e) => setRow(r.key, { isLevel: e.target.checked, points: r.points === '' ? 1 : r.points })} data-testid="level-on" />
                <span><b>{r.name}</b><small>From {rupees(r.minSpend)} in {r.days >= 360 && r.days <= 370 ? 'a year' : `${r.days} days`}</small></span>
              </label>
              {r.isLevel && (
                <div className="nx-lv-fields">
                  <label className="pe-field"><span>Points per ₹100</span><input className="ms-input" inputMode="numeric" value={r.points} onChange={(e) => setRow(r.key, { points: e.target.value.replace(/\D/g, '').slice(0, 3) })} data-testid="level-points" /></label>
                  <label className="pe-field"><span>Perk (optional)</span><input className="ms-input" maxLength={80} value={r.perk} onChange={(e) => setRow(r.key, { perk: e.target.value })} placeholder="Free fall and pico" /></label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="pe-err" role="alert">{error}</p>}
      {rows.length > 0 && <div className="pe-btns"><button type="button" className="btn-primary" disabled={save.isPending} onClick={submit} data-testid="levels-save">{save.isPending && <Loader2 size={14} className="animate-spin" />} Save levels</button></div>}
    </div>
  );
}
