import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tags, Plus, Loader2, ShieldOff, BellOff, CakeSlice, Sparkles, BadgePercent } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useCreateGroup, useGroups } from '../hooks/useGroups';
import { formatRupees } from '../utils/money';
import { rowLink } from '../components/common/rowLink';
import LoadFailed from '../components/LoadFailed';

/**
 * Customer groups (plan §7, item 2): the shop's own groups -- VIP, Wholesale, Staff -- with who is in
 * each, the rules they carry (no offer messages, no wishes, join by spending), and the offers that
 * are only for them. Kept in Inventory, where offers and the till read them; managed here.
 */
export default function Groups() {
  const { can } = usePermission();
  const navigate = useNavigate();
  const groups = useGroups();
  const create = useCreateGroup();
  const mayManage = can('customer:manage_groups');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');

  if (!can('customer:view')) {
    return (
      <div className="crm-notice"><div className="crm-card">
        <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
        <h2>You cannot see customers</h2>
        <p>Your role does not include seeing customers. Ask whoever manages your team if you need this.</p>
      </div></div>
    );
  }

  const make = async (e) => {
    e.preventDefault();
    setProblem('');
    try {
      const g = await create.mutateAsync(name.trim());
      setName('');
      if (g?.key) navigate(`/groups/${encodeURIComponent(g.key)}`);
    } catch (err) { setProblem(err?.message || 'The group could not be made.'); }
  };

  const list = groups.data ?? [];
  return (
    <main className="crm-page gr-page">
      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1><Tags size={24} aria-hidden="true" /> Groups</h1>
          <p>Your own groups of customers, like VIP or Wholesale. Offers can be just for a group; the till shows it.</p>
        </div>
      </div>

      {mayManage && (
        <form className="crm-card gr-new" onSubmit={make}>
          <label htmlFor="gr-name">New group</label>
          <div className="gr-new-row">
            <input id="gr-name" className="input-field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridal 2026" />
            <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}><Plus size={14} /> Make group</button>
          </div>
          {problem && <p className="si-error" role="alert" data-testid="group-problem">{problem}</p>}
        </form>
      )}

      {groups.isLoading ? (
        <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading groups…</div>
      ) : groups.isError ? (
        <div className="crm-card"><LoadFailed what="the groups" error={groups.error} onRetry={() => groups.refetch()} /></div>
      ) : list.length === 0 ? (
        <div className="crm-card crm-empty" data-testid="no-groups"><h3>No groups yet</h3><p>{mayManage ? 'Make one above, then add customers to it.' : 'The owner or an admin can make one.'}</p></div>
      ) : (
        <ul className="gr-list">
          {list.map(g => (
            <li key={g.key} data-testid="group" {...rowLink(() => navigate(`/groups/${encodeURIComponent(g.key)}`), { label: `Open ${g.name}` })} className="crm-card gr-item row-link">
              <div className="gr-name"><span className="crm-tag">{g.name}</span></div>
              <div className="gr-count"><strong>{g.count.toLocaleString('en-IN')}</strong> {g.count === 1 ? 'customer' : 'customers'}</div>
              <RuleBadges group={g} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** What a group carries, in a few words each. */
export function RuleBadges({ group: g }) {
  const badges = [
    g.noOfferMessages && { icon: BellOff, text: 'No offer messages' },
    g.noWishes && { icon: CakeSlice, text: 'No wishes' },
    g.autoMinSpend && g.autoDays && { icon: Sparkles, text: `Joins by spending ${formatRupees(g.autoMinSpend)} in ${g.autoDays} days` },
    ...(g.offers ?? []).map(o => ({ icon: BadgePercent, text: `Offer: ${o.name}` }))
  ].filter(Boolean);
  if (badges.length === 0) return <div className="gr-rules crm-muted">No rules</div>;
  return (
    <div className="gr-rules">
      {badges.map((b, i) => { const Icon = b.icon; return <span key={i} className="gr-badge"><Icon size={13} aria-hidden="true" /> {b.text}</span>; })}
    </div>
  );
}
