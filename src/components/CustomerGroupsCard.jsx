import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Loader2, Plus, X } from 'lucide-react';
import LoadFailed from './LoadFailed';
import { usePermission } from '../hooks/usePermission';
import { useAddToGroup, useCreateGroup, useCustomerGroups, useGroups, useTakeOutOfGroup } from '../hooks/useGroups';

/**
 * A customer's groups, on their page (18 Nov, the approved mockup): groups are CRM's, and Inventory's
 * "Change groups in CRM" button opens this page. Shown: their groups ("auto" when the spending rule added them),
 * take out with ×, add to one, or make a new one (the owner and managers). Taking someone out of a group a live
 * offer is aimed at asks first, naming the offer. The till's copy follows within moments.
 */
export default function CustomerGroupsCard({ customerId, firstName }) {
  const { can } = usePermission();
  const mayChange = can('crm:customer:update');
  const mayMake = can('crm:lists');
  const mine = useCustomerGroups(customerId);
  const [open, setOpen] = useState(false);
  const all = useGroups(open);
  const add = useAddToGroup();
  const takeOut = useTakeOutOfGroup();
  const make = useCreateGroup();
  const [asking, setAsking] = useState(null);
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState('');
  const [said, setSaid] = useState(null);
  const menuRef = useRef(null);
  const who = firstName || 'them';

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setOpen(false); setMaking(false); } };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setMaking(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const groups = mine.data?.groups ?? [];
  const inKeys = new Set(groups.map(g => g.key));
  const choices = (all.data ?? []).filter(g => !inKeys.has(g.key));

  const addTo = async (name) => {
    setSaid(null);
    try {
      const r = await add.mutateAsync({ group: name, customerIds: [customerId] });
      if (r?.tooManyGroups) setSaid(`${who} is in 20 groups already. Take them out of one first.`);
      else toast.success(`Added to ${name}.`);
      setOpen(false); setMaking(false); setNewName('');
    } catch (e) { setSaid(e?.message || 'They could not be added. Try again.'); }
  };
  const makeAndAdd = async (e) => {
    e.preventDefault();
    setSaid(null);
    try { const g = await make.mutateAsync(newName); await addTo(g.name); }
    catch (err) { setSaid(err?.message || 'The group could not be made. Try again.'); }
  };
  const remove = async (g) => {
    setSaid(null);
    try { await takeOut.mutateAsync({ key: g.key, customerId }); setAsking(null); toast.success(`Taken out of ${g.name}.`); }
    catch (e) { setSaid(e?.message || 'They could not be taken out. Try again.'); }
  };
  const askOrRemove = (g) => {
    // An offer aimed at the group, or Inventory could not say: ask first.
    if (g.offers === null || (g.offers ?? []).length > 0) setAsking(g.key); else remove(g);
  };

  return (
    <section className="crm-card wk-card cg-card" aria-labelledby="cg-h" data-testid="groups-card">
      <div className="wk-head"><h2 id="cg-h">Groups</h2><small className="cg-sub">Used at the till for offers</small></div>
      {mine.isLoading ? <p className="crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        : mine.isError ? <LoadFailed what="their groups" error={mine.error} onRetry={() => mine.refetch()} />
        : (
          <>
            {groups.length === 0 ? <p className="crm-muted wk-none" data-testid="groups-none">Not in any group.</p> : (
              <div className="cg-chips">
                {groups.map(g => (
                  <span key={g.key} className="cg-chip" data-testid="group-chip">
                    {g.name}{g.auto && <span className="cg-auto" title="Added by the group's spending rule">auto</span>}
                    {mayChange && <button type="button" className="cg-x" aria-label={`Take ${who} out of ${g.name}`} disabled={takeOut.isPending} onClick={() => askOrRemove(g)} data-testid="group-out"><X size={13} /></button>}
                  </span>
                ))}
              </div>
            )}
            {asking && (() => {
              const g = groups.find(x => x.key === asking);
              if (!g) return null;
              const offers = g.offers ?? [];
              return (
                <div className="cg-ask" role="alertdialog" aria-label={`Take ${who} out of ${g.name}?`} data-testid="group-out-ask">
                  <p>Take {who} out of {g.name}? {offers.length
                    ? <>{offers.length === 1 ? 'The offer' : 'The offers'} {offers.map(o => `"${o}"`).join(', ')} will no longer apply to {who} at the till.</>
                    : <>If an offer is aimed at {g.name}, it will no longer apply to {who} at the till.</>}</p>
                  <div className="pe-btns">
                    <button type="button" className="btn-secondary" onClick={() => setAsking(null)}>Keep {who === 'them' ? 'them' : who} in</button>
                    <button type="button" className="pe-danger" disabled={takeOut.isPending} onClick={() => remove(g)} data-testid="group-out-yes">Take out</button>
                  </div>
                </div>
              );
            })()}
            {mayChange && (
              <div className="cg-add" ref={menuRef}>
                <button type="button" className="cg-select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="group-add">
                  Add to a group <ChevronDown size={14} aria-hidden="true" />
                </button>
                {open && (
                  <div className="cg-menu" role="listbox" aria-label="Groups to add to" data-testid="group-menu">
                    {all.isLoading ? <div className="cg-item crm-muted"><Loader2 size={14} className="animate-spin" /> Loading…</div>
                      : all.isError ? <div className="cg-item"><LoadFailed what="the groups" error={all.error} onRetry={() => all.refetch()} /></div>
                      : (
                        <>
                          {choices.length === 0 && !making && <div className="cg-item crm-muted">{(all.data ?? []).length ? 'In every group already.' : 'No groups yet.'}</div>}
                          {choices.map(g => (
                            <button key={g.key} type="button" role="option" aria-selected="false" className="cg-item" disabled={add.isPending} onClick={() => addTo(g.name)} data-testid="group-choice">
                              <span>{g.name}</span><small>{g.count.toLocaleString('en-IN')} {g.count === 1 ? 'customer' : 'customers'}</small>
                            </button>
                          ))}
                          {mayMake && (making ? (
                            <form className="cg-item cg-new" onSubmit={makeAndAdd}>
                              <input className="ms-input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="New group's name" aria-label="New group's name" autoFocus data-testid="group-new-name" />
                              <button type="submit" className="btn-primary ms-small" disabled={!newName.trim() || make.isPending || add.isPending} data-testid="group-new-make">Make</button>
                            </form>
                          ) : (
                            <button type="button" className="cg-item cg-make" onClick={() => setMaking(true)} data-testid="group-new"><Plus size={14} /> Make a new group…</button>
                          ))}
                        </>
                      )}
                  </div>
                )}
              </div>
            )}
            {said && <p className="pe-err" role="alert" data-testid="groups-said">{said}</p>}
            <p className="cg-note">A change reaches the till within moments.{groups.some(g => g.auto) && ' "auto" means the spending rule added them; taken out by hand, it never adds them back.'}</p>
          </>
        )}
    </section>
  );
}
