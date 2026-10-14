import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Spinner from '../components/Spinner';

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', adminCode: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const options = {
      data: {
        full_name: form.fullName.trim(),
        ...(form.adminCode.trim() ? { admin_code: form.adminCode.trim() } : {}),
      },
    };
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      navigate('/', { replace: true });
    } else {
      setNotice('Account created! Check your email to confirm your address.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-5xl">🏓</span>
          <h1 className="mt-3 text-3xl font-bold text-court-600">Join PaddleStacker</h1>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input
              required
              value={form.fullName}
              onChange={set('fullName')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
              placeholder="Alex Cruz"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={set('email')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={set('password')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Admin code <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={form.adminCode}
              onChange={set('adminCode')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-court-500 focus:outline-none focus:ring-2 focus:ring-court-100"
              placeholder="Only organizers have this"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-court-500 py-2.5 font-semibold text-white transition hover:bg-court-600 disabled:opacity-60"
          >
            {busy && <Spinner />} Create account
          </button>
          <p className="text-center text-sm text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-medium text-court-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
