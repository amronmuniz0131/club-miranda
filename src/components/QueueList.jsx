import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableRow({ player, index, nameById, onCourt }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: player.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const onCourtNow = onCourt?.has(player.player_id);
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 shadow-sm ${
        onCourtNow ? 'border-court-300 bg-court-50 opacity-60' : 'border-slate-200'
      }`}
    >
      <span className="w-6 text-center text-sm font-bold text-court-600">{index + 1}</span>
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${nameById(player.player_id)}`}
        className="cursor-grab touch-none rounded px-1 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
      >
        ⠿
      </button>
      <span className="truncate text-sm font-medium">{nameById(player.player_id)}</span>
      {onCourtNow && (
        <span className="whitespace-nowrap rounded-full bg-court-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          on court
        </span>
      )}
      <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
        {player.games_played}g · {player.wins}w
      </span>
    </li>
  );
}

export default function QueueList({ queue, nameById, onReorder, onCourt }) {
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((q) => q.id === active.id);
    const newIndex = queue.findIndex((q) => q.id === over.id);
    onReorder(arrayMove(queue, oldIndex, newIndex));
  };

  if (!queue.length) {
    return (
      <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
        Queue is empty — add players below.
      </p>
    );
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={queue.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {queue.map((p, i) => (
            <SortableRow
              key={p.id}
              player={p}
              index={i}
              nameById={nameById}
              onCourt={onCourt}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
