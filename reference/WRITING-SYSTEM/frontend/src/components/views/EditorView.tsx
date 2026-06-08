/* NOT BAGEL — Editor view (compose / edit a post). Rich text via TipTap;
 * body persists to the API as HTML. */
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { ResizableImage } from '../../lib/ResizableImage';
import { YoutubeNode } from '../../lib/YoutubeNode';
import { Icon } from '../ui';
import { I } from '../../lib/icons';
import { nav, emitToast } from '../../lib/store';
import { useAuth } from '../../lib/authStore';
import { categoryApi, postApi, type ApiCategory } from '../../lib/content';
import { uploadImage } from '../../lib/api';

/** Drop blank paragraphs (Enter-only lines) so saved posts read clean — no
 * stacked empty <p> holes in the published article. */
function stripEmptyParas(html: string): string {
  return html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
}

/** First ~160 chars of the body text — used as the card excerpt. */
function excerptFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? flat.slice(0, 157) + '…' : flat;
}

export function EditorView() {
  const { user, ready } = useAuth();

  const [postId, setPostId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);

  const [cats, setCats] = useState<ApiCategory[]>([]);
  const [catQuery, setCatQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkBox, setLinkBox] = useState<null | 'link' | 'image' | 'youtube'>(null);
  const [linkVal, setLinkVal] = useState('');
  const [density, setDensity] = useState<'compact' | 'normal' | 'relaxed'>('compact');
  const [confirmDel, setConfirmDel] = useState(false);
  const [insertMenu, setInsertMenu] = useState(false);
  const [autoState, setAutoState] = useState<'' | 'saving' | 'saved'>('');
  const [savedStatus, setSavedStatus] = useState<'draft' | 'published'>('draft');
  const savingRef = useRef(false);

  const doDelete = async () => {
    if (!postId || busy) return;
    setBusy(true);
    try { await postApi.remove(postId); emitToast('Post deleted'); nav('profile', 'you'); }
    catch { setBusy(false); emitToast('Delete failed — try again'); }
  };

  // Upload a dropped/pasted/picked image to R2, then insert its URL (never base64
  // — data URLs blow past D1's row-size cap and the post won't save).
  const insertImageFile = async (f: File) => {
    try {
      const url = await uploadImage(f);
      editorRef.current?.chain().focus().setImage({ src: url }).run();
    } catch { emitToast('Image upload failed — try a smaller file'); }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] }, link: { openOnClick: false } }),
      ResizableImage,
      YoutubeNode.configure({ width: 720, height: 405, nocookie: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'ed-body art-body' },
      // Strip empty paragraphs from pasted content (they create huge gaps).
      transformPastedHTML: (html) => html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, ''),
      // Drag an image file straight into the body.
      handleDrop: (_view, event) => {
        const f = (event as DragEvent).dataTransfer?.files?.[0];
        if (f && f.type.startsWith('image/')) { event.preventDefault(); insertImageFile(f); return true; }
        return false;
      },
      // Paste an image from the clipboard.
      handlePaste: (_view, event) => {
        const f = (event as ClipboardEvent).clipboardData?.files?.[0];
        if (f && f.type.startsWith('image/')) { event.preventDefault(); insertImageFile(f); return true; }
        return false;
      },
      // "/" on an empty line opens the insert menu (Notion/Medium-style).
      handleKeyDown: (view, event) => {
        if (event.key !== '/') return false;
        const { $from, empty } = view.state.selection;
        if (empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
          event.preventDefault();
          setInsertMenu(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => setBodyHtml(editor.getHTML()),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Writing requires a session — bounce to /auth once we know there isn't one.
  useEffect(() => { if (ready && !user) nav('auth'); }, [ready, user]);

  // Categories are public — load them immediately.
  useEffect(() => {
    categoryApi.list().then(setCats).catch(() => emitToast('Could not load categories'));
  }, []);

  // Editing (/write?id=...) loads an owner-only draft, so wait until the session
  // is restored and the editor exists before fetching/applying content.
  useEffect(() => {
    if (!ready || !user || !editor || postId) return;
    const editId = new URLSearchParams(window.location.search).get('id');
    if (!editId) return;
    postApi.get(editId).then((p) => {
      setPostId(p.id);
      setTitle(p.title);
      setSubtitle(p.excerpt);
      setCat(p.categoryId);
      setBodyHtml(p.body);
      editor.commands.setContent(p.body || '');
      setDensity(p.density ?? 'compact');
      setSavedStatus(p.status);
      setTags(p.tags);
      setCover(p.cover);
    }).catch(() => emitToast('Could not load that post'));
  }, [ready, user, editor, postId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setCover(await uploadImage(f)); }
    catch { emitToast('Cover upload failed — try a smaller file'); }
  };
  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const bodyText = editor?.getText() ?? '';
  const words = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));
  const canPublish = !!(title.trim() && cat && bodyText.trim());

  // Category picker: filter by query; offer to create when nothing matches.
  const q = catQuery.trim().toLowerCase();
  const filtered = q ? cats.filter((c) => c.label.toLowerCase().includes(q)) : cats;
  const exact = cats.some((c) => c.label.toLowerCase() === q);

  const createCat = async () => {
    if (!catQuery.trim() || busy) return;
    setBusy(true);
    try {
      const c = await categoryApi.create(catQuery.trim());
      setCats((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      setCat(c.id);
      setCatQuery('');
    } catch {
      emitToast('Could not create category');
    } finally {
      setBusy(false);
    }
  };

  // Link/image insertion. The box is pinned to a constant viewport position via
  // CSS (.ed-linkbox) — it never tracks the moving toolbar or caret, so it always
  // appears in the same predictable, visible spot.
  const openBox = (mode: 'link' | 'image' | 'youtube') => {
    setLinkVal('');
    setLinkBox(mode);
  };
  // Insert an image picked from the local machine (read as a data URL).
  const onImgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLinkBox(null);
    await insertImageFile(f);
  };
  const applyBox = () => {
    const url = linkVal.trim();
    const mode = linkBox;
    setLinkBox(null);
    if (!url || !mode || !editor) return;
    if (mode === 'image') { editor.chain().focus().setImage({ src: url }).run(); return; }
    if (mode === 'youtube') { editor.commands.setYoutubeVideo({ src: url }); return; }
    const { from, to } = editor.state.selection;
    if (from === to) {
      // No text selected — insert the URL itself as the clickable link text.
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const save = async (status: 'draft' | 'published') => {
    if (busy) return;
    if (status === 'published' && !canPublish) return;
    if (!title.trim() || !cat) { emitToast('Add a title and pick a category first'); return; }
    setBusy(true);
    const payload = {
      title: title.trim(),
      categoryId: cat,
      excerpt: subtitle.trim() || excerptFrom(bodyText),
      cover,
      body: stripEmptyParas(bodyHtml),
      status,
      density,
      score: null,
      tags,
    };
    try {
      const post = postId ? await postApi.update(postId, payload) : await postApi.create(payload);
      setPostId(post.id);
      setSavedStatus(status);
      if (status === 'published') { emitToast('🎉 Published!'); nav('profile', 'you'); }
      else emitToast('Draft saved');
    } catch {
      emitToast('Save failed — try again');
    } finally {
      setBusy(false);
    }
  };

  // Autosave: 2s after the last edit, silently persist as a draft (create once,
  // then update). Preserves a post's published status so editing never unpublishes.
  useEffect(() => {
    if (!editor || !title.trim() || !cat) return;
    if (!postId && !bodyText.trim()) return; // don't spawn empty drafts
    const t = setTimeout(async () => {
      if (savingRef.current || busy) return;
      savingRef.current = true;
      setAutoState('saving');
      try {
        const payload = {
          title: title.trim(), categoryId: cat, excerpt: subtitle.trim() || excerptFrom(bodyText),
          cover, body: stripEmptyParas(bodyHtml), status: savedStatus, density, score: null, tags,
        };
        const post = postId ? await postApi.update(postId, payload) : await postApi.create(payload);
        setPostId(post.id);
        setAutoState('saved');
      } catch { setAutoState(''); }
      finally { savingRef.current = false; }
    }, 2000);
    return () => clearTimeout(t);
  }, [title, subtitle, cat, bodyHtml, cover, density, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ?? false;
  type Tool = (e?: React.MouseEvent<HTMLButtonElement>) => void;
  const tools: [string, string, Tool, boolean][] = [
    ['B', 'Bold', () => editor?.chain().focus().toggleBold().run(), isActive('bold')],
    ['I', 'Italic', () => editor?.chain().focus().toggleItalic().run(), isActive('italic')],
    ['H1', 'Heading 1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), isActive('heading', { level: 1 })],
    ['H2', 'Heading 2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), isActive('heading', { level: 2 })],
    ['❝', 'Quote', () => editor?.chain().focus().toggleBlockquote().run(), isActive('blockquote')],
    ['•', 'Bullet list', () => editor?.chain().focus().toggleBulletList().run(), isActive('bulletList')],
    ['</>', 'Code block', () => editor?.chain().focus().toggleCodeBlock().run(), isActive('codeBlock')],
    ['―', 'Divider', () => editor?.chain().focus().setHorizontalRule().run(), false],
    ['🔗', 'Link', () => openBox('link'), isActive('link')],
    ['🖼', 'Image', () => openBox('image'), false],
  ];

  // Block inserts surfaced via the ＋ button and the "/" slash menu.
  const inserts: [string, string, () => void][] = [
    ['🖼', 'Image', () => openBox('image')],
    ['▶', 'YouTube video', () => openBox('youtube')],
    ['▦', 'Table', () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()],
    ['</>', 'Code block', () => editor?.chain().focus().toggleCodeBlock().run()],
    ['―', 'Divider', () => editor?.chain().focus().setHorizontalRule().run()],
    ['❝', 'Quote', () => editor?.chain().focus().toggleBlockquote().run()],
    ['•', 'Bullet list', () => editor?.chain().focus().toggleBulletList().run()],
  ];
  const runInsert = (fn: () => void) => { setInsertMenu(false); fn(); };

  const densityLabel = density === 'compact' ? 'Compact' : density === 'normal' ? 'Normal' : 'Relaxed';
  const cycleDensity = () => setDensity((d) => (d === 'compact' ? 'normal' : d === 'normal' ? 'relaxed' : 'compact'));

  return (
    <div className="wrap fade-in">
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, marginBottom: 4 }}>
        <button className="btn btn-ghost" onClick={() => nav('home')}><Icon d={I.back} size={17} /> Discard</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            {words} words · {readMin} min{autoState === 'saving' ? ' · Saving…' : (autoState === 'saved' || postId) ? ' · Saved' : ''}
          </span>
          {postId && <button className="btn btn-danger" disabled={busy} onClick={() => setConfirmDel(true)}><Icon d={I.trash} size={15} /> Delete</button>}
          <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft')}>Save draft</button>
          <button className="btn btn-primary" disabled={!canPublish || busy}
            style={{ opacity: canPublish && !busy ? 1 : .5, cursor: canPublish && !busy ? 'pointer' : 'not-allowed' }}
            onClick={() => save('published')}>
            Publish
          </button>
        </div>
      </div>

      <div className="editor">
        <div className="ed-cover" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {cover ? <img src={cover} alt="cover" /> : (
            <div className="ph">
              <Icon d={I.plus} size={30} style={{ margin: '0 auto' }} />
              <div className="mono">DROP COVER ART — 21:9 RECOMMENDED</div>
            </div>
          )}
        </div>

        <input className="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your headline goes here…" />
        <textarea className="ed-sub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} rows={2}
          placeholder="Add a short summary — the line that sits under your headline…" />

        <div className="ed-field" style={{ margin: '6px 0 4px' }}>
          <input className="ed-input" style={{ maxWidth: 320, height: 36 }} value={catQuery}
            onChange={(e) => setCatQuery(e.target.value)} placeholder="Search a category, or type a new one…" />
          <div className="cat-picker" style={{ marginTop: 10 }}>
            {filtered.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
                <span className="dot" style={{ background: `var(${c.colorVar})` }}></span>{c.label}
              </button>
            ))}
            {catQuery.trim() && !exact && (
              <button className="chip" disabled={busy} onClick={createCat}>
                <Icon d={I.plus} size={13} /> Create “{catQuery.trim()}”
              </button>
            )}
          </div>
        </div>

        <div className="ed-toolbar">
          <button type="button" title="Undo" aria-label="Undo" disabled={!editor?.can().undo()}
            onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>↺</button>
          <button type="button" title="Redo" aria-label="Redo" disabled={!editor?.can().redo()}
            onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>↻</button>
          <div className="tdiv"></div>
          {tools.map(([label, name, fn, on], i) => (
            <Fragment key={label}>
              <button type="button" title={name} aria-label={name} className={on ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={fn}
                style={{ fontStyle: label === 'I' ? 'italic' : 'normal', fontWeight: 800 }}>{label}</button>
              {(i === 1 || i === 3 || i === 7) && <div className="tdiv"></div>}
            </Fragment>
          ))}
          <div className="tdiv"></div>
          <button type="button" title="Insert block" aria-label="Insert block"
            onMouseDown={(e) => e.preventDefault()} onClick={() => setInsertMenu(true)} style={{ fontWeight: 800 }}>＋</button>
          <button type="button" className="ed-density" title={`Line spacing: ${densityLabel} (click to change)`}
            onMouseDown={(e) => e.preventDefault()} onClick={cycleDensity} style={{ marginLeft: 'auto' }}>
            ↕ {densityLabel}
          </button>
        </div>

        {insertMenu && typeof document !== 'undefined' && createPortal(
          <div className="modal-backdrop" onMouseDown={() => setInsertMenu(false)}>
            <div className="ed-insert" onMouseDown={(e) => e.stopPropagation()}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 8px 8px' }}>INSERT</div>
              {inserts.map(([icon, name, fn]) => (
                <button key={name} type="button" onClick={() => runInsert(fn)}>
                  <span className="ed-insert-ico">{icon}</span>{name}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

        {linkBox && typeof document !== 'undefined' && createPortal(
          <div className="ed-linkbox">
            <input autoFocus className="ed-input" style={{ flex: 1 }} value={linkVal}
              placeholder={linkBox === 'image' ? 'Paste image URL…' : linkBox === 'youtube' ? 'Paste YouTube URL…' : 'Paste link URL…'}
              onChange={(e) => setLinkVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBox(); } if (e.key === 'Escape') setLinkBox(null); }} />
            {linkBox === 'image' && (
              <>
                <input ref={imgFileRef} type="file" accept="image/*" hidden onChange={onImgFile} />
                <button type="button" className="btn btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => imgFileRef.current?.click()}>Upload</button>
              </>
            )}
            <button type="button" className="btn btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={applyBox}>Add</button>
            <button type="button" className="btn btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => setLinkBox(null)}>Cancel</button>
          </div>,
          document.body
        )}

        <div className={`prose-gap-${density}`}>
          <EditorContent editor={editor} />
        </div>

        <div className="ed-field" style={{ marginTop: 24 }}>
          <label className="ed-label">Tags</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {tags.map((t) => (
              <span key={t} className="tag" style={{ gap: 6 }}>
                # {t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ display: 'inline-flex' }}><Icon d={I.x} size={13} /></button>
              </span>
            ))}
            <input className="ed-input" style={{ width: 200, height: 34 }} value={tagInput}
              onChange={(e) => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Add tag + Enter" />
          </div>
        </div>

        <div style={{ height: 60 }}></div>
      </div>

      {confirmDel && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirmDel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Delete this post?</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 14.5, lineHeight: 1.6, marginTop: 10 }}>
              You're about to permanently delete <b>“{title || 'this post'}”</b>. Every comment and like it received will be lost. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={busy} onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
