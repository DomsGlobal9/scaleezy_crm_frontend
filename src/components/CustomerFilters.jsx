import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useCustomers } from '../hooks/useCustomers';
import { useSegmentChoices } from '../hooks/useSegments';
import { ONE_OF, oneOfOn, payWord, rangeWord, rangesOf, tidy } from '../utils/customerFilters';
import Select from './common/Select';

/**
 * Everything to filter All customers by, in one place: tap to choose, and the button at the bottom says
 * how many before you leave. Two chosen in one row means either one; each group only narrows further.
 * The owner's mockup, 5 Nov.
 */
/** A filter is offered only when this shop has something for it. */
const has = (list) => (list ?? []).length > 0;

export default function CustomerFilters({ rules, search, onApply, onClose }) {
  const [draft, setDraft] = useState(rules);
  const [asked, setAsked] = useState(() => tidy(rules));
  const closeRef = useRef(null);
  const opener = useRef(document.activeElement);
  const choices = useSegmentChoices();
  const c = choices.data;
  // Which filters this shop has anything for. While that is on its way, nothing extra shows.
  const f = c?.has ?? {};

  useEffect(() => { const t = setTimeout(() => setAsked(tidy(draft)), 300); return () => clearTimeout(t); }, [draft]);
  const count = useCustomers({ search, rules: asked, page: 1, pageSize: 1 });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const back = opener.current;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; back?.focus?.(); };
  }, [onClose]);

  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const toggle = (key, value) => setDraft(d => {
    const now = d[key] ?? [];
    return { ...d, [key]: now.includes(value) ? now.filter(x => x !== value) : [...now, value] };
  });
  const flag = (key) => setDraft(d => { const n = { ...d }; if (n[key]) delete n[key]; else n[key] = true; return n; });
  const money = (key) => (e) => { const v = e.target.value; set(key, v === '' ? undefined : Number(v)); };
  const oneOf = (name, option) => setDraft(d => {
    const n = { ...d };
    const on = oneOfOn(d, name) === option[0];
    ONE_OF[name].keys.forEach(k => delete n[k]);
    return on ? n : { ...n, ...option[2] };
  });

  const total = count.data?.total;
  const invalid = count.isError ? (count.error?.message || 'Check those filters.') : null;

  return createPortal(
    <div className="cf-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="cf-panel" role="dialog" aria-modal="true" aria-labelledby="cf-title" data-testid="filters-panel">
        <header className="cf-head">
          <h2 id="cf-title">Filters</h2>
          <span className="cf-head-end">
            <button type="button" className="si-link" onClick={() => setDraft({})} data-testid="filters-clear">Clear all</button>
            <button ref={closeRef} type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close filters"><X size={18} /></button>
          </span>
        </header>

        <div className="cf-body">
          <Group title="Price">
            <Row label="Budget for one piece">
              {rangesOf(c?.bands).map(k => <Chip key={k} on={draft.budget?.includes(k)} onClick={() => toggle('budget', k)}>{rangeWord(k)}</Chip>)}
            </Row>
            <Row label="Total spent">
              <span className="cf-range">
                <input className="input-field cf-num" type="number" inputMode="numeric" min="1" placeholder="From ₹" aria-label="Total spent from" value={draft.spentAtLeast ?? ''} onChange={money('spentAtLeast')} />
                to
                <input className="input-field cf-num" type="number" inputMode="numeric" min="1" placeholder="To ₹" aria-label="Total spent to" value={draft.spentAtMost ?? ''} onChange={money('spentAtMost')} />
              </span>
            </Row>
            <Row label="Bought a piece over">
              <input className="input-field cf-num" type="number" inputMode="numeric" min="1" placeholder="₹" aria-label="Bought a piece over" value={draft.boughtOver ?? ''} onChange={money('boughtOver')} />
            </Row>
          </Group>

          <Group title="What they buy">
            {has(c?.kinds) && <Row label="Kind"><Words list={c.kinds} chosen={draft.boughtKinds} onToggle={(k) => toggle('boughtKinds', k)} /></Row>}
            {has(c?.fabrics) && <Row label="Fabric"><Words list={c.fabrics} chosen={draft.fabrics} onToggle={(k) => toggle('fabrics', k)} /></Row>}
            {has(c?.crafts) && <Row label="Craft"><Words list={c.crafts} chosen={draft.crafts} onToggle={(k) => toggle('crafts', k)} /></Row>}
            {(has(c?.colours) || has(c?.sizes)) && (
              <Row label="Colour and size">
                <span className="cf-range">
                  {has(c?.colours) && <Pick label="Any colour" options={c.colours} chosen={draft.colours} onChange={(v) => set('colours', v)} />}
                  {has(c?.sizes) && <Pick label="Any size" options={c.sizes} chosen={draft.sizes} onChange={(v) => set('sizes', v)} />}
                </span>
              </Row>
            )}
            {!has(c?.kinds) && !has(c?.fabrics) && !has(c?.crafts) && !has(c?.colours) && !has(c?.sizes) && <p className="cf-note" style={{ margin: 0 }}>Nothing yet: this fills in from your customers' bills.</p>}
          </Group>

          <Group title="How often">
            <Row label="Bills"><OneOf name="bills" rules={draft} onPick={oneOf} /></Row>
            {f.visits && <Row label="Last visit" note="Only bills with a real date count. Someone with only past purchases has no known last visit, so they don't appear under any of these."><OneOf name="visit" rules={draft} onPick={oneOf} /></Row>}
            {f.earlier && <Row label="Past or new"><OneOf name="earlier" rules={draft} onPick={oneOf} /></Row>}
          </Group>

          {(f.returned || has(c?.pays)) && (
            <Group title="Returns and paying">
              {f.returned && <Row label="Returns"><Chip on={!!draft.returned} onClick={() => flag('returned')}>Has returned something</Chip></Row>}
              {has(c?.pays) && <Row label="Usually pays by">{c.pays.map(k => <Chip key={k} on={draft.pays?.includes(k)} onClick={() => toggle('pays', k)}>{payWord(k)}</Chip>)}</Row>}
            </Group>
          )}

          {(f.inStore || f.online || f.place) && (
            <Group title="Where">
              {(f.inStore || f.online) && <Row label="Bought"><OneOf name="channel" rules={draft} onPick={oneOf} only={[f.inStore && 'in_store', f.online && 'online']} /></Row>}
              {f.place && (
                <Row label="Place" note="Only customers whose address the shop has.">
                  <input className="input-field cf-text" maxLength={80} placeholder="Town or pincode" aria-label="Town or pincode" value={draft.place ?? ''} onChange={(e) => set('place', e.target.value)} />
                </Row>
              )}
            </Group>
          )}

          {(has(c?.groups) || f.birthday || f.anniversary || f.points || f.credit || f.agreed) && (
            <Group title="More">
              {has(c?.groups) && <Row label="Customer group"><Pick label="Any group" options={c.groups} chosen={draft.groups} onChange={(v) => set('groups', v)} wide /></Row>}
              {(f.birthday || f.anniversary) && (
                <Row label="Dates">
                  {f.birthday && <OneOf name="birthday" rules={draft} onPick={oneOf} />}
                  {f.anniversary && <OneOf name="anniversary" rules={draft} onPick={oneOf} />}
                </Row>
              )}
              {(f.points || f.credit || f.agreed) && (
                <Row label="Has">
                  {f.points && <Chip on={!!draft.hasPoints} onClick={() => flag('hasPoints')}>Points</Chip>}
                  {f.credit && <Chip on={!!draft.hasCredit} onClick={() => flag('hasCredit')}>Store credit</Chip>}
                  {f.agreed && <OneOf name="whatsapp" rules={draft} onPick={oneOf} />}
                </Row>
              )}
            </Group>
          )}
        </div>

        <footer className="cf-foot">
          {invalid && <p className="pe-err" role="alert" data-testid="filters-error">{invalid}</p>}
          <div className="cf-foot-row">
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn-primary" disabled={!!invalid} onClick={() => onApply(tidy(draft))} data-testid="filters-show">
              {count.isFetching && total === undefined ? <Loader2 size={14} className="animate-spin" /> : null}
              {total === undefined ? 'Show customers' : total === 1 ? 'Show 1 customer' : `Show ${total.toLocaleString('en-IN')} customers`}
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body
  );
}

