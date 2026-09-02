'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dependency-free renderer for the assistant's replies. Covers the Markdown subset the model is
 * prompted to produce: headings (## - ####), bullet / numbered lists (with one level of nested
 * items), `>` blockquotes, `---` rules, `| pipe | tables |`, ``` fenced code (with copy), and
 * inline **bold** / *italic* / `code` / ~~strike~~ / [label](url). Not a full CommonMark parser --
 * just enough structure to make lecture / assignment answers read cleanly. Tolerates the partial,
 * half-written Markdown it receives mid-stream (an unclosed fence or table simply renders as text
 * until it completes).
 */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable -- silently ignore
    }
  }

  return (
    <div
      dir="ltr"
      className="my-3 max-w-full overflow-hidden rounded-xl border border-border bg-background/70 text-left first:mt-0 last:mb-0"
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-surface-2/50 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto px-3 py-2.5 text-[13px] leading-relaxed scrollbar-thin">
        <code className="[overflow-wrap:normal]">{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} dir="ltr" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('~~')) {
      nodes.push(
        <span key={key} className="line-through opacity-70">
          {token.slice(2, -2)}
        </span>,
      );
    } else if (token.startsWith('[')) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (m) {
        nodes.push(
          <a
            key={key}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-2"
          >
            {m[1]}
          </a>,
        );
      }
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type ListNode = { ordered: boolean; items: { text: string; sub?: ListNode }[] };

function List({ node, keyPrefix }: { node: ListNode; keyPrefix: string }) {
  const cls = cn(
    'my-2 space-y-1 ps-5 first:mt-0 last:mb-0 marker:text-muted-foreground',
    node.ordered ? 'list-decimal' : 'list-disc',
  );
  const items = node.items.map((it, idx) => (
    <li key={idx} className="ps-1 leading-7">
      {renderInline(it.text, `${keyPrefix}-${idx}`)}
      {it.sub && <List node={it.sub} keyPrefix={`${keyPrefix}-${idx}-s`} />}
    </li>
  ));
  return node.ordered ? <ol className={cls}>{items}</ol> : <ul className={cls}>{items}</ul>;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

function Table({ rows, keyPrefix }: { rows: string[][]; keyPrefix: string }) {
  const [head, ...body] = rows;
  return (
    <div className="my-3 max-w-full overflow-x-auto first:mt-0 last:mb-0 scrollbar-thin">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((c, i) => (
              <th key={i} className="px-2.5 py-1.5 text-start font-semibold text-foreground">
                {renderInline(c, `${keyPrefix}-h-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {body.map((r, ri) => (
            <tr key={ri}>
              {head.map((_, ci) => (
                <td key={ci} className="px-2.5 py-1.5 align-top text-muted-foreground">
                  {renderInline(r[ci] ?? '', `${keyPrefix}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const RULE_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const QUOTE_RE = /^>\s?/;
const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.+)$/;
const isTableSep = (s: string) => /^[\s|:-]+$/.test(s) && s.includes('--');

/** A run of text between fenced code blocks -- everything except ``` ``` fences. */
function PlainBlock({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const key = `${keyPrefix}-${k++}`;

    if (trimmed === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (RULE_RE.test(trimmed)) {
      out.push(<hr key={key} className="my-3 border-border first:mt-0 last:mb-0" />);
      i++;
      continue;
    }

    // Heading (## .. ####) -> h3/h4/h5 so it never collides with real page headings
    const h = HEADING_RE.exec(trimmed);
    if (h) {
      const n = h[1].length;
      const inner = renderInline(h[2], key);
      if (n <= 2) {
        out.push(
          <h3
            key={key}
            className="mb-1.5 mt-4 border-b border-border/60 pb-1 text-[15px] font-bold text-foreground first:mt-0"
          >
            {inner}
          </h3>,
        );
      } else if (n === 3) {
        out.push(
          <h4 key={key} className="mb-1 mt-3 text-sm font-bold text-foreground first:mt-0">
            {inner}
          </h4>,
        );
      } else {
        out.push(
          <h5
            key={key}
            className="mb-0.5 mt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0"
          >
            {inner}
          </h5>,
        );
      }
      i++;
      continue;
    }

    // Blockquote (consecutive `>` lines)
    if (QUOTE_RE.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(QUOTE_RE, ''));
        i++;
      }
      out.push(
        <blockquote
          key={key}
          className="my-2 border-s-2 border-accent/40 ps-3 text-muted-foreground first:mt-0 last:mb-0"
        >
          {renderInline(buf.join(' '), key)}
        </blockquote>,
      );
      continue;
    }

    // Pipe table: a `| a | b |` row immediately followed by a `| --- | --- |` separator
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1].trim())) {
      const rows: string[][] = [splitRow(trimmed)];
      i += 2; // header + separator
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(<Table key={key} rows={rows} keyPrefix={key} />);
      continue;
    }

    // List (bullet or numbered) with one level of nesting via leading indentation
    if (LIST_RE.test(raw)) {
      const first = LIST_RE.exec(raw)!;
      const top: ListNode = { ordered: /\d/.test(first[2]), items: [] };
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const m = LIST_RE.exec(lines[i])!;
        const indent = m[1].replace(/\t/g, '  ').length;
        const ordered = /\d/.test(m[2]);
        if (indent >= 2 && top.items.length) {
          const parent = top.items[top.items.length - 1];
          if (!parent.sub) parent.sub = { ordered, items: [] };
          parent.sub.items.push({ text: m[3] });
        } else {
          if (top.items.length && ordered !== top.ordered) break; // marker switched -> new list
          top.items.push({ text: m[3] });
        }
        i++;
      }
      out.push(<List key={key} node={top} keyPrefix={key} />);
      continue;
    }

    // Paragraph: gather consecutive plain lines into one block (soft newlines collapse to spaces)
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (
        t === '' ||
        RULE_RE.test(t) ||
        HEADING_RE.test(t) ||
        QUOTE_RE.test(t) ||
        LIST_RE.test(l) ||
        (t.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1].trim()))
      ) {
        break;
      }
      buf.push(t);
      i++;
    }
    out.push(
      <p key={key} className="my-2 leading-7 first:mt-0 last:mb-0">
        {renderInline(buf.join(' '), key)}
      </p>,
    );
  }

  return <>{out}</>;
}

export function AiMarkdown({ text }: { text: string }) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  const blocks: ReactNode[] = [];

  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (plain) blocks.push(<PlainBlock key={`p-${i}`} text={plain} keyPrefix={`p-${i}`} />);
    if (code !== undefined) blocks.push(<CodeBlock key={`c-${i}`} code={code.replace(/\n$/, '')} lang={lang} />);
  }

  return (
    <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {blocks}
    </div>
  );
}
