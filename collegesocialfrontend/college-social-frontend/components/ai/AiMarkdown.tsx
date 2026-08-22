'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tiny dependency-free renderer for the assistant's replies: fenced code blocks (with copy),
 * headings, bullet/numbered lists, and inline **bold** / *italic* / `code` / [label](url).
 * Not a full CommonMark parser -- just enough structure for lecture/assignment answers.
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
    <div dir="ltr" className="my-2 overflow-hidden rounded-xl border border-border bg-background/60 text-left">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-[13px] leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
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
    } else if (token.startsWith('[')) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (m) {
        nodes.push(
          <a
            key={key}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-2"
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

function PlainBlock({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  function flushList(key: string) {
    if (!list) return;
    const items = list.items;
    const ordered = list.ordered;
    elements.push(
      ordered ? (
        <ol key={key} className="my-1.5 ms-5 list-decimal space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="my-1.5 ms-5 list-disc space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  }

  lines.forEach((line, idx) => {
    const key = `${keyPrefix}-${idx}`;
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const numbered = /^\d+\.\s+(.*)/.exec(line);

    if (heading) {
      flushList(`${key}-l`);
      const level = heading[1].length;
      elements.push(
        <p
          key={key}
          className={cn(
            'mb-1 mt-2 text-foreground first:mt-0',
            level === 1 ? 'text-base font-bold' : level === 2 ? 'text-[15px] font-bold' : 'text-sm font-bold',
          )}
        >
          {renderInline(heading[2], key)}
        </p>,
      );
    } else if (bullet) {
      if (!list || list.ordered) {
        flushList(`${key}-l`);
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || !list.ordered) {
        flushList(`${key}-l`);
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
    } else if (line.trim() === '') {
      flushList(`${key}-l`);
    } else {
      flushList(`${key}-l`);
      elements.push(
        <p key={key} className="my-0.5">
          {renderInline(line, key)}
        </p>,
      );
    }
  });
  flushList(`${keyPrefix}-l-end`);

  return <>{elements}</>;
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

  return <>{blocks}</>;
}
