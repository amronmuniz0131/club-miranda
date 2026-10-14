import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPatch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { PLAYER_LEVELS, LEVEL_BADGE_CLASS } from '../lib/constants';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

function MatchCard({ match, nameById, myId }) {
  const mine = [
    match.team1_player1,
    match.team1_player2,
    match.team2_player1,
    match.team2_player2,
  ].includes(myId);
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        mine ? 'border-court-500 ring-2 ring-court-100' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-court-600">Court {match.court_number}</span>
        <div className="flex items-center gap-2">
          {mine && (
            <span className="rounded-full bg-court-500 px-2 py-0.5 text-xs font-bold text-white">
              Your match
            </span>
          )}
          <Badge status={match.status} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
        <p className="text-center font-medium">
          {nameById(match.team1_player1)}
          <br />
          {nameById(match.team1_player2)}
        </p>
        <span className="font-bold text-slate-300">vs</span>
        <p className="text-center font-medium">
          {nameById(match.team2_player1)}
          <br />
          {nameById(match.team2_player2)}
        </p>
      </div>
    </div>
  );
}

export default function PlayerDashboard() {
  const { profile, setProfile } = useAuth();
  const myId = profile?.id;
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [matches, setMatches] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelError, setLevelError] = useState('');

  const handleSetLevel = async (level) => {
    const prev = profile?.level ?? null;
    const next = level || null;
    setProfile({ ...profile, level: next }); // optimistic
    try {
      await apiPatch(`/profiles/${myId}/level`, { level: next });
      setLevelError('');
    } catch (e) {
      setProfile({ ...profile, level: prev }); // revert on failure
      setLevelError(e.message);
    }
  };

  const nameById = useMemo(() => {
    const map = {};
    profiles.forEach((p) => {
      map[p.id] = p.role === 'guest' ? `${p.full_name} (guest)` : p.full_name || p.email;
    });
    return (id) => map[id] || 'Unknown';
  }, [profiles]);

  useEffect(() => {
    apiGet('/sessions')
      .then((data) => {
        setSessions(data || []);
        if (data?.length) setSessionId((cur) => cur || data[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const data = await apiGet(`/sessions/${sessionId}/full`);
      setQueue(data.queue);
      setMatches(data.matches);
      setProfiles(data.profiles);
    } catch {
      /* keep last known state on transient errors */
    } finally {
      setLoading(false);
    }
  };

  usePolling(loadSession);

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <EmptyState
        title="No sessions yet"
        subtitle="When an organizer creates a session and adds you to the roster, your matches will show up here."
      />
    );
  }

  const session = sessions.find((s) => s.id === sessionId) || null;
  const myRow = queue.find((q) => q.player_id === myId);
  const aheadOfMe = myRow
    ? queue.filter((q) => q.queue_position < myRow.queue_position).length
    : 0;
  const upcoming = matches.filter((m) => m.status !== 'completed');
  const recent = matches
    .filter((m) => m.status === 'completed')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at)
    )
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{session?.name}</h1>
          <p className="text-sm text-slate-500">
            Hi {profile?.full_name?.split(' ')[0] || 'there'} — here's your court time.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-slate-500">My level</label>
            <select
              value={profile?.level || ''}
              onChange={(e) => handleSetLevel(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs capitalize focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
            >
              <option value="">Not set</option>
              {PLAYER_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {profile?.level && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  LEVEL_BADGE_CLASS[profile.level]
                }`}
              >
                {profile.level}
              </span>
            )}
          </div>
          {levelError && <p className="mt-1 text-xs text-red-500">{levelError}</p>}
        </div>
        <select
          value={sessionId || ''}
          onChange={(e) => {
            setLoading(true);
            setSessionId(e.target.value);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === 'ended' ? ' (ended)' : ''}
            </option>
          ))}
        </select>
      </div>

      {myRow ? (
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-court-600">#{myRow.queue_position}</p>
            <p className="text-xs text-slate-500">queue position</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold">{aheadOfMe}</p>
            <p className="text-xs text-slate-500">ahead of you</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold">
              {myRow.wins}
              <span className="text-base text-slate-400">/{myRow.games_played}</span>
            </p>
            <p className="text-xs text-slate-500">wins / games</p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You're not on this session's roster yet — ask the organizer to add you.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Upcoming matches</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon="⏳"
            title="Nothing on court"
            subtitle="The organizer hasn't sent any groups to a court yet."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} nameById={nameById} myId={myId} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent results</h2>
          <Link
            to={`/results/${sessionId}`}
            className="text-sm font-medium text-court-600 hover:underline"
          >
            View all results →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No completed matches yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {recent.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="w-14 shrink-0 text-slate-400">Ct {m.court_number}</span>
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
    </div>
  );
}
