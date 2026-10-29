import React from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldOff } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useMoved, useSetProfileMoved } from '../hooks/useProfileEdit';
import LoadFailed from '../components/LoadFailed';

/**
 * The owner's Shop settings: what this shop changes in CRM instead of Inventory (Inventory's
 * hand-over switch, moved.*). One switch for now: offers, birthdays and deletes. When it is on,
 * Inventory shows them read only with a link here, so there is one place to change them.
 */
export default function ShopSettings() {
  const { isOwner } = usePermission();
  const moved = useMoved(isOwner);
  const set = useSetProfileMoved();

  if (!isOwner) {
    return (
      <div className="crm-notice">
        <div className="crm-card">
          <ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} />
          <h2>Only the shop owner can see these</h2>
          <p>Shop settings change how the whole shop works. Ask the owner if something here needs changing.</p>
        </div>
      </div>
    );
  }

  const on = moved.data?.profile === true;
  const flip = async () => {
    try {
      await set.mutateAsync(!on);
      toast.success(!on ? 'Offers, birthdays and deletes are changed here now.' : 'Inventory looks after offers, birthdays and deletes again.');
    } catch (err) {
      toast.error(err?.message || 'The setting could not be changed. Try again.');
    }
  };

  return (
    <main className="crm-page">
      <section className="crm-card pe-settings" data-testid="shop-settings">
        <h1>Shop settings</h1>
        {moved.isLoading ? (
          <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Loading the settings…</div>
        ) : moved.isError ? (
          <LoadFailed what="the shop settings" error={moved.error} onRetry={() => moved.refetch()} />
        ) : (
          <>
            <div className="pe-sw-row">
              <div>
                <h3 id="pe-profile">Change offers, birthdays and deletes here</h3>
                <p>When this is on, your staff change these in CRM, and Inventory shows them read only with a link here:</p>
                <ul><li>the WhatsApp offers answer</li><li>birthday and anniversary</li><li>deleting a customer (you only)</li></ul>
                <p className="pe-gap">Name, phone, email and groups stay in Inventory. The till still asks about offers at a sale.</p>
              </div>
              <button type="button" role="switch" aria-checked={on} aria-labelledby="pe-profile" className={`pe-toggle${on ? ' on' : ''}`}
                onClick={flip} disabled={set.isPending} data-testid="profile-switch" />
            </div>
            <div className="pe-state" data-testid="profile-state">
              {set.isPending ? 'Saving…' : on ? 'On: your staff change these here. Inventory shows them read only.' : 'Off: Inventory looks after these for now.'}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
