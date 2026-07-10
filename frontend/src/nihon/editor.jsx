// editor.jsx — TipTap rich-text editor for the composer (ported from the
// reference writing system, adapted to plain JSX + the nihon palette). Body is
// stored as sanitized HTML. Custom nodes: resizable/float images + YouTube.
// Exposes window.NihonEditor (the editor React component).
import React from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Youtube } from "@tiptap/extension-youtube";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

/* ---------------- Resizable + float-aligned image node ---------------- */
function figStyle(width, align) {
  const p = ["max-width:100%", width ? `width:${width}` : "width:fit-content"];
  if (align === "left") p.push("float:left", "margin:6px 26px 14px 0");
  else if (align === "right") p.push("float:right", "margin:6px 0 14px 26px");
  else p.push("display:block", "margin:14px auto");
  return p.join(";");
}

function ImageNodeView({ node, updateAttributes, selected, deleteNode }) {
  const { src, alt } = node.attrs;
  const width = node.attrs.width;
  const align = node.attrs.align || "center";
  const wrapRef = React.useRef(null);

  const startResize = (e) => {
    e.preventDefault();
    const img = wrapRef.current?.querySelector("img");
    if (!img) return;
    const startX = e.clientX;
    const startW = img.offsetWidth;
    const maxW = wrapRef.current?.parentElement?.offsetWidth ?? 820;
    const onMove = (ev) => {
      const w = Math.min(maxW, Math.max(80, startW + (ev.clientX - startX)));
      updateAttributes({ width: `${Math.round(w)}px` });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const wrapStyle =
    align === "left" ? { float: "left", margin: "6px 26px 14px 0" }
    : align === "right" ? { float: "right", margin: "6px 0 14px 26px" }
    : { display: "block", margin: "14px auto" };

  return (
    <NodeViewWrapper as="figure" ref={wrapRef}
      className={`ri-wrap${selected ? " ri-selected" : ""}`}
      style={{ width: width ?? "fit-content", maxWidth: "100%", position: "relative", ...wrapStyle }}>
      <img src={src} alt={alt ?? ""} style={{ width: "100%", display: "block", borderRadius: 10 }}
        draggable={false} data-drag-handle="" />
      {selected && (
        <>
          <div className="ri-bar" contentEditable={false}>
            {["left", "center", "right"].map((a) => (
              <button key={a} type="button" className={align === a ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); updateAttributes({ align: a }); }}>
                {a === "left" ? "⬱" : a === "center" ? "☰" : "⬲"}
              </button>
            ))}
            <span className="ri-bar-div" />
            <button type="button" className="ri-del-btn" title="Delete image"
              onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}>✕</button>
          </div>
          <span className="ri-handle" onMouseDown={startResize} contentEditable={false} />
        </>
      )}
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.style.width || el.getAttribute("width") || null,
        renderHTML: () => ({}),
      },
      align: {
        default: "center",
        parseHTML: (el) => {
          const f = el.style.float;
          return f === "left" || f === "right" ? f : "center";
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-ri]",
        getAttrs: (el) => {
          const img = el.querySelector("img");
          return img ? { src: img.getAttribute("src"), alt: img.getAttribute("alt") } : false;
        },
      },
      { tag: "img[src]" },
    ];
  },
  renderHTML({ node }) {
    const { src, alt } = node.attrs;
    const width = node.attrs.width;
    const align = node.attrs.align || "center";
    const img = ["img", { src, alt: alt || "", style: "width:100%;display:block;border-radius:10px" }];
    return ["figure", { "data-ri": "", style: figStyle(width, align) }, img];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

/* ---------------- YouTube node with a delete button ---------------- */
function toEmbed(url) {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : url;
}
// Memoized so an unchanged video node doesn't re-render (and reload its iframe)
// as the document scrolls or selection moves. Like the reference, the iframe is
// left in normal flow — no GPU layer promotion, which is what caused the shake.
const YoutubeView = React.memo(function YoutubeView({ node, deleteNode }) {
  return (
    <NodeViewWrapper as="div" className="ri-wrap ri-video" style={{ position: "relative", margin: "16px 0" }} data-drag-handle="">
      <div style={{ aspectRatio: "16 / 9", width: "100%" }}>
        <iframe src={toEmbed(node.attrs.src)} title="YouTube video"
          style={{ width: "100%", height: "100%", border: 0, borderRadius: 10 }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
      <button type="button" className="ri-del-btn ri-del-float" title="Delete video"
        onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}>✕</button>
    </NodeViewWrapper>
  );
});
const YoutubeNode = Youtube.extend({
  addNodeView() {
    return ReactNodeViewRenderer(YoutubeView);
  },
});

/* ---------------- Table: Enter in the last cell appends a row ---------------- */
// (Tab-at-end already does this via the stock extension.) Enter elsewhere in a
// table keeps its default behavior (new line inside the cell).
const TableWithEnter = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        if (!this.editor.isActive("table")) return false;
        const $from = this.editor.state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name !== "tableRow") continue;
          const table = $from.node(d - 1);
          const lastRow = $from.index(d - 1) === table.childCount - 1;
          const lastCell = $from.index(d) === $from.node(d).childCount - 1;
          if (lastRow && lastCell) return this.editor.chain().addRowAfter().goToNextCell().run();
          return false;
        }
        return false;
      },
    };
  },
});

