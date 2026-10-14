import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../lib/api';
import { MAX_COURTS } from '../lib/constants';
import { usePolling } from '../hooks/usePolling';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [courts, setCourts] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadSessions = async () => {
    try {
      const data = await apiGet('/sessions');
      setSessions(data.sessions);
    } catch (e) {
      setError(e.message);
    }
  };

  usePolling(loadSessions);

  useEffect(() => {
    loadSessions();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      await apiPost('/sessions', { name: name.trim(), courts_count: courts });
      setName('');
      setCourts(1);
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">Create session</h1>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Session name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tuesday Night Smash"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Courts</label>
            <select
              value={courts}
              onChange={(e) => setCourts(Number(e.target.value))}
              className="w-28 rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
            >
              {Array.from({ length: MAX_COURTS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-court-500 px-5 py-2 font-semibold text-white hover:bg-court-600 disabled:opacity-60"
          >
            {creating && <Spinner />} Create
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="text-xl font-bold">Sessions</h2>
        {sessions.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No sessions yet"
              subtitle="Create your first session above to start building the paddle-stack queue."
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/admin/sessions/${s.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-court-500 hover:shadow"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold">{s.name}</h3>
                    <Badge status={s.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {s.courts_count} court{s.courts_count > 1 ? 's' : ''} ·{' '}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
