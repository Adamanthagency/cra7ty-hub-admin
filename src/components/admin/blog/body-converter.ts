/** Markdown ⇄ HTML for the blog body.
 *
 * The blog body is stored as markdown (the storefront preview and the
 * `/blog/[slug]` render path both read markdown), but the admin editor is a
 * Tiptap rich-text surface that speaks HTML. These two functions translate
 * exactly the seven toolbar constructs — bold, italic, H2, H3, blockquote,
 * link, divider — plus plain paragraphs, and nothing else. Everything is
 * escaped so a stray `<` in the copy can never inject markup.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown (bold, italic, link) → inline HTML. Input is already escaped. */
function inlineToHtml(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$2">$1</a>'
    );
}

/** Markdown source → HTML a Tiptap editor can load. */
export function markdownToHtml(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = escapeHtml(paragraph.join(' '));
    out.push(`<p>${inlineToHtml(joined)}</p>`);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
    } else if (line.startsWith('### ')) {
      flushParagraph();
      out.push(`<h3>${inlineToHtml(escapeHtml(line.slice(4)))}</h3>`);
    } else if (line.startsWith('## ')) {
      flushParagraph();
      out.push(`<h2>${inlineToHtml(escapeHtml(line.slice(3)))}</h2>`);
    } else if (line.startsWith('> ')) {
      flushParagraph();
      out.push(`<blockquote><p>${inlineToHtml(escapeHtml(line.slice(2)))}</p></blockquote>`);
    } else if (/^---+$/.test(line.trim())) {
      flushParagraph();
      out.push('<hr>');
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return out.join('');
}

/** Inline HTML → inline markdown. Input is the editor's innerHTML. */
function inlineToMarkdown(html: string): string {
  return html
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
}

/** Decode the few HTML entities escapeHtml produces, in reverse. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** Tiptap innerHTML → markdown source. */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';

  // Normalise to a block list by scanning top-level-ish block tags.
  const blocks: string[] = [];
  const blockPattern =
    /<(h2|h3|blockquote|p|hr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = blockPattern.exec(html)) !== null) {
    // Any text before this block that isn't just whitespace is a lost cause
    // in well-formed Tiptap output; ignore it.
    lastIndex = blockPattern.lastIndex;
    if (match[0].toLowerCase().startsWith('<hr')) {
      blocks.push('---');
      continue;
    }
    const tag = match[1]!.toLowerCase();
    const innerHtml = match[2] ?? '';
    // Strip nested block tags (e.g. <p> inside blockquote) down to their text.
    const flattened = innerHtml
      .replace(/<\/?p>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .trim();
    const text = decodeEntities(inlineToMarkdown(flattened)).trim();

    if (tag === 'h2') blocks.push(`## ${text}`);
    else if (tag === 'h3') blocks.push(`### ${text}`);
    else if (tag === 'blockquote') blocks.push(`> ${text}`);
    else if (tag === 'p') {
      if (text) blocks.push(text);
    }
  }

  // Fallback: if nothing matched (unexpected shape), return trimmed raw text.
  if (blocks.length === 0 && html.trim()) {
    return decodeEntities(inlineToMarkdown(html))
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  void lastIndex;
  return blocks.join('\n\n');
}
