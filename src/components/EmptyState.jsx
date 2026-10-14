export default function EmptyState({ icon = '🏓', title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white py-12 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}
