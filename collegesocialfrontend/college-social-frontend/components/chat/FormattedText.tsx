'use client';

import { memo, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { TaggedText } from '@/components/shared/TaggedText';
import { hasFormatting, parseChatFormatting, type InlineNode } from '@/lib/chat-format';
import { cn } from '@/lib/utils';

interface FormattedTextProps {
  text: string;
  /** Search term to mark inside plain-text runs. */
  highlight?: string;
  /** On an accent-coloured (own) bubble: links/code switch to light-on-accent styling. */
  inverted?: boolean;
}

function Inline({ nodes, highlight, inverted }: { nodes: InlineNode[]; highlight?: string; inverted?: boolean }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <TaggedText key={i} text={node.text} highlight={highlight} tone={inverted ? 'inverted' : 'default'} />;
          case 'code':
            return (
              <code
                key={i}
                dir="ltr"
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[0.88em]',
                  inverted ? 'bg-black/20 text-white' : 'bg-foreground/[0.07] text-foreground',
                )}
              >
                {node.text}
              </code>
            );
          case 'bold':
            return (
              <strong key={i} className="font-bold">
                <Inline nodes={node.children} highlight={highlight} inverted={inverted} />
              </strong>
            );
          case 'italic':
            return (
              <em key={i} className="italic">
                <Inline nodes={node.children} highlight={highlight} inverted={inverted} />
              </em>
            );
          case 'strike':
            return (
              <s key={i} className="opacity-80">
                <Inline nodes={node.children} highlight={highlight} inverted={inverted} />
              </s>
            );
        }
      })}
    </>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div dir="ltr" className="group/code relative my-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#0f1220] text-start shadow-inner">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">{lang || 'code'}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="نسخ الكود"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-[12.5px] leading-relaxed text-zinc-100 scrollbar-thin">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

// Renders a chat message's text with WhatsApp-style formatting (see lib/chat-format.ts) on top of
// TaggedText's mentions / hashtags / links. Plain messages take a fast path with no parsing.
export const FormattedText = memo(function FormattedText({ text, highlight, inverted }: FormattedTextProps) {
  const blocks = useMemo(() => (hasFormatting(text) ? parseChatFormatting(text) : null), [text]);

  if (!blocks) {
    return <TaggedText text={text} highlight={highlight} tone={inverted ? 'inverted' : 'default'} />;
  }

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'codeblock') return <CodeBlock key={i} code={block.text} lang={block.lang} />;
        if (block.type === 'quote') {
          return (
            <span
              key={i}
              className={cn(
                'my-1 block border-s-[3px] ps-2.5 text-[0.95em]',
                inverted ? 'border-white/60 text-white/90' : 'border-accent/60 text-foreground/80',
              )}
            >
              <Inline nodes={block.children} highlight={highlight} inverted={inverted} />
            </span>
          );
        }
        return (
          <span key={i} className="block">
            <Inline nodes={block.children} highlight={highlight} inverted={inverted} />
          </span>
        );
      })}
    </>
  );
});
