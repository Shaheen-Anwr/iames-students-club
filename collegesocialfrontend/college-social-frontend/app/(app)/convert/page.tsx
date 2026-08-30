import { FileConverter } from '@/components/convert/FileConverter';

export const metadata = { title: 'محوّل الملفات' };

export default function ConvertPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <FileConverter />
      </div>
    </div>
  );
}
