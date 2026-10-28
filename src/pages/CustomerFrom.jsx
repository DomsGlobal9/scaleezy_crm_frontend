import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserX } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Where "Open in CRM" from another module lands: /customers/from/inventory/<Inventory's customer id>.
 * The other module knows only its own id; CRM finds the person (following merges) and goes straight
 * to their page, replacing this address so Back returns to the module.
 */
export default function CustomerFrom() {
  const { source, externalId } = useParams();
  const navigate = useNavigate();
  const found = useQuery({
    queryKey: ['customerFrom', source, externalId],
    queryFn: async () => (await api.get(`/customers/from/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`)).data,
    retry: false,
    meta: { quiet: true }
  });

  useEffect(() => {
    if (found.data?.id) navigate(`/customers/${found.data.id}`, { replace: true });
  }, [found.data, navigate]);

  if (found.isError) {
    return (
      <main className="crm-page">
        <div className="crm-card crm-empty" data-testid="from-missing">
          <UserX size={26} style={{ color: 'var(--accent-warning)' }} />
          <h3>{found.error?.statusCode === 404 ? 'Not in CRM yet' : 'Could not open this customer'}</h3>
          <p>{found.error?.message || 'Try again in a moment.'}</p>
          <Link to="/customers" className="btn-secondary">See all customers</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="crm-page">
      <div className="crm-card crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Opening the customer…</div>
    </main>
  );
}
