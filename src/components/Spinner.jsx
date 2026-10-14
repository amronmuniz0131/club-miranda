export default function Spinner({ size = 'md' }) {
  const cls = size === 'lg' ? 'h-10 w-10 border-4' : 'h-5 w-5 border-2';
  return (
    <div className={`inline-block animate-spin rounded-full border-slate-300 border-t-court-500 ${cls}`} />
  );
}
