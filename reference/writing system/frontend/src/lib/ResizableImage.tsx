/* Resizable + float-aligned image node for TipTap, with an optional caption.
 * Drag the right-edge handle to resize; pick left / center / right to float text
 * around it. Serialized as a <figure data-ri> carrying width + float inline, so
 * the saved HTML renders identically in the reading view (just needs a clearfix).
 * Legacy posts that stored a bare <img> still parse. */
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef } from 'react';

type Align = 'left' | 'center' | 'right';

/** Inline style for the serialized <figure> — carries width + float everywhere. */
function figStyle(width: string | null, align: Align): string {
  const p: string[] = ['max-width:100%', width ? `width:${width}` : 'width:fit-content'];
  if (align === 'left') p.push('float:left', 'margin:6px 26px 14px 0');
  else if (align === 'right') p.push('float:right', 'margin:6px 0 14px 26px');
  else p.push('display:block', 'margin:14px auto');
  return p.join(';');
}

function ImageNodeView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const { src, alt } = node.attrs;
  const width = node.attrs.width as string | null;
  const align = (node.attrs.align as Align) || 'center';
  const caption = (node.attrs.caption as string) || '';
  const wrapRef = useRef<HTMLElement>(null);
  const capRef = useRef<HTMLElement>(null);

  // Seed the caption text once (uncontrolled, so the caret never jumps).
  useEffect(() => {
    if (capRef.current && capRef.current.textContent !== caption) capRef.current.textContent = caption;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const img = wrapRef.current?.querySelector('img');
    if (!img) return;
    const startX = e.clientX;
    const startW = img.offsetWidth;
    const maxW = wrapRef.current?.parentElement?.offsetWidth ?? 820;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(maxW, Math.max(80, startW + (ev.clientX - startX)));
      updateAttributes({ width: `${Math.round(w)}px` });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const wrapStyle: React.CSSProperties =
    align === 'left' ? { float: 'left', margin: '6px 26px 14px 0' }
    : align === 'right' ? { float: 'right', margin: '6px 0 14px 26px' }
    : { display: 'block', margin: '14px auto' };

  return (
    <NodeViewWrapper
      as="figure"
      ref={wrapRef as React.Ref<HTMLElement>}
      className={`ri-wrap${selected ? ' ri-selected' : ''}`}
      style={{ width: width ?? 'fit-content', maxWidth: '100%', position: 'relative', ...wrapStyle }}
    >
      <img src={src} alt={alt ?? ''} style={{ width: '100%', display: 'block', borderRadius: 10 }}
        draggable={false} data-drag-handle="" />
      {selected && (
        <>
          <div className="ri-bar" contentEditable={false}>
            {(['left', 'center', 'right'] as Align[]).map((a) => (
              <button key={a} type="button" className={align === a ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); updateAttributes({ align: a }); }}>
                {a === 'left' ? '⬱' : a === 'center' ? '☰' : '⬲'}
              </button>
            ))}
            <span className="ri-bar-div" />
            <button type="button" className="ri-del-btn" title="Delete image"
              onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}>✕</button>
          </div>
          <span className="ri-handle" onMouseDown={startResize} contentEditable={false} />
        </>
      )}
      <figcaption
        ref={capRef as React.Ref<HTMLElement>}
        className="ri-cap"
        data-empty={caption ? undefined : 'true'}
        data-placeholder="Add a caption…"
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => updateAttributes({ caption: e.currentTarget.textContent || '' })}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.width || el.getAttribute('width') || null,
        renderHTML: () => ({}),
      },
      align: {
        default: 'center',
        parseHTML: (el) => {
          const f = (el as HTMLElement).style.float;
          return f === 'left' || f === 'right' ? f : 'center';
        },
        renderHTML: () => ({}),
      },
      caption: {
        default: '',
        parseHTML: (el) => el.querySelector?.('figcaption')?.textContent || '',
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-ri]',
        getAttrs: (el) => {
          const img = (el as HTMLElement).querySelector('img');
          return img ? { src: img.getAttribute('src'), alt: img.getAttribute('alt') } : false;
        },
      },
      { tag: 'img[src]' },
    ];
  },
  renderHTML({ node }) {
    const { src, alt } = node.attrs;
    const width = node.attrs.width as string | null;
    const align = (node.attrs.align as Align) || 'center';
    const caption = (node.attrs.caption as string) || '';
    const img = ['img', { src, alt: alt || '', style: 'width:100%;display:block;border-radius:10px' }];
    const kids: unknown[] = caption ? [img, ['figcaption', { class: 'ri-cap' }, caption]] : [img];
    return ['figure', { 'data-ri': '', style: figStyle(width, align) }, ...kids] as never;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
