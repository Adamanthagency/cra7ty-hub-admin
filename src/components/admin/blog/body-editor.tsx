'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  Quote,
  Link2,
  SeparatorHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { markdownToHtml, htmlToMarkdown } from './body-converter';

/**
 * Tiptap body editor for blog posts. The parent still holds markdown, so this
 * component loads markdown → HTML on mount and reports HTML → markdown on
 * every edit. The toolbar exposes exactly the seven constructs the storefront
 * preview renders: bold, italic, H2, H3, blockquote, link, divider.
 */

interface BodyEditorProps {
  /** markdown source */
  value: string;
  onChange: (markdown: string) => void;
}

interface Tool {
  label: string;
  icon: typeof Bold;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const TOOLS: Tool[] = [
  {
    label: 'Bold',
    icon: Bold,
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    icon: Italic,
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Heading 2',
    icon: Heading2,
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    icon: Heading3,
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Blockquote',
    icon: Quote,
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Link',
    icon: Link2,
    isActive: (e) => e.isActive('link'),
    run: (e) => setLink(e),
  },
  {
    label: 'Divider',
    icon: SeparatorHorizontal,
    isActive: () => false,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

function setLink(editor: Editor) {
  const previous = editor.getAttributes('link').href as string | undefined;
  const href = window.prompt('Link URL (https:// or /path):', previous ?? 'https://');
  if (href === null) return;
  if (href.trim() === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: href.trim() })
    .run();
}

export function BodyEditor({ value, onChange }: BodyEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit already includes bold, italic, H2/H3, blockquote and hr.
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: false }),
      Placeholder.configure({ placeholder: 'Write the post…' }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class:
          'min-h-[18rem] w-full px-4 py-4 text-sm leading-relaxed text-paper-70 outline-none [&_a]:text-vermilion [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-kraft [&_blockquote]:pl-3 [&_blockquote]:font-display [&_blockquote]:text-base [&_blockquote]:italic [&_blockquote]:text-kraft [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-paper [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-paper [&_hr]:my-4 [&_hr]:border-line [&_p]:my-2',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(htmlToMarkdown(current.isEmpty ? '' : current.getHTML()));
    },
  });

  // If the parent swaps the markdown underneath us (e.g. loading a different
  // post), reload the editor without fighting keystrokes: only when the
  // editor's own markdown round-trip differs from the incoming value.
  useEffect(() => {
    if (!editor) return;
    const current = htmlToMarkdown(editor.getHTML());
    if (current !== value) {
      editor.commands.setContent(markdownToHtml(value));
    }
  }, [editor, value]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-card border border-line bg-surface p-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={editor ? tool.isActive(editor) : false}
            disabled={!editor}
            onClick={() => editor && tool.run(editor)}
            className={cn(
              'rounded-[3px] p-2 text-paper-60 transition-colors hover:bg-paper-12 hover:text-paper disabled:opacity-40',
              editor && tool.isActive(editor) && 'bg-paper-12 text-paper'
            )}
          >
            <tool.icon size={15} />
          </button>
        ))}
      </div>

      <div className="rounded-b-card border border-t-0 border-line bg-surface">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
