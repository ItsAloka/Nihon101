// editor.jsx — TipTap rich-text editor for the composer (ported from the
// reference writing system, adapted to plain JSX + the nihon palette). Body is
// stored as sanitized HTML. Custom nodes: resizable/float images + YouTube.
// Exposes window.NihonEditor (the editor React component).
import React from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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

/* ---------------- The editor component ---------------- */
function stripEmptyParas(html) {
  return html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "");
}

// Imperative handle: parent gets { getHTML, setHTML, focus, chain } via onReady.
function NihonEditor({ p, onChange, onReady, placeholder, density, densityLabel, onCycleDensity }) {
  const [linkBox, setLinkBox] = React.useState(null); // 'link'|'image'|'youtube'
  const [linkVal, setLinkVal] = React.useState("");
  const imgFileRef = React.useRef(null);

  const insertImageFile = async (f) => {
    try {
      const url = await window.N101_CONTENT.uploadImage(f);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (e) { window.__nihon_toast?.("Image upload failed — try a smaller file"); }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] }, link: { openOnClick: false } }),
      ResizableImage,
      YoutubeNode.configure({ width: 720, height: 405, nocookie: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "ed-body" },
      transformPastedHTML: (html) => stripEmptyParas(html),
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
    },
    onUpdate: ({ editor }) => onChange?.(stripEmptyParas(editor.getHTML())),
  });

  React.useEffect(() => {
    if (editor && onReady) {
      onReady({
        getHTML: () => stripEmptyParas(editor.getHTML()),
        setHTML: (html) => editor.commands.setContent(html || ""),
        getText: () => editor.getText(),
        focus: () => editor.commands.focus(),
        editor,
      });
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBox = (mode) => { setLinkVal(""); setLinkBox(mode); };
  const onImgFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return; setLinkBox(null); await insertImageFile(f);
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
        {tb("▦", "Table", () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false)}
        {onCycleDensity && (
          <button type="button" title={`Line spacing: ${densityLabel} (click to change)`}
            onMouseDown={(e) => e.preventDefault()} onClick={onCycleDensity}
            style={{ marginLeft: "auto", whiteSpace: "nowrap", fontWeight: 600 }}>↕ {densityLabel}</button>
        )}
      </div>

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

function EditorStyles({ p, density }) {
  const d = density === "normal" ? "normal" : density === "relaxed" ? "relaxed" : "compact";
  const line = d === "compact" ? 1.6 : d === "normal" ? 1.7 : 1.85;
  const gap = d === "compact" ? 12 : d === "normal" ? 16 : 26;
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
  .nihon-editor .ed-body h1 { font-size:34px; font-weight:600; margin:18px 0 8px; letter-spacing:-0.02em; }
  .nihon-editor .ed-body h2 { font-size:26px; font-weight:600; margin:16px 0 6px; }
  .nihon-editor .ed-body p { margin:0 0 ${gap}px; }
  .nihon-editor .ed-body blockquote { border-left:3px solid ${p.stamp}; padding-left:16px; color:${p.inkSoft}; font-style:italic; margin:16px 0; }
  .nihon-editor .ed-body pre { background:${p.ink}; color:${p.surface}; padding:14px 16px; border-radius:10px; overflow:auto; font-family:var(--fontMono); font-size:14px; }
  .nihon-editor .ed-body ul { padding-left:28px; margin:0 0 16px; list-style:disc outside; }
  .nihon-editor .ed-body ol { padding-left:28px; margin:0 0 16px; list-style:decimal outside; }
  .nihon-editor .ed-body li { margin:4px 0; }
  .nihon-editor .ed-body li > p { margin:0; }
  .nihon-editor .ed-body li::marker { color:${p.stamp}; }
  .nihon-editor .ed-body hr { border:none; border-top:1px solid ${p.line}; margin:24px 0; }
  .nihon-editor .ed-body table { border-collapse:collapse; width:100%; margin:16px 0; }
  .nihon-editor .ed-body td,.nihon-editor .ed-body th { border:1px solid ${p.line}; padding:8px 10px; }
  .nihon-editor .ed-body th { background:${p.bg}; font-weight:700; }
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
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

if (typeof window !== "undefined") {
  window.NihonEditor = NihonEditor;
}
export default NihonEditor;
