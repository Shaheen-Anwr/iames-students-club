import { ToolsGrid } from '@/components/convert/ToolsGrid';

export const metadata = { title: 'أدوات PDF' };

export default function ConvertToolsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <ToolsGrid />
      </div>
    </div>
  );
}
