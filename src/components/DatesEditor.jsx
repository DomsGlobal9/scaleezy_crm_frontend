import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import Select from './common/Select';
import { useSetDates } from '../hooks/useProfileEdit';

/**
 * Birthday and anniversary, day and month only (Inventory keeps no year). Opens under the header.
 * Only what changed is sent; Inventory checks the day ("That day does not exist…", 29 Feb is fine)
 * and its sentence is shown as it comes.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const split = (mmdd) => {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd || '');
  return m ? { day: String(Number(m[2])), month: String(Number(m[1])) } : { day: '', month: '' };
};

function DayMonth({ label, value, onChange, bad }) {
  return (
    <div className="pe-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="pe-pair">
        <div className={bad ? 'pe-bad' : ''}>
          <Select value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })} aria-label={`${label}: day`}>
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
          </Select>
        </div>
        <div className={bad ? 'pe-bad' : ''}>
          <Select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} aria-label={`${label}: month`}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </Select>
        </div>
        {(value.day || value.month) && (
          <button type="button" className="pe-clear" onClick={() => onChange({ day: '', month: '' })}>Clear</button>
        )}
      </div>
    </div>
  );
}

export default function DatesEditor({ customerId, birthday, anniversary, onClose }) {
  const [b, setB] = useState(split(birthday));
  const [a, setA] = useState(split(anniversary));
  const [error, setError] = useState(null);
  const [bad, setBad] = useState([]);
  const save = useSetDates(customerId);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBad([]);
    const change = {};
    for (const [key, v, was] of [['birthday', b, birthday], ['anniversary', a, anniversary]]) {
      if (!!v.day !== !!v.month) { setBad([key]); setError('Choose both the day and the month, or press Clear.'); return; }
      const next = v.day ? `${pad(v.month)}-${pad(v.day)}` : null;
      if (next !== (was || null)) change[key] = next;
    }
    if (Object.keys(change).length === 0) { onClose(); return; }
    try {
      await save.mutateAsync(change);
      toast.success('Dates saved.');
      onClose();
    } catch (err) {
      setBad(Object.keys(change));
      setError(err?.message || 'The dates could not be saved. Try again.');
    }
  };

  return (
    <form className="pe-dates" onSubmit={submit} data-testid="dates-editor">
      <h3>Birthday and anniversary</h3>
      <DayMonth label="Birthday" value={b} onChange={setB} bad={bad.includes('birthday')} />
      <DayMonth label="Anniversary" value={a} onChange={setA} bad={bad.includes('anniversary')} />
      {error
        ? <p className="pe-err" role="alert" data-testid="dates-error">{error}</p>
        : <p className="pe-hint">No year is kept. It is saved in Inventory too.</p>}
      <div className="pe-btns">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending && <Loader2 size={14} className="animate-spin" />} Save dates
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
