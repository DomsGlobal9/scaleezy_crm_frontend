import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, ImagePlus, Link2, X, ShieldOff } from 'lucide-react';
import Select from '../components/common/Select';
import MessageBubble from '../components/MessageBubble';
import LoadFailed from '../components/LoadFailed';
import { usePermission } from '../hooks/usePermission';
import { useSegments } from '../hooks/useSegments';
import { useGroups } from '../hooks/useGroups';
import { useMessage, useMessagePreview, useMessagesOverview, usePictures, useSaveMessage } from '../hooks/useMessages';

/**
 * Writing a message (Phase 3, the approved mockup): its name, who gets it -- a Saved list, a Customer
 * group, or everyone who agreed -- the words, a picture and a link, with what a customer sees beside
 * it. Before anything is sent the box says how many will get it and why the rest are left out.
 * Saving makes a draft; it is started from its own page, after a test.
 */
const choiceOf = (a) => (!a ? '' : a.segmentId ? `seg:${a.segmentId}` : a.group ? `grp:${a.group}` : a.everyone ? 'everyone' : '');
const audienceOf = (v) => (v === 'everyone' ? { everyone: true } : v.startsWith('seg:') ? { segmentId: v.slice(4) } : v.startsWith('grp:') ? { group: v.slice(4) } : null);
const n = (x) => (x ?? 0).toLocaleString('en-IN');

function Who({ audience }) {
  const p = useMessagePreview(audience);
  if (!audience) return null;
  if (p.isLoading) return <div className="ms-who crm-row crm-muted" aria-busy="true"><Loader2 size={14} className="animate-spin" /> Working out who gets it…</div>;
  if (p.isError) return <div className="ms-who"><LoadFailed what="who gets it" error={p.error} onRetry={() => p.refetch()} /></div>;
  const d = p.data;
  const left = [
    d.notAgreed ? `${n(d.notAgreed)} have not agreed to offers` : null,
    d.stopped ? `${n(d.stopped)} replied STOP` : null,
    d.noPhone ? `${n(d.noPhone)} have no phone number` : null,
    d.quietGroup ? `${n(d.quietGroup)} are in a group that gets no offers` : null,
    d.recentOffer ? `${n(d.recentOffer)} got an offer in the last 3 days, so they wait their turn` : null
  ].filter(Boolean);
  return (
    <div className="ms-who" data-testid="who">
      <div><b>{n(d.people)}</b> {d.people === 1 ? 'person' : 'people'} chosen</div>
      <div><b>{n(d.willGet)}</b> will get it{d.recentOffer ? `, ${n(d.recentOffer)} more after their 3 days` : ''}</div>
      {left.length > 0 && <small>{left.join(' · ')}</small>}
    </div>
  );
}

function PicturePicker({ onPick, onClose }) {
  const pics = usePictures();
  return createPortal(
    <div className="cr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cr-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-title">
        <header className="cr-head">
          <div><h2 id="pp-title">Choose a picture</h2><p>The pictures your shop already used in its messages.</p></div>
          <button type="button" className="crm-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {pics.isLoading ? <div className="crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading the pictures…</div>
          : pics.isError ? <LoadFailed what="the pictures" error={pics.error} onRetry={() => pics.refetch()} />
          : pics.data.length === 0 ? <p className="crm-muted">No pictures yet. Add one to a campaign in Inventory first; it shows here after.</p>
          : (
            <div className="ms-pics">
              {pics.data.map(p => (
                <button key={p.id} type="button" className="ms-pic-pick" onClick={() => onPick(p)} aria-label="Use this picture"><img src={p.url} alt="" /></button>
              ))}
            </div>
          )}
      </div>
    </div>,
    document.body
  );
}

