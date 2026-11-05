import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import { usePriceBands, useSavePriceBands } from '../hooks/useMessages';
import { rangeWord, rangesOf } from '../utils/customerFilters';
import LoadFailed from './LoadFailed';

/**
 * The shop's own price ranges, for "Budget for one piece" in the filters. What suits a saree shop suits
 * nothing else, so each shop sets its own, starting from sensible amounts.
 */
export default function PriceBands() {
  const s = usePriceBands();
  const save = useSavePriceBands();
  const [typed, setTyped] = useState(null);
  const [error, setError] = useState(null);
  if (s.isLoading) return null;
  if (s.isError) return <LoadFailed what="the price ranges" error={s.error} onRetry={() => s.refetch()} />;
  const bands = typed ?? s.data.bands;
  const numbers = bands.map(Number);
  const dirty = JSON.stringify(numbers) !== JSON.stringify(s.data.bands);
  const set = (i, v) => setTyped(bands.map((b, n) => (n === i ? v : b)));
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try { await save.mutateAsync(numbers); setTyped(null); toast.success('The price ranges are saved.'); }
    catch (err) { setError(err?.message || 'The price ranges could not be saved. Try again.'); }
  };
  const valid = numbers.every(n => Number.isInteger(n) && n > 0) && numbers.every((n, i) => i === 0 || n > numbers[i - 1]);
  return (
    <form className="pe-auto" onSubmit={submit} data-testid="price-bands">
      <h2>Price ranges</h2>
      <p className="pe-hint">For "Budget for one piece" in the customer filters. Set the prices where your ranges change.</p>
      <div className="cf-range">
        {bands.map((b, i) => (
          <span key={i} className="cf-range">
            <input className="input-field cf-num" type="number" inputMode="numeric" min="1" step="1" value={b} aria-label={`Price ${i + 1}`} onChange={(e) => set(i, e.target.value)} />
            {bands.length > 1 && <button type="button" className="crm-iconbtn" aria-label={`Take away price ${i + 1}`} onClick={() => setTyped(bands.filter((_, n) => n !== i))}><X size={14} /></button>}
          </span>
        ))}
        {bands.length < 6 && <button type="button" className="si-link" onClick={() => setTyped([...bands, ''])} data-testid="band-add"><Plus size={14} aria-hidden="true" /> Add</button>}
      </div>
      {valid && <p className="pe-hint" data-testid="band-words">{rangesOf(numbers).map(rangeWord).join(' · ')}</p>}
      {error && <p className="pe-err" role="alert" data-testid="band-error">{error}</p>}
      {dirty && <div className="pe-btns"><button type="submit" className="btn-primary" disabled={!valid || save.isPending} data-testid="band-save">Save the ranges</button></div>}
    </form>
  );
}
