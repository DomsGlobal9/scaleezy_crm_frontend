import React from 'react';
import { Ruler, IndianRupee, Gift, Heart, AlertTriangle, StickyNote, Cake, Sparkles } from 'lucide-react';
import { formatRupees } from '../utils/money';
import { formatDay } from '../utils/dates';

const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** What to know before saying hello, one line each: what they wear and spend, and anything open about them. */
export default function SalesCues({ cues, max = 6 }) {
  if (!cues) return null;
  const lines = [];
  if (cues.firstVisit) lines.push({ icon: Sparkles, text: 'First visit: ask what she is looking for.' });
  if (cues.unhappy) lines.push({ icon: AlertTriangle, text: `Rated ${cues.unhappy.rating} of 5 on ${shortDay(cues.unhappy.on)}. Say sorry first.`, tone: 'bad' });
  if (cues.offer) lines.push({ icon: Gift, text: `Win-back offer open · ${cues.offer.code} · till ${shortDay(cues.offer.validUntil)}`, tone: 'good' });
  const wear = [cues.sizes?.length ? `Wears ${cues.sizes.join(', ')}` : null, cues.colours?.length ? `likes ${cues.colours.join(', ').toLowerCase()}` : null, cues.fabric].filter(Boolean);
  if (wear.length) lines.push({ icon: Ruler, text: wear.join(' · ') });
  const spend = [cues.usual ? `Usually ${formatRupees(cues.usual.from)} to ${formatRupees(cues.usual.to)}` : null, cues.dearest ? `dearest ${formatRupees(cues.dearest)}` : null].filter(Boolean);
  if (spend.length) lines.push({ icon: IndianRupee, text: spend.join(' · ') });
  if (cues.hearted) lines.push({ icon: Heart, text: `Hearted ${cues.hearted} ${cues.hearted === 1 ? 'piece' : 'pieces'} online lately` });
  if (cues.birthdayInDays !== null && cues.birthdayInDays !== undefined) lines.push({ icon: Cake, text: cues.birthdayInDays === 0 ? 'Birthday today' : `Birthday in ${cues.birthdayInDays} ${cues.birthdayInDays === 1 ? 'day' : 'days'}` });
  if (cues.note?.body) lines.push({ icon: StickyNote, text: `${cues.note.body}${cues.note.byName ? ` (${cues.note.byName})` : ''}` });
  return (
    <ul className="sd-cues" data-testid="cues">
      {lines.slice(0, max).map((l, i) => (
        <li key={i} className={l.tone ? `sd-cue ${l.tone}` : 'sd-cue'}><l.icon size={14} aria-hidden="true" /><span>{l.text}</span></li>
      ))}
      {cues.visits > 0 && cues.lastVisit && <li className="sd-cue muted"><span>{cues.visits} {cues.visits === 1 ? 'visit' : 'visits'} · last in {formatDay(cues.lastVisit)}</span></li>}
    </ul>
  );
}
