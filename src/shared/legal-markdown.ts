/**
 * A deliberately small Markdown reader for the legal documents. It understands only what they use and turns it into
 * plain data that React renders as elements, so no HTML string is ever injected (and none is needed under our CSP):
 *
 *   ## Section            → a section with an anchor id, listed in the table of contents
 *   ### Sub-heading
 *   Plain paragraphs, separated by a blank line
 *   - list items          (one level)
 *   > a note              → a highlighted note; `> **Needs legal review:** …` marks text a lawyer must check
 *   **bold**  [text](/path | https://… | mailto:…)  {{fact}} (from LEGAL_FACTS)
 *
 * Anything else is kept as literal text. Pure, so it is unit-tested.
 */

export type Inline =
  { t: 'text'; v: string } | { t: 'strong'; v: string } | { t: 'link'; v: string; href: string };

export type Block =
  | { t: 'h2'; id: string; text: string }
  | { t: 'h3'; id: string; text: string }
  | { t: 'p'; body: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'note'; review: boolean; body: Inline[] };

export interface LegalSection {
  id: string;
  title: string;
}

export interface ParsedDoc {
  /** Everything before the first `##` (the introduction), then each section in order. */
  blocks: Block[];
  sections: LegalSection[];
}

/** `Information We Collect` → `information-we-collect`. Repeated titles get `-2`, `-3`. */
export function slugify(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const SAFE_HREF = /^(\/(?!\/)|#|https:\/\/|mailto:)/;

/** Bold and links inside a line. An unsafe link target (javascript:, //evil, http:) is kept as plain text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'strong', v: m[1] });
    else if (SAFE_HREF.test(m[3]!)) out.push({ t: 'link', v: m[2]!, href: m[3]! });
    else out.push({ t: 'text', v: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

/** Replace `{{name}}` with the matching fact. An unknown name is a bug in the document, so it throws. */
export function fillFacts(src: string, facts: Record<string, string>): string {
  return src.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = facts[name];
    if (v === undefined) throw new Error(`Unknown legal fact {{${name}}}`);
    return v;
  });
}

export function parseLegal(src: string): ParsedDoc {
  const blocks: Block[] = [];
  const sections: LegalSection[] = [];
  const ids = new Set<string>();
  const lines = src.replace(/\r\n?/g, '\n').split('\n');

  let para: string[] = [];
  let list: string[] = [];
  let note: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', body: parseInline(para.join(' ')) });
    if (list.length) blocks.push({ t: 'ul', items: list.map(parseInline) });
    if (note.length) {
      const text = note.join(' ');
      blocks.push({ t: 'note', review: /^\*\*Needs legal review/i.test(text), body: parseInline(text) });
    }
    para = [];
    list = [];
    note = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{2,3})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      const text = h[2]!.trim();
      const id = slugify(text, ids);
      if (h[1] === '##') {
        blocks.push({ t: 'h2', id, text });
        sections.push({ id, title: text });
      } else blocks.push({ t: 'h3', id, text });
    } else if (/^\s*-\s+/.test(line)) {
      if (para.length || note.length) flush();
      list.push(line.replace(/^\s*-\s+/, ''));
    } else if (/^>\s?/.test(line)) {
      if (para.length || list.length) flush();
      note.push(line.replace(/^>\s?/, ''));
    } else if (line.trim() === '') {
      flush();
    } else if (list.length && /^\s+\S/.test(raw)) {
      // an indented continuation of the previous list item
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list.length || note.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return { blocks, sections };
}
