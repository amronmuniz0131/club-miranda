import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const links = isAdmin
    ? [
        { to: '/admin', label: 'Sessions' },
        { to: '/play', label: 'My Games' },
      ]
    : [{ to: '/play', label: 'My Games' }];

  const initials = (profile?.full_name || profile?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-court-600">
            <span>🏓</span>
            <span>PaddleStacker</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => {
              const active = location.pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-court-50 text-court-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">
                {profile?.full_name || 'Player'}
              </p>
              <p className="text-xs capitalize text-slate-500">{profile?.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-court-500 text-sm font-bold text-white">
              {initials}
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