function Group({ title, children }) {
  return <section className="cf-group"><h3>{title}</h3><div className="cf-rows">{children}</div></section>;
}
function Row({ label, note, children }) {
  return (
    <div className="cf-row">
      <span className="cf-label">{label}</span>
      <div className="cf-chips">{children}</div>
      {note && <p className="cf-note">{note}</p>}
    </div>
  );
}
function Chip({ on, onClick, children }) {
  return <button type="button" className={`cf-chip${on ? ' on' : ''}`} aria-pressed={!!on} onClick={onClick}>{children}</button>;
}
function OneOf({ name, rules, onPick, only }) {
  const on = oneOfOn(rules, name);
  return ONE_OF[name].options.filter(o => !only || only.includes(o[0])).map(o => <Chip key={o[0]} on={on === o[0]} onClick={() => onPick(name, o)}>{o[1]}</Chip>);
}
/** The shop's own words, as it wrote them. */
function Words({ list, chosen, onToggle }) {
  return list.map(k => <Chip key={k} on={chosen?.includes(k)} onClick={() => onToggle(k)}>{k}</Chip>);
}
/** One of a long list: the shop's own colours, sizes or groups. */
function Pick({ label, options, chosen, onChange, wide }) {
  const value = chosen?.[0] ?? '';
  const list = options ?? [];
  return (
    <span className={wide ? 'cf-pick wide' : 'cf-pick'}>
      <Select value={value} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} aria-label={label}>
        <option value="">{label}</option>
        {list.map(o => <option key={o} value={o}>{o}</option>)}
      </Select>
    </span>
  );
}
