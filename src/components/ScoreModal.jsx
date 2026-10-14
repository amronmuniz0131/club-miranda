import { useEffect, useState } from 'react';
import Spinner from './Spinner';

export default function ScoreModal({ match, nameById, onClose, onSubmit }) {
  const [scores, setScores] = useState({ t1: '', t2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!match) return;
    setScores({
      t1: match.team1_score ?? '',
      t2: match.team2_score ?? '',
    });
    setError('');
  }, [match]);

  if (!match) return null;

  const set = (key) => (e) => setScores({ ...scores, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const s1 = parseInt(scores.t1, 10);
    const s2 = parseInt(scores.t2, 10);
    if (Number.isNaN(s1) || Number.isNaN(s2)) {
      setError('Both scores are required');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await onSubmit(match.id, s1, s2);
    setBusy(false);
    if (err) {
      setError(err.message || 'Failed to save scores');
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold">Enter score — Court {match.court_number}</h2>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-slate-200 p-4">
          <div className="text-center">
            <p className="text-sm font-semibold leading-tight">
              {nameById(match.team1_player1)}
              <br />
              {nameById(match.team1_player2)}
            </p>
            <input
              type="number"
              min="0"
              required
              value={scores.t1}
              onChange={set('t1')}
              className="mt-2 w-20 rounded-lg border border-slate-300 py-1.5 text-center text-xl font-bold focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
            />
          </div>
          <span className="text-lg font-bold text-slate-300">vs</span>
          <div className="text-center">
            <p className="text-sm font-semibold leading-tight">
              {nameById(match.team2_player1)}
              <br />
              {nameById(match.team2_player2)}
            </p>
            <input
              type="number"
              min="0"
              required
              value={scores.t2}
              onChange={set('t2')}
              className="mt-2 w-20 rounded-lg border border-slate-300 py-1.5 text-center text-xl font-bold focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-court-500 px-4 py-2 text-sm font-semibold text-white hover:bg-court-600 disabled:opacity-60"
          >
            {busy && <Spinner />} Save result
          </button>
        </div>
      </form>
    </div>
  );
}