/* ---------------- The editor component ---------------- */
/** Blank paragraphs (Enter-only lines) survive save — the reader renders them
 * slim exactly like the editor, so spacing is WYSIWYG. Only runs of 4+ blanks
 * collapse to 3, so an accidental Enter-storm can't leave a giant void. */
function capBlankParas(html) {
  return html.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*){4,}/gi, "<p></p><p></p><p></p>");
}

/** Shape choices for a body image crop — the closest to the photo's natural
 * shape is pre-selected in the modal. */
const INLINE_ASPECTS = [
  { label: "Landscape", aspect: 16 / 9 },
  { label: "Portrait", aspect: 3 / 4 },
  { label: "Square", aspect: 1 },
];

// Imperative handle: parent gets { getHTML, setHTML, focus, chain } via onReady.
function NihonEditor({ p, onChange, onReady, placeholder, density, densityLabel, onCycleDensity }) {
  const [linkBox, setLinkBox] = React.useState(null); // 'link'|'image'|'youtube'
  const [linkVal, setLinkVal] = React.useState("");
  const [insertMenu, setInsertMenu] = React.useState(false);
  // Table size picker (hover a mini 6×6 grid, click to insert).
  const [tablePick, setTablePick] = React.useState(false);
  const [tableRC, setTableRC] = React.useState({ r: 3, c: 3 });
  const openTablePick = () => { setTableRC({ r: 3, c: 3 }); setTablePick(true); };
  // Pending body-image crop (Upload path only — paste/drag insert directly).
  const [crop, setCrop] = React.useState(null); // { file, aspect, outW, presets }
  const imgFileRef = React.useRef(null);

  const insertImageFile = async (f) => {
    try {
      const url = await window.N101_CONTENT.uploadImage(f);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (e) { window.__nihon_toast?.("Image upload failed — try a smaller file"); }
  };

  // Read a picked image's natural aspect — used to pre-select the closest shape
  // chip (landscape / portrait / square) in the crop modal.
  const imageAspect = (f) =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const im = new window.Image(); // `Image` here is the TipTap extension import
      im.onload = () => { resolve({ aspect: im.naturalWidth / im.naturalHeight || 1, width: im.naturalWidth || 1200 }); URL.revokeObjectURL(url); };
      im.onerror = () => { resolve({ aspect: 1, width: 1200 }); URL.revokeObjectURL(url); };
      im.src = url;
    });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] }, link: { openOnClick: false } }),
      Highlight, // single-colour <mark> highlighter
      ResizableImage,
      YoutubeNode.configure({ width: 720, height: 405, nocookie: true }),
      TableWithEnter.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "ed-body" },
      transformPastedHTML: (html) => capBlankParas(html),
      handleDrop: (_v, event) => {
        const f = event.dataTransfer?.files?.[0];
        if (f && f.type.startsWith("image/")) { event.preventDefault(); insertImageFile(f); return true; }
        return false;
      },
      handlePaste: (_v, event) => {
        const f = event.clipboardData?.files?.[0];
        if (f && f.type.startsWith("image/")) { event.preventDefault(); insertImageFile(f); return true; }
        return false;
      },
      // "/" on an empty line opens the insert menu (Notion/Medium-style).
      handleKeyDown: (view, event) => {
        if (event.key !== "/") return false;
        const { $from, empty } = view.state.selection;
        if (empty && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
          event.preventDefault();
          setInsertMenu(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange?.(capBlankParas(editor.getHTML())),
  });

  // The active table's wrapper element — hosts a floating ✕ so a whole table can
  // be removed (images/videos already have one; a table is otherwise stuck).
  const [tableWrap, setTableWrap] = React.useState(null);
  const editorRef = React.useRef(editor);
  editorRef.current = editor;
  React.useEffect(() => {
    if (!editor) return;
    const sync = () => {
      if (!editor.isActive("table")) { setTableWrap(null); return; }
      const dom = editor.view.domAtPos(editor.state.selection.$from.pos).node;
      const el = dom instanceof HTMLElement ? dom : dom.parentElement;
      setTableWrap((el?.closest(".tableWrapper")) ?? null);
    };
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    return () => { editor.off("selectionUpdate", sync); editor.off("transaction", sync); };
  }, [editor]);

  React.useEffect(() => {
    if (editor && onReady) {
      onReady({
        getHTML: () => capBlankParas(editor.getHTML()),
        setHTML: (html) => editor.commands.setContent(html || ""),
        getText: () => editor.getText(),
        focus: () => editor.commands.focus(),
        editor,
      });
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBox = (mode) => { setLinkVal(""); setLinkBox(mode); };
  // Upload path opens the crop modal (Landscape/Portrait/Square chips, closest
  // to the photo's own shape pre-selected). Paste/drag still insert directly.
  const onImgFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return; setLinkBox(null);
    const { aspect, width } = await imageAspect(f);
    const closest = INLINE_ASPECTS.reduce((best, pr) =>
      Math.abs(Math.log(aspect / pr.aspect)) < Math.abs(Math.log(aspect / best.aspect)) ? pr : best);
    setCrop({ file: f, aspect: closest.aspect, outW: Math.min(1200, width), presets: INLINE_ASPECTS });
  };
  // Crop modal returned a blob → upload + insert at the caret.
  const onCropDone = async (blob) => {
    setCrop(null);
    await insertImageFile(new File([blob], "image.webp", { type: "image/webp" }));
  };
  const applyBox = () => {
    const url = linkVal.trim(); const mode = linkBox; setLinkBox(null);
    if (!url || !mode || !editor) return;
    if (mode === "image") { editor.chain().focus().setImage({ src: url }).run(); return; }
    if (mode === "youtube") { editor.commands.setYoutubeVideo({ src: url }); return; }
    const { from, to } = editor.state.selection;
    if (from === to) editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  // Block inserts surfaced via the ＋ button and the "/" slash menu.
  const inserts = [
    ["🖼", "Image", () => openBox("image")],
    ["▶", "YouTube video", () => openBox("youtube")],
    ["▦", "Table", () => openTablePick()],
    ["</>", "Code block", () => editor?.chain().focus().toggleCodeBlock().run()],
    ["―", "Divider", () => editor?.chain().focus().setHorizontalRule().run()],
    ["❝", "Quote", () => editor?.chain().focus().toggleBlockquote().run()],
    ["•", "Bullet list", () => editor?.chain().focus().toggleBulletList().run()],
  ];
  const runInsert = (fn) => { setInsertMenu(false); fn(); };

  const isActive = (n, a) => editor?.isActive(n, a) ?? false;
  const tb = (label, name, fn, on, italic) => (
    <button key={name} type="button" title={name} className={on ? "on" : ""}
      onMouseDown={(e) => e.preventDefault()} onClick={fn}
      style={{ fontStyle: italic ? "italic" : "normal", fontWeight: 800 }}>{label}</button>
  );

  return (
    <div className="nihon-editor">
      <EditorStyles p={p} density={density} />
      <div className="ed-toolbar">
        <button type="button" title="Undo" disabled={!editor?.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>↺</button>
        <button type="button" title="Redo" disabled={!editor?.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>↻</button>
        <span className="tdiv" />
        {tb("B", "Bold", () => editor?.chain().focus().toggleBold().run(), isActive("bold"))}
        {tb("I", "Italic", () => editor?.chain().focus().toggleItalic().run(), isActive("italic"), true)}
        {tb("🖍", "Highlight", () => editor?.chain().focus().toggleHighlight().run(), isActive("highlight"))}
        <span className="tdiv" />
        {tb("H1", "Heading 1", () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), isActive("heading", { level: 1 }))}
        {tb("H2", "Heading 2", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), isActive("heading", { level: 2 }))}
        {tb("❝", "Quote", () => editor?.chain().focus().toggleBlockquote().run(), isActive("blockquote"))}
        {tb("•", "Bullet list", () => editor?.chain().focus().toggleBulletList().run(), isActive("bulletList"))}
        {tb("</>", "Code block", () => editor?.chain().focus().toggleCodeBlock().run(), isActive("codeBlock"))}
        {tb("―", "Divider", () => editor?.chain().focus().setHorizontalRule().run(), false)}
        <span className="tdiv" />
        {tb("🔗", "Link", () => openBox("link"), isActive("link"))}
        {tb("🖼", "Image", () => openBox("image"), false)}
        {tb("▶", "YouTube", () => openBox("youtube"), false)}
        {tb("▦", "Table", () => openTablePick(), isActive("table"))}
        <span className="tdiv" />
        <button type="button" title="Insert block" aria-label="Insert block"
          onMouseDown={(e) => e.preventDefault()} onClick={() => setInsertMenu(true)} style={{ fontWeight: 800 }}>＋</button>
        {onCycleDensity && (
          <button type="button" title={`Line spacing: ${densityLabel} (click to change)`}
            onMouseDown={(e) => e.preventDefault()} onClick={onCycleDensity}
            style={{ marginLeft: "auto", whiteSpace: "nowrap", fontWeight: 600 }}>↕ {densityLabel}</button>
        )}
      </div>

      {insertMenu && typeof document !== "undefined" && createPortal(
        <div className="ed-insert-backdrop" onMouseDown={() => setInsertMenu(false)}>
          <div className="ed-insert" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ed-insert-h">INSERT</div>
            {inserts.map(([icon, name, fn]) => (
              <button key={name} type="button" onClick={() => runInsert(fn)}>
                <span className="ed-insert-ico">{icon}</span>{name}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {tablePick && typeof document !== "undefined" && createPortal(
        <div className="ed-insert-backdrop" onMouseDown={() => setTablePick(false)}>
          <div className="ed-insert" style={{ width: "auto" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="ed-insert-h" style={{ textAlign: "center" }}>TABLE — {tableRC.r} × {tableRC.c}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 22px)", gap: 4, justifyContent: "center", padding: "0 4px 6px" }}>
              {Array.from({ length: 36 }, (_, i) => {
                const r = Math.floor(i / 6) + 1, c = (i % 6) + 1;
                const on = r <= tableRC.r && c <= tableRC.c;
                return (
                  <div key={i}
                    onMouseEnter={() => setTableRC({ r, c })}
                    onClick={() => { setTablePick(false); editor?.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run(); }}
                    style={{ width: 22, height: 22, borderRadius: 5, cursor: "pointer",
                      border: `1px solid ${p.line}`, background: on ? p.stamp : p.bg }} />
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {tableWrap && createPortal(
        <button type="button" className="tbl-del" title="Delete table" aria-label="Delete table"
          onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().deleteTable().run(); }}>✕</button>,
        tableWrap
      )}

      {crop && (
        <NihonCropModal p={p} file={crop.file} aspect={crop.aspect} outW={crop.outW}
          presets={crop.presets} title="Crop image"
          onDone={onCropDone} onCancel={() => setCrop(null)} />
      )}

      {linkBox && (
        <div className="ed-linkbox">
          <input autoFocus value={linkVal}
            placeholder={linkBox === "image" ? "Paste image URL…" : linkBox === "youtube" ? "Paste YouTube URL…" : "Paste link URL…"}
            onChange={(e) => setLinkVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyBox(); } if (e.key === "Escape") setLinkBox(null); }} />
          {linkBox === "image" && (
            <>
              <input ref={imgFileRef} type="file" accept="image/*" hidden onChange={onImgFile} />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => imgFileRef.current?.click()}>Upload</button>
            </>
          )}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyBox}>Add</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLinkBox(null)}>Cancel</button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

/* ---------------- Shared pan/zoom crop modal ---------------- */
// A fixed frame; the image pans (drag) and zooms (slider) under it. Apply renders
// the framed region to a canvas at the output size and returns a WebP blob.
// Optional shape presets (chips) switch the frame's aspect before cropping.
// Used by the editor (body images) and the composer (21:9 cover).
function NihonCropModal({ p, file, aspect: initialAspect, outW, title, presets, onDone, onCancel }) {
  const [aspect, setAspect] = React.useState(initialAspect);
  const W = 340;
  const H = Math.round(W / aspect);
  const [img, setImg] = React.useState(null);
  const [zoom, setZoom] = React.useState(1);
  const [off, setOff] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef(null);
  // Switching shape re-frames from center — pan resets, zoom is kept.
  const pickAspect = (a) => { setAspect(a); setOff({ x: 0, y: 0 }); };

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new window.Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!img) return null;
  const base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const scale = base * zoom;
  const maxX = Math.max(0, (img.naturalWidth * scale - W) / 2);
  const maxY = Math.max(0, (img.naturalHeight * scale - H) / 2);
  const ox = Math.min(maxX, Math.max(-maxX, off.x));
  const oy = Math.min(maxY, Math.max(-maxY, off.y));
  const left = W / 2 + ox - (img.naturalWidth * scale) / 2;
  const top = H / 2 + oy - (img.naturalHeight * scale) / 2;

  const apply = () => {
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = Math.round(outW / aspect);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, -left / scale, -top / scale, W / scale, H / scale, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => b && onDone(b), "image/webp", 0.9);
  };

  const chip = (on) => ({
    appearance: "none", cursor: "pointer", height: 32, padding: "0 14px", borderRadius: 999,
    border: `1px solid ${on ? p.ink : p.line}`, background: on ? p.ink : p.surface,
    color: on ? p.surface : p.ink, fontFamily: "var(--fontBody)", fontSize: 13, fontWeight: 600,
  });
  const btn = {
    appearance: "none", cursor: "pointer", height: 38, padding: "0 18px", borderRadius: 10,
    border: `1px solid ${p.line}`, background: p.surface, color: p.ink,
    fontFamily: "var(--fontBody)", fontSize: 13.5, fontWeight: 600,
  };

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(20,15,12,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 20, padding: 24, width: W + 48, maxWidth: "92vw" }}>
        <div style={{ fontFamily: "var(--fontDisplay)", fontWeight: 600, fontSize: 20, color: p.ink, marginBottom: 14 }}>{title}</div>
        {presets && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
            {presets.map((pr) => (
              <button key={pr.label} type="button" style={chip(aspect === pr.aspect)} onClick={() => pickAspect(pr.aspect)}>
                {pr.label}
              </button>
            ))}
          </div>
        )}
        <div
          style={{ width: W, height: H, overflow: "hidden", borderRadius: 14, position: "relative", cursor: "grab", touchAction: "none", margin: "0 auto", background: p.bg }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox, oy }; }}
          onPointerMove={(e) => { if (!drag.current) return; setOff({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }); }}
          onPointerUp={() => { drag.current = null; }}
        >
          <img src={img.src} alt="" draggable={false}
            style={{ position: "absolute", left, top, width: img.naturalWidth * scale, height: img.naturalHeight * scale, maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
        </div>
        <input type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))} style={{ width: "100%", margin: "14px 0", accentColor: p.stamp }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" style={btn} onClick={onCancel}>Cancel</button>
          <button type="button" style={{ ...btn, background: p.ink, color: p.surface, border: "none" }} onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function EditorStyles({ p, density }) {
  // Density values MUST match both readers (p/[slug].astro .rd-body + screens.jsx
  // .art-html) — same line-height + same block gap → the editor is WYSIWYG.
  const d = density === "normal" ? "normal" : density === "relaxed" ? "relaxed" : "compact";
  const line = d === "compact" ? 1.65 : d === "normal" ? 1.75 : 1.9;
  const gap = d === "compact" ? 18 : d === "normal" ? 24 : 34;
  const css = `
  .nihon-editor .ed-toolbar { position:sticky; top:64px; z-index:20; display:flex; flex-wrap:wrap; align-items:center; gap:2px;
    padding:8px; margin-bottom:14px; border:1px solid ${p.line}; border-radius:12px; background:${p.surface};
    box-shadow:0 6px 20px -12px rgba(0,0,0,.35); }
  .nihon-editor .ed-toolbar button { appearance:none; border:none; background:transparent; color:${p.ink}; cursor:pointer;
    min-width:32px; height:32px; padding:0 8px; border-radius:8px; font-size:14px; }
  .nihon-editor .ed-toolbar button:hover { background:${p.bg}; }
  .nihon-editor .ed-toolbar button.on { background:${p.ink}; color:${p.surface}; }
  .nihon-editor .ed-toolbar button:disabled { opacity:.35; cursor:default; }
  .nihon-editor .tdiv { width:1px; height:20px; background:${p.line}; margin:0 4px; }
  .nihon-editor .ed-linkbox { display:flex; gap:8px; margin-bottom:12px; }
  .nihon-editor .ed-linkbox input[type=text],.nihon-editor .ed-linkbox input:not([type]) { flex:1; height:36px; padding:0 12px;
    border:1px solid ${p.line}; border-radius:9px; background:${p.bg}; color:${p.ink}; outline:none; font-family:var(--fontBody); }
  .nihon-editor .ed-linkbox button { height:36px; padding:0 14px; border:1px solid ${p.line}; border-radius:9px;
    background:${p.surface}; color:${p.ink}; cursor:pointer; font-weight:600; }
  .nihon-editor .ed-body { min-height:340px; outline:none; font-family:var(--fontDisplay); font-size:20px; line-height:${line}; color:${p.ink}; }
  .nihon-editor .ed-body:focus { outline:none; }
  .nihon-editor .ed-body h1 { font-size:34px; font-weight:600; margin:32px 0 12px; letter-spacing:-0.02em; }
  .nihon-editor .ed-body h2 { font-size:26px; font-weight:600; margin:28px 0 10px; }
  .nihon-editor .ed-body p { margin:0; }
  /* Density gap between ALL blocks (headings keep their own rhythm) — same rule
   * shape as both readers, so the toggle is WYSIWYG. */
  .nihon-editor .ed-body > * + *:not(h1):not(h2) { margin-top:${gap}px; }
  /* Blank lines collapse to a slim break while writing (ProseMirror marks a truly
   * empty paragraph with a trailing-break <br>; a Shift+Enter <br> inside a text
   * paragraph must NOT squash — text nodes don't count for :only-child). */
  .nihon-editor .ed-body p:has(> br.ProseMirror-trailingBreak:only-child) { line-height:1.15; }
  .nihon-editor .ed-body mark { background:color-mix(in oklab, ${p.stamp} 32%, transparent); color:inherit; padding:.05em .1em; border-radius:3px; }
  .nihon-editor .ed-body blockquote { border-left:3px solid ${p.stamp}; padding-left:24px; color:${p.inkSoft}; font-style:italic; margin:0; }
  .nihon-editor .ed-body pre { background:${p.ink}; color:${p.surface}; padding:14px 16px; border-radius:10px; overflow:auto; font-family:var(--fontMono); font-size:14px; margin:0; }
  .nihon-editor .ed-body ul { padding-left:28px; margin:0; list-style:disc outside; }
  .nihon-editor .ed-body ol { padding-left:28px; margin:0; list-style:decimal outside; }
  .nihon-editor .ed-body li { margin:6px 0; }
  .nihon-editor .ed-body li > p { margin:0; }
  .nihon-editor .ed-body li::marker { color:${p.stamp}; }
  .nihon-editor .ed-body hr { border:none; border-top:1px solid ${p.line}; margin:0; }
  .nihon-editor .ed-body table { border-collapse:collapse; width:100%; margin:0; table-layout:fixed; }
  .nihon-editor .ed-body td,.nihon-editor .ed-body th { border:1px solid ${p.line}; padding:8px 10px; }
  .nihon-editor .ed-body th { background:${p.bg}; font-weight:700; }
  /* Structural blocks clear a floated image → they render full-width BELOW it
   * instead of squeezed into the narrow column beside it. Only running paragraphs
   * wrap around images (magazine style). Same rule in both readers. */
  .nihon-editor .ed-body blockquote, .nihon-editor .ed-body ul, .nihon-editor .ed-body ol,
  .nihon-editor .ed-body pre, .nihon-editor .ed-body table, .nihon-editor .ed-body .tableWrapper,
  .nihon-editor .ed-body h1, .nihon-editor .ed-body h2, .nihon-editor .ed-body hr,
  .nihon-editor .ed-body [data-youtube-video], .nihon-editor .ed-body .ri-video { clear:both; }
  /* Floating ✕ on the active table — portaled into .tableWrapper by the editor. */
  .nihon-editor .ed-body .tableWrapper { position:relative; }
  .nihon-editor .tbl-del { position:absolute; top:4px; right:4px; z-index:5; width:28px; height:28px;
    appearance:none; cursor:pointer; background:${p.surface}; color:#c0392b; border:1px solid ${p.line};
    border-radius:7px; box-shadow:0 4px 14px -6px rgba(0,0,0,.35); }
  .nihon-editor .ed-body .selectedCell { background:color-mix(in oklab, ${p.stamp} 18%, transparent); }
  .nihon-editor .ed-body .column-resize-handle { background:${p.stamp}; width:3px; position:absolute; right:-1px; top:0; bottom:0; pointer-events:none; }
  .nihon-editor .ri-wrap.ri-selected { outline:2px solid ${p.stamp}; outline-offset:2px; border-radius:10px; }
  .nihon-editor .ri-handle { position:absolute; right:-5px; top:50%; width:12px; height:40px; transform:translateY(-50%);
    background:${p.stamp}; border-radius:6px; cursor:ew-resize; }
  .nihon-editor .ri-bar { position:absolute; top:-40px; left:50%; transform:translateX(-50%); display:flex; gap:4px; align-items:center;
    background:${p.ink}; padding:5px 7px; border-radius:9px; }
  .nihon-editor .ri-bar button { appearance:none; border:none; background:transparent; color:${p.surface}; cursor:pointer; padding:2px 6px; border-radius:6px; }
  .nihon-editor .ri-bar button.on { background:${p.stamp}; }
  .nihon-editor .ri-bar-div { width:1px; height:16px; background:rgba(255,255,255,.3); }
  .nihon-editor .ri-del-btn { color:${p.surface}; }
  .nihon-editor .ri-del-float { position:absolute; top:8px; right:8px; background:${p.ink}; border:none; border-radius:7px; width:28px; height:28px; cursor:pointer; }
  .nihon-editor .ed-body::after { content:""; display:table; clear:both; }
  .ed-insert-backdrop { position:fixed; inset:0; z-index:120; display:flex; align-items:flex-start; justify-content:center;
    padding-top:18vh; background:rgba(0,0,0,.32); }
  .ed-insert { width:280px; max-width:88vw; background:${p.surface}; border:1px solid ${p.line}; border-radius:14px;
    box-shadow:0 24px 60px -20px rgba(0,0,0,.5); padding:8px; }
  .ed-insert-h { font-family:var(--fontMono); font-size:11px; letter-spacing:.1em; color:${p.inkFaint}; padding:4px 8px 8px; }
  .ed-insert button { display:flex; align-items:center; gap:12px; width:100%; appearance:none; border:none; background:transparent;
    color:${p.ink}; cursor:pointer; padding:9px 10px; border-radius:9px; font-family:var(--fontBody); font-size:14.5px; text-align:left; }
  .ed-insert button:hover { background:${p.bg}; }
  .ed-insert-ico { display:inline-flex; align-items:center; justify-content:center; width:24px; font-size:15px; }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

if (typeof window !== "undefined") {
  window.NihonEditor = NihonEditor;
  window.NihonCropModal = NihonCropModal;
}
export default NihonEditor;
export { NihonCropModal };