export default function MessageEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const existing = useMessage(id);
  const overview = useMessagesOverview();
  const segments = useSegments();
  const groups = useGroups();
  const save = useSaveMessage(id);

  const [name, setName] = useState('');
  const [choice, setChoice] = useState('');
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [link, setLink] = useState(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const m = existing.data;
    if (!m) return;
    setName(m.name); setChoice(choiceOf(m.audience)); setText(m.text); setMedia(m.media); setLink(m.link ? { type: m.link.type, url: m.link.type === 'EXTERNAL' ? m.link.target : '' } : null);
  }, [existing.data]);

  const audience = useMemo(() => (choice ? audienceOf(choice) : null), [choice]);
  const preview = useMessagePreview(audience);
  const perDay = overview.data?.perDay ?? 20;
  const willGet = preview.data?.willGet ?? 0;
  const days = Math.max(1, Math.ceil(willGet / perDay));

  if (!can('campaign:send')) {
    return <div className="crm-notice"><div className="crm-card"><ShieldOff size={28} style={{ color: 'var(--accent-warning)' }} /><h2>Writing messages is not part of your role</h2><p>Ask the owner if you need to send WhatsApp messages to many customers.</p></div></div>;
  }
  if (id && existing.isLoading) return <main className="crm-page"><div className="crm-card crm-row crm-muted"><Loader2 size={16} className="animate-spin" /> Loading the message…</div></main>;
  if (id && existing.isError) return <main className="crm-page"><div className="crm-card"><LoadFailed what="the message" error={existing.error} onRetry={() => existing.refetch()} /></div></main>;

  const addLink = (type) => {
    setLink({ type, url: '' });
    if (!/\{link\}/.test(text)) setText(t => `${t.trimEnd()}${t.trim() ? ' ' : ''}{link}`);
  };
  const removeLink = () => { setLink(null); setText(t => t.replace(/\s*\{link\}/g, '')); };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { name, text, audience, media: media ? { id: media.id } : null, link: link ? (link.type === 'WHATSAPP' ? { type: 'WHATSAPP' } : { type: 'EXTERNAL', url: link.url }) : null };
      const m = await save.mutateAsync(body);
      toast.success('Draft saved. Check it, send yourself a test, then press Start.');
      navigate(`/messages/${m.id}`, { replace: !!id });
    } catch (err) {
      setError(err?.message || 'The message could not be saved. Try again.');
    }
  };

  const segs = segments.data ?? [];
  const grps = groups.data ?? [];
  return (
    <main className="crm-page ms-page">
      <Link to={id ? `/messages/${id}` : '/messages'} className="cp-back"><ArrowLeft size={14} /> {id ? 'Back to the message' : 'All messages'}</Link>
      <div className="crm-head"><div><h1>{id ? 'Change the draft' : 'New message'}</h1><p>Only customers who agreed to offers get it. STOP ends them all.</p></div></div>
      <div className="ms-edit">
        <form className="crm-card ms-form" onSubmit={submit} data-testid="message-editor">
          <label className="pe-field"><span>Name (only the shop sees it)</span>
            <input className="ms-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali silk week" maxLength={80} />
          </label>
          <div className="pe-field"><span id="ms-who-label">Who gets it</span>
            <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Who gets it">
              <option value="" disabled>Choose who gets it</option>
              <option value="everyone">Everyone who agreed</option>
              {segs.map(s => <option key={s.id} value={`seg:${s.id}`}>{`Saved list: ${s.name}`}</option>)}
              {grps.map(g => <option key={g.key} value={`grp:${g.name}`}>{`Customer group: ${g.name}`}</option>)}
            </Select>
          </div>
          <Who audience={audience} />
          <label className="pe-field"><span>Message</span>
            <textarea className="ms-area" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hi {name}, our Diwali silk week starts Friday." aria-label="Message" />
          </label>
          <p className="pe-hint">{'{name}'} becomes each customer's first name, {'{shop}'} your shop's name. The line "Reply STOP to stop these messages" is added at the end, always.</p>
          <div className="ms-att">
            {media ? <button type="button" className="btn-secondary ms-small" onClick={() => setMedia(null)}><X size={14} /> Remove the picture</button>
              : <button type="button" className="btn-secondary ms-small" onClick={() => setPicking(true)}><ImagePlus size={14} /> Add a picture</button>}
            {link ? <button type="button" className="btn-secondary ms-small" onClick={removeLink}><X size={14} /> Remove the link</button>
              : overview.data?.linksAvailable !== false && <button type="button" className="btn-secondary ms-small" onClick={() => addLink('EXTERNAL')}><Link2 size={14} /> Add a link</button>}
          </div>
          {link && (
            <div className="ms-linkbox" data-testid="link-box">
              <div className="ms-choice" role="radiogroup" aria-label="Where the link goes">
                <button type="button" role="radio" aria-checked={link.type === 'EXTERNAL'} className={`pe-opt${link.type === 'EXTERNAL' ? ' on' : ''}`} onClick={() => setLink({ ...link, type: 'EXTERNAL' })}>A web page<small>The piece on your website</small></button>
                <button type="button" role="radio" aria-checked={link.type === 'WHATSAPP'} className={`pe-opt${link.type === 'WHATSAPP' ? ' on' : ''}`} onClick={() => setLink({ ...link, type: 'WHATSAPP' })}>A chat with the shop<small>"Hi, I saw your offer…" already typed</small></button>
              </div>
              {link.type === 'EXTERNAL' && <input className="ms-input" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://" aria-label="The page's address" inputMode="url" />}
              <p className="pe-hint">Everyone gets their own link, so a tap shows on their page.</p>
            </div>
          )}
          {willGet > 0 && <p className="pe-hint">{n(willGet)} {willGet === 1 ? 'message' : 'messages'} at up to {perDay} a day: {days === 1 ? 'about a day' : `about ${days} days`}, 10 am to 8 pm.</p>}
          {error && <p className="pe-err" role="alert">{error}</p>}
          <div className="pe-btns">
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 size={14} className="animate-spin" />} Save draft</button>
            <Link to={id ? `/messages/${id}` : '/messages'} className="btn-secondary">Cancel</Link>
          </div>
        </form>
        <div className="ms-side">
          <MessageBubble text={text || 'Hi {name}, …'} media={media} link={!!link} shop={overview.data?.shopName} />
          <p className="pe-hint">What a customer called Meena sees.</p>
        </div>
      </div>
      {picking && <PicturePicker onClose={() => setPicking(false)} onPick={(p) => { setMedia(p); setPicking(false); }} />}
    </main>
  );
}
