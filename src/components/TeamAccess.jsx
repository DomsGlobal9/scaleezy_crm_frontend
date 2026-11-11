import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { INVENTORY_URL } from '../lib/config';
import { formatDay } from '../utils/dates';
import LoadFailed from './LoadFailed';

/** Short words for each CRM permission, for one line per person. */
const SHORT = {
  'crm:sales': 'Sales dashboard', 'crm:customer:create': 'Add customers', 'crm:customer:view': 'See customers', 'crm:customer:phone': 'Full phone numbers',
  'crm:customer:update': 'Notes and follow-ups', 'crm:customer:merge': 'Merge duplicates', 'crm:lists': 'Lists and groups', 'crm:messages:view': 'See messages',
  'crm:messages:send': 'Send messages', 'crm:reviews': 'Reviews', 'crm:team:view': 'This week', 'crm:shop': 'Festivals and prices'
};

/**
 * Team and access (the owner's OK, 11 Nov): who can do what in CRM, read only. People and roles are kept
 * in one place for every ScaleEzy module, Inventory's Team members for now, so nobody is set up twice and
 * switching someone off there switches them off here too.
 */
export default function TeamAccess() {
  const team = useQuery({ queryKey: ['shop', 'team'], queryFn: async () => (await api.get('/shop/team')).data });
  return (
    <section className="crm-card pe-auto" data-testid="team-access" aria-labelledby="ta-h">
      <h2 id="ta-h"><ShieldCheck size={18} aria-hidden="true" /> Team and access</h2>
      <p className="crm-muted" style={{ marginTop: 0 }}>
        Who can do what in CRM, as of each person's last sign-in. To change it, use Team members in Inventory: one place for every ScaleEzy module.{' '}
        <a href={`${INVENTORY_URL}/settings?section=USERS`} target="_blank" rel="noreferrer" className="si-link" data-testid="team-change">Change in Team members <ExternalLink size={12} aria-hidden="true" /></a>
      </p>
      {team.isLoading ? <p className="crm-muted">Loading the team…</p>
        : team.isError ? <LoadFailed what="the team" error={team.error} onRetry={() => team.refetch()} />
          : (
            <ul className="ta-people">
              {team.data.people.map(p => {
                const all = team.data.permissions.length;
                const has = p.isOwner ? all : p.access.length;
                return (
                  <li key={p.id} className="ta-person" data-testid="team-person">
                    <div className="ta-who">
                      <strong>{p.name}</strong>
                      <span className="crm-muted">{[p.email, `last in ${formatDay(p.lastSeenAt)}`].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="ta-can">
                      {p.isOwner ? <span className="sd-tag good">Owner: everything</span>
                        : has === 0 && p.seesCustomers ? <span className="sd-tag" data-testid="team-pending">Shown after their next sign-in</span>
                        : has === 0 ? <span className="sd-tag">No CRM access</span>
                          : team.data.permissions.filter(x => p.access.includes(x.key)).map(x => <span key={x.key} className="ta-chip" title={x.label}>{SHORT[x.key] ?? x.label}</span>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      {team.data && <p className="crm-muted sd-small">Only people who have signed in to CRM are listed. Deleting customers, Shop settings and automatic messages are the owner's alone.</p>}
    </section>
  );
}
