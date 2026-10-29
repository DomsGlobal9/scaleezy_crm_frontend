import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import { useDeleteCustomer, useDeletePreview } from '../hooks/useProfileEdit';
import LoadFailed from './LoadFailed';

/**
 * Deleting a customer (the owner only, as in Inventory, which does it). Inventory says first what
 * will happen: REMOVE (no money history, gone for good), ERASE (bills kept for GST, their details
 * wiped), or blocked (store credit, an order still to go) -- that sentence is shown as it comes, with
 * nothing to press. The owner types the last 4 digits of their phone, or their name, to confirm.
 */
export default function DeleteCustomer({ customerId, onClose }) {
  const preview = useDeletePreview(customerId, true);
  const remove = useDeleteCustomer(customerId);
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);
  const closeRef = useRef(null);
  const opener = useRef(document.activeElement);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const p = preview.data;
  const expected = p ? (p.phoneLast4 ?? p.name ?? '') : '';
  const matches = !!expected && typed.trim().toLowerCase() === expected.trim().toLowerCase();
  const erase = p?.mode === 'ERASE';

  const submit = async (e) => {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    try {
      const r = await remove.mutateAsync(typed.trim());
      toast.success(r?.mode === 'ERASE' ? `${p.name}'s details were erased.` : `${p.name} was deleted.`);
      onClose();
      navigate('/customers', { replace: true });
    } catch (err) {
      setError(err?.message || 'They could not be deleted. Try again.');
    }
  };

  const subtitle = !p ? '' : p.blocked ? 'Not yet.'
    : erase ? (p.bills > 0 ? 'They have bills, so they are erased, not deleted.' : 'They have a points or credit history, so they are erased, not deleted.')
    : 'No bills, so they are deleted for good.';

  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cr-dialog" role="dialog" aria-modal="true" aria-labelledby="dc-title" data-testid="delete-customer">
        <header className="cr-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="dc-title">{p ? `Delete ${p.name}?` : 'Delete this customer?'}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {preview.isLoading ? (
          <div className="crm-row crm-muted" aria-busy="true"><Loader2 size={16} className="animate-spin" /> Asking Inventory what deleting them would do…</div>
        ) : preview.isError ? (
          <LoadFailed what="what deleting them would do" error={preview.error} onRetry={() => preview.refetch()} />
        ) : p.blocked ? (
          <>
            <p className="pe-what soft" data-testid="delete-blocked">{p.blocked}</p>
            <div className="pe-btns"><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <form onSubmit={submit} className="pe-delete">
            <p className="pe-what" data-testid="delete-what">
              {erase
                ? <>Their name, phone, email, birthday, anniversary and notes are erased in Inventory and in CRM. {p.bills > 0
                    ? `The ${p.bills === 1 ? 'bill stays' : `${p.bills.toLocaleString('en-IN')} bills stay`}, without their name, because the shop keeps bills for GST.`
                    : 'Their points and credit history stays, without their name, for the shop\'s accounts.'} This cannot be undone.</>
                : <>{p.name} is deleted from Inventory and CRM, with their try-ons, door check-ins and look-ups. This cannot be undone.</>}
            </p>
            {erase && (p.bills > 0 || p.loyaltyPoints > 0) && (
              <div className="pe-facts">
                {p.bills > 0 && <span><b>{p.bills.toLocaleString('en-IN')}</b> {p.bills === 1 ? 'bill' : 'bills'}</span>}
                {p.loyaltyPoints > 0 && <span><b>{p.loyaltyPoints.toLocaleString('en-IN')}</b> points go with them</span>}
              </div>
            )}
            <label className="pe-type">
              <span>{p.phoneLast4 ? `Type the last 4 digits of their phone (…${p.phoneLast4}) to confirm` : `Type their name (${p.name}) to confirm`}</span>
              <input className="pe-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
                inputMode={p.phoneLast4 ? 'numeric' : 'text'} aria-label={p.phoneLast4 ? 'Last 4 digits' : 'Their name'} data-testid="delete-confirm" />
            </label>
            {error && <p className="pe-err" role="alert">{error}</p>}
            <div className="pe-btns">
              <button type="submit" className="pe-danger" disabled={!matches || remove.isPending} data-testid="delete-go">
                {remove.isPending && <Loader2 size={14} className="animate-spin" />} {erase ? 'Erase their details' : 'Delete for good'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Keep them</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
