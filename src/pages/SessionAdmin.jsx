import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '../lib/api';
import { usePolling } from '../hooks/usePolling';
import { PLAYER_LEVELS, LEVEL_BADGE_CLASS } from '../lib/constants';
import QueueList from '../components/QueueList';
import ScoreModal from '../components/ScoreModal';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

export default function SessionAdmin() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [queue, setQueue] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [addPlayerId, setAddPlayerId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [scoringMatch, setScoringMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameById = useMemo(() => {
    const map = {};
    allPlayers.forEach((p) => {
      map[p.id] = p.role === 'guest' ? `${p.full_name} (guest)` : p.full_name || p.email;
    });
    return (id) => map[id] || 'Unknown';
  }, [allPlayers]);

  const levelById = useMemo(() => {
    const map = {};
    allPlayers.forEach((p) => {
      map[p.id] = p.level || '';
    });
    return map;
  }, [allPlayers]);

  const activeMatches = matches.filter((m) => m.status !== 'completed');
  const onCourt = useMemo(() => {
    const set = new Set();
    activeMatches.forEach((m) => {
      [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2]
        .filter(Boolean)
        .forEach((pid) => set.add(pid));
    });
    return set;
  }, [activeMatches]);
  const bracketable = queue.filter((q) => !onCourt.has(q.player_id)).length;

  const loadAll = async () => {
    try {
      const data = await apiGet(`/sessions/${sessionId}/full`);
      setSession(data.session);
      setQueue(data.queue);
      setMatches(data.matches);
      setAllPlayers(data.profiles);
      const inSession = new Set(data.queue.map((q) => q.player_id));
      setEligible(data.profiles.filter((p) => p.role !== 'guest' && !inSession.has(p.id)));
    } catch (e) {
      setError(e.message);
    }
  };

  usePolling(loadAll);

  useEffect(() => {
    loadAll();
  }, [sessionId]);

  const persistQueue = async (ordered) => {
    setQueue(ordered);
    try {
      await apiPut(`/sessions/${sessionId}/queue`, {
        orderedIds: ordered.map((q) => q.id),
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!addPlayerId) return;
    try {
      await apiPost(`/sessions/${sessionId}/players`, { player_id: addPlayerId });
      setAddPlayerId('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    try {
      await apiPost(`/sessions/${sessionId}/players`, { guest_name: name });
      setGuestName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemovePlayer = async (rowId) => {
    try {
      await apiDelete(`/sessions/${sessionId}/players/${rowId}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSetLevel = async (playerId, level) => {
    const prev = allPlayers.find((p) => p.id === playerId)?.level ?? null;
    // optimistic update
    setAllPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, level: level || null } : p)));
    try {
      await apiPatch(`/profiles/${playerId}/level`, { level: level || null });
      setError('');
    } catch (err) {
      setAllPlayers((ps) => ps.map((p) => (p.id === playerId ? { ...p, level: prev } : p)));
      setError(err.message);
    }
  };

  const handleGenerateBracket = async () => {
    setBusy(true);
    setError('');
    try {
      await apiPost(`/sessions/${sessionId}/matches`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStartMatch = async (matchId) => {
    try {
      await apiPatch(`/matches/${matchId}/status`, { status: 'in_progress' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveScore = async (matchId, s1, s2) => {
    try {
      await apiPost(`/matches/${matchId}/complete`, {
        team1_score: s1,
        team2_score: s2,
      });
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  const handleEndSession = async () => {
    const next = session.status === 'active' ? 'ended' : 'active';
    try {
      await apiPatch(`/sessions/${sessionId}`, { status: next });
    } catch (err) {
      setError(err.message);
    }
  };

  if (!session) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at)
    );

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin" className="text-sm text-slate-500 hover:underline">
          ← All sessions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <Badge status={session.status} />
          <button
            onClick={handleEndSession}
            className={`ml-auto rounded-lg px-4 py-1.5 text-sm font-medium ${
              session.status === 'active'
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-court-500 text-white hover:bg-court-600'
            }`}
          >
            {session.status === 'active' ? 'End session' : 'Reopen session'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
              Paddle-stack queue
              <span className="text-sm font-normal text-slate-400">{queue.length} waiting</span>
            </h2>
            <QueueList queue={queue} nameById={nameById} onCourt={onCourt} onReorder={persistQueue} />
            <button
              onClick={handleGenerateBracket}
              disabled={busy || bracketable < 4 || session.status !== 'active'}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-court-500 py-2.5 font-semibold text-white transition hover:bg-court-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Spinner />} Bracket next 4 → court
            </button>
            {bracketable < 4 && (
              <p className="mt-1 text-xs text-slate-400">
                Need at least 4 players not already on court.
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Add player</h2>
            {eligible.length === 0 ? (
              <p className="text-sm text-slate-400">Everyone is already in this session.</p>
            ) : (
              <form onSubmit={handleAddPlayer} className="flex gap-2">
                <select
                  value={addPlayerId}
                  onChange={(e) => setAddPlayerId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
                >
                  <option value="">Select player…</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!addPlayerId}
                  className="rounded-lg bg-court-500 px-4 py-2 text-sm font-semibold text-white hover:bg-court-600 disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Add guest player</h2>
            <form onSubmit={handleAddGuest} className="flex gap-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest name"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
              />
              <button
                type="submit"
                disabled={!guestName.trim()}
                className="rounded-lg bg-court-500 px-4 py-2 text-sm font-semibold text-white hover:bg-court-600 disabled:opacity-50"
              >
                Add
              </button>
            </form>
            <p className="mt-1 text-xs text-slate-400">
              Guests join the queue without needing an account.
            </p>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-bold">Active matches</h2>
            {activeMatches.length === 0 ? (
              <EmptyState
                icon="🏟️"
                title="No matches on court"
                subtitle="Use “Bracket next 4” to send the top of the queue to a court."
              />
            ) : (
              <ul className="space-y-3">
                {activeMatches.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-court-600">
                        Court {m.court_number}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge status={m.status} />
                        <button
                          onClick={() => setScoringMatch(m)}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          Enter score
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                      <p className="text-center font-medium">
                        {nameById(m.team1_player1)} / {nameById(m.team1_player2)}
                      </p>
                      <span className="font-bold text-slate-300">vs</span>
                      <p className="text-center font-medium">
                        {nameById(m.team2_player1)} / {nameById(m.team2_player2)}
                      </p>
                    </div>
                    {m.status === 'upcoming' && (
                      <button
                        onClick={() => handleStartMatch(m.id)}
                        className="mt-3 w-full rounded-lg border border-court-500 py-1.5 text-xs font-semibold text-court-600 hover:bg-court-50"
                      >
                        Mark as started
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Completed results</h2>
            {completed.length === 0 ? (
              <p className="text-sm text-slate-400">No completed matches yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {completed.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                    <span className="w-20 shrink-0 text-slate-400">Rd {m.round_number}</span>
                    <span className={m.winner_team === 1 ? 'font-semibold' : 'text-slate-500'}>
                      {nameById(m.team1_player1)}/{nameById(m.team1_player2)}
                    </span>
                    <span className="font-bold">
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

          <section>
            <h2 className="mb-3 text-lg font-bold">Roster stats</h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {[...queue]
                .sort((a, b) => b.wins - a.wins || a.queue_position - b.queue_position)
                .map((q) => (
                  <li key={q.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="flex-1 truncate font-medium">{nameById(q.player_id)}</span>
                    <select
                      value={levelById[q.player_id] || ''}
                      onChange={(e) => handleSetLevel(q.player_id, e.target.value)}
                      aria-label={`Level for ${nameById(q.player_id)}`}
                      className="rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs capitalize focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
                    >
                      <option value="">level…</option>
                      {PLAYER_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {levelById[q.player_id] && (
                      <span
                        className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:inline ${
                          LEVEL_BADGE_CLASS[levelById[q.player_id]]
                        }`}
                      >
                        {levelById[q.player_id]}
                      </span>
                    )}
                    <span className="text-slate-500">{q.games_played} games</span>
                    <span className="w-14 text-right font-semibold text-court-600">
                      {q.wins} wins
                    </span>
                    <button
                      onClick={() => handleRemovePlayer(q.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>

      <ScoreModal
        match={scoringMatch}
        nameById={nameById}
        onClose={() => setScoringMatch(null)}
        onSubmit={handleSaveScore}
      />
    </div>
  );
}
