import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';

export default function ResultsPage() {
  const { sessionId } = useParams();
  const { profile } = useAuth();
  const [session, setSession] = useState(null);
  const [roster, setRoster] = useState([]);
  const [matches, setMatches] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [notFound, setNotFound] = useState(false);

  const nameById = useMemo(() => {
    const map = {};
    profiles.forEach((p) => {
      map[p.id] = p.role === 'guest' ? `${p.full_name} (guest)` : p.full_name || p.email;
    });
    return (id) => map[id] || 'Unknown';
  }, [profiles]);

  const load = async () => {
    try {
      const data = await apiGet(`/sessions/${sessionId}/full`);
      setSession(data.session);
      setRoster(data.queue);
      setMatches(data.matches);
      setProfiles(data.profiles);
    } catch (err) {
      if (err.message === 'Session not found') setNotFound(true);
    }
  };

  usePolling(load);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (notFound) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-slate-500">Session not found.</p>
        <Link to="/play" className="font-medium text-court-600 hover:underline">
          ← Back
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const standings = [...roster].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.games_played - a.games_played ||
      a.queue_position - b.queue_position
  );
  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at)
    );

  return (
    <div className="space-y-8">
      <div>
        <Link
          to={profile?.role === 'admin' ? '/admin' : '/play'}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{session.name} — Results</h1>
          <Badge status={session.status} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Standings</h2>
        {standings.length === 0 ? (
          <p className="text-sm text-slate-400">No players on this roster.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Player</th>
                  <th className="px-4 py-2.5 text-center">Games</th>
                  <th className="px-4 py-2.5 text-center">Wins</th>
                  <th className="px-4 py-2.5 text-center">Losses</th>
                  <th className="px-4 py-2.5 text-center">Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standings.map((p, i) => {
                  const losses = p.games_played - p.wins;
                  const pct = p.games_played ? Math.round((p.wins / p.games_played) * 100) : 0;
                  const me = p.player_id === profile?.id;
                  return (
                    <tr key={p.id} className={me ? 'bg-court-50' : ''}>
                      <td className="px-4 py-2.5 font-semibold">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {nameById(p.player_id)}
                        {me && <span className="ml-2 text-xs font-bold text-court-600">YOU</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">{p.games_played}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-court-600">
                        {p.wins}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-500">{losses}</td>
                      <td className="px-4 py-2.5 text-center">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Match history</h2>
        {completed.length === 0 ? (
          <p className="text-sm text-slate-400">No completed matches yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {completed.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="w-24 shrink-0 text-slate-400">
                  Rd {m.round_number} · Ct {m.court_number}
                </span>
                <span className={m.winner_team === 1 ? 'font-semibold' : 'text-slate-500'}>
                  {nameById(m.team1_player1)}/{nameById(m.team1_player2)}
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-bold">
                  {m.team1_score}–{m.team2_score}
                </span>
                <span className={m.winner_team === 2 ? 'font-semibold' : 'text-slate-500'}>
                  {nameById(m.team2_player1)}/{nameById(m.team2_player2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
