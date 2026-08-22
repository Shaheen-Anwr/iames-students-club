function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-gold/30 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
