import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldOff } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useMoved, useSetMoved, useSetProfileMoved } from '../hooks/useProfileEdit';
import { formatDay } from '../utils/dates';
import LoadFailed from '../components/LoadFailed';
import FeedbackSettings from '../components/FeedbackSettings';

/**
 * The owner's Shop settings: what this shop does in CRM instead of Inventory (Inventory's hand-over
 * switch, moved.*). Offers, birthdays and deletes; campaigns; wishes. When one is on, Inventory stops
 * doing it for this shop, so there is one place for it. Inventory keeps the safety rules: campaigns
 * wait while one of its own is still going out (its sentence is shown as it comes), and it picks the
 * first day CRM wishes, so no birthday is wished twice or missed.
 */
function Row({ id, title, children, on, onFlip, busy, testid, refusal }) {
  return (
    <>
      <div className="pe-sw-row">
        <div>
          <h3 id={id}>{title}</h3>
          {children}
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={`pe-toggle${on ? ' on' : ''}`} onClick={onFlip} disabled={busy} data-testid={testid} />
      </div>
      {refusal && <p className="ms-refused" role="alert" data-testid={`${testid}-refused`}>{refusal}</p>}
    </>
  );
}

export default function ShopSettings() {
  const { isOwner } = usePermission();
  const moved = useMoved(isOwner);
  const setProfile = useSetProfileMoved();
  const setCampaigns = useSetMoved('campaigns');
  const setWishes = useSetMoved('wishes');
  const [refused, setRefused] = useState({});

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

  const m = moved.data ?? {};
  const flip = (key, mutation, on, words) => async () => {
    setRefused(r => ({ ...r, [key]: null }));
    try {
      await mutation.mutateAsync(on);
      toast.success(words[on ? 0 : 1]);
    } catch (err) {
      // Inventory's own sentence ("A campaign is still going out from Inventory: …"), shown under the switch.
      setRefused(r => ({ ...r, [key]: err?.message || 'The setting could not be changed. Try again.' }));
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
            <Row id="pe-profile" title="Change offers, birthdays and deletes here" on={m.profile === true} busy={setProfile.isPending} testid="profile-switch" refusal={refused.profile}
              onFlip={flip('profile', setProfile, !(m.profile === true), ['Offers, birthdays and deletes are changed here now.', 'Inventory looks after offers, birthdays and deletes again.'])}>
              <p>When this is on, your staff change these in CRM, and Inventory shows them read only with a link here:</p>
              <ul><li>the WhatsApp offers answer</li><li>birthday and anniversary</li><li>deleting a customer (you only)</li></ul>
              <p className="pe-gap">Name, phone, email and groups stay in Inventory. The till still asks about offers at a sale.</p>
            </Row>
            <div className="pe-state" data-testid="profile-state">
              {setProfile.isPending ? 'Saving…' : m.profile === true ? 'On: your staff change these here. Inventory shows them read only.' : 'Off: Inventory looks after these for now.'}
            </div>

            <Row id="pe-campaigns" title="Send campaigns from CRM" on={m.campaigns === true} busy={setCampaigns.isPending} testid="campaigns-switch" refusal={refused.campaigns}
              onFlip={flip('campaigns', setCampaigns, !(m.campaigns === true), ['Campaigns are sent from CRM now.', 'Inventory sends your campaigns again.'])}>
              <p>{m.campaigns === true ? "Your campaigns are made and sent here, in Messages. Inventory's Campaigns page shows the old ones, read only." : 'Off: Inventory sends your campaigns for now. Messages can be written here, and start once this is on.'}</p>
            </Row>

            <Row id="pe-wishes" title="Send birthday and anniversary wishes from CRM" on={!!m.wishes} busy={setWishes.isPending} testid="wishes-switch" refusal={refused.wishes}
              onFlip={flip('wishes', setWishes, !m.wishes, ['Wishes are sent from CRM now, with the words and pictures you had.', 'Inventory sends your wishes again.'])}>
              <p>{m.wishes?.fromDay ? `From ${formatDay(`${m.wishes.fromDay}T12:00:00Z`)}. Inventory wished the days before.` : 'Off: Inventory sends your wishes for now. When this goes on, the words and pictures come with them.'}</p>
            </Row>
            <p className="pe-hint">Birthday gift points and the "points lapsing" reminder stay in Inventory: they are about points.</p>
            <FeedbackSettings />
          </>
        )}
      </section>
    </main>
  );
}
