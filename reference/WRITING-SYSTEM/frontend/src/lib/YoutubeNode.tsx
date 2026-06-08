/* Youtube extension + a React node view that adds a delete button (the bare
 * embed is otherwise hard to remove — clicking it just plays the video).
 * Serialization stays the extension's default, so the reading view still gets a
 * plain <iframe>. */
import { Youtube } from '@tiptap/extension-youtube';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/** Watch / share / shorts URL → nocookie embed URL. */
function toEmbed(url: string): string {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : url;
}

function YoutubeView({ node, deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper as="div" className="ri-wrap ri-video" style={{ position: 'relative', margin: '16px 0' }} data-drag-handle="">
      <div style={{ aspectRatio: '16 / 9', width: '100%' }}>
        <iframe src={toEmbed(node.attrs.src)} title="YouTube video"
          style={{ width: '100%', height: '100%', border: 0, borderRadius: 10 }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
      <button type="button" className="ri-del-btn ri-del-float" title="Delete video"
        onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}>✕</button>
    </NodeViewWrapper>
  );
}

export const YoutubeNode = Youtube.extend({
  addNodeView() {
    return ReactNodeViewRenderer(YoutubeView);
  },
});
