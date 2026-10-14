import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

// Node 20 has no native WebSocket — supply `ws` for supabase-js realtime (unused, but
// its client is constructed eagerly, so it needs a valid transport).
const realtime = { transport: ws };

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3001,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Admin client — service role, bypasses RLS. Server-side only.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime,
});

// Per-request client acting as the caller — used for the complete_match RPC
// so the DB-side is_admin() check sees the real caller via auth.uid().
const asUser = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

const app = express();
app.use(cors());
app.use(express.json());

// ---------- auth middleware ----------
async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (profileErr || !profile) {
    return res.status(401).json({ error: 'Profile not found' });
  }

  req.token = token;
  req.user = data.user;
  req.profile = profile;
  next();
}

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

const wrap = (fn) => (req, res) => {
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  });
};

const PLAYER_LEVELS = ['beginner', 'novice', 'intermediate', 'advanced', 'professional'];

// ---------- health ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- me ----------
app.get('/api/me', requireAuth, wrap(async (req, res) => {
  res.json({ profile: req.profile });
}));

// ---------- player level: admins set anyone, users set themselves ----------
app.patch('/api/profiles/:id/level', requireAuth, wrap(async (req, res) => {
  const isSelf = req.profile.id === req.params.id;
  if (req.profile.role !== 'admin' && !isSelf) {
    return res.status(403).json({ error: 'You can only change your own level' });
  }

  const level = req.body?.level ?? null;
  if (level !== null && !PLAYER_LEVELS.includes(level)) {
    return res.status(400).json({
      error: `Level must be one of: ${PLAYER_LEVELS.join(', ')} (or null to clear)`,
    });
  }

  const { data, error } = await db
    .from('profiles')
    .update({ level })
    .eq('id', req.params.id)
    .select('id, full_name, role, level')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Player not found' });
  res.json({ profile: data });
}));

// ---------- sessions ----------
app.get('/api/sessions', requireAuth, wrap(async (req, res) => {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sessions: data });
}));

app.post('/api/sessions', requireAuth, requireAdmin, wrap(async (req, res) => {
  const name = (req.body?.name || '').trim();
  const courts = Number(req.body?.courts_count) || 1;
  if (!name) return res.status(400).json({ error: 'Session name is required' });
  if (courts < 1 || courts > 8) return res.status(400).json({ error: 'Courts must be 1-8' });

  const { data, error } = await db
    .from('sessions')
    .insert({ name, courts_count: courts, created_by: req.user.id })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ session: data });
}));

app.patch('/api/sessions/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'ended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or ended' });
  }
  const { data, error } = await db
    .from('sessions')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Session not found' });
  res.json({ session: data });
}));

// Full payload for the session admin page and player dashboard
app.get('/api/sessions/:id/full', requireAuth, wrap(async (req, res) => {
  const sessionId = req.params.id;
  const [sessRes, queueRes, matchesRes, profilesRes] = await Promise.all([
    db.from('sessions').select('*').eq('id', sessionId).single(),
    db.from('session_players').select('*').eq('session_id', sessionId).order('queue_position'),
    db.from('matches').select('*').eq('session_id', sessionId).order('round_number'),
    db.from('profiles').select('id, email, full_name, role, level').order('full_name'),
  ]);
  if (sessRes.error || !sessRes.data) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    session: sessRes.data,
    queue: queueRes.data || [],
    matches: matchesRes.data || [],
    profiles: profilesRes.data || [],
  });
}));

// ---------- roster: add registered player or guest ----------
app.post('/api/sessions/:id/players', requireAuth, requireAdmin, wrap(async (req, res) => {
  const sessionId = req.params.id;
  const { player_id: playerId, guest_name: guestName } = req.body || {};

  const { data: session } = await db.from('sessions').select('id').eq('id', sessionId).single();
  if (!session) return res.status(404).json({ error: 'Session not found' });

  let resolvedId = playerId;

  if (guestName) {
    const name = String(guestName).trim();
    if (!name) return res.status(400).json({ error: 'Guest name is required' });

    // reuse an existing guest profile with the same name, else create one
    const { data: existing } = await db
      .from('profiles')
      .select('id')
      .eq('full_name', name)
      .eq('role', 'guest')
      .maybeSingle();
    if (existing) {
      resolvedId = existing.id;
    } else {
      const { data: guest, error: guestErr } = await db
        .from('profiles')
        .insert({ full_name: name, role: 'guest' })
        .select()
        .single();
      if (guestErr) return res.status(500).json({ error: guestErr.message });
      resolvedId = guest.id;
    }
  }

  if (!resolvedId) return res.status(400).json({ error: 'player_id or guest_name is required' });

  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('id', resolvedId)
    .single();
  if (!profile) return res.status(404).json({ error: 'Player not found' });

  const { data: maxRow } = await db
    .from('session_players')
    .select('queue_position')
    .eq('session_id', sessionId)
    .order('queue_position', { ascending: false })
    .limit(1);
  const nextPos = (maxRow?.[0]?.queue_position || 0) + 1;

  const { data: row, error: insertErr } = await db
    .from('session_players')
    .insert({ session_id: sessionId, player_id: resolvedId, queue_position: nextPos })
    .select()
    .single();
  if (insertErr) {
    if (insertErr.code === '23505') {
      return res.status(409).json({ error: 'That player is already in this session' });
    }
    return res.status(500).json({ error: insertErr.message });
  }
  res.status(201).json({ player: row });
}));

app.delete('/api/sessions/:id/players/:rowId', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { id, rowId } = req.params;
  const { data: row } = await db
    .from('session_players')
    .select('id, session_id')
    .eq('id', rowId)
    .single();
  if (!row || row.session_id !== id) {
    return res.status(404).json({ error: 'Roster entry not found' });
  }
  const { error } = await db.from('session_players').delete().eq('id', rowId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

// ---------- queue: custom sort ----------
app.put('/api/sessions/:id/queue', requireAuth, requireAdmin, wrap(async (req, res) => {
  const sessionId = req.params.id;
  const orderedIds = req.body?.orderedIds;
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    return res.status(400).json({ error: 'orderedIds array is required' });
  }

  // verify every row belongs to this session
  const { data: rows, error: fetchErr } = await db
    .from('session_players')
    .select('id, session_id')
    .eq('session_id', sessionId);
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  const known = new Set((rows || []).map((r) => r.id));
  if (orderedIds.some((rowId) => !known.has(rowId))) {
    return res.status(400).json({ error: 'Queue contains a player not in this session' });
  }

  const updates = orderedIds.map((rowId, i) => ({ id: rowId, queue_position: i + 1 }));
  const { error } = await db.from('session_players').upsert(updates, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

// ---------- matches: bracket generation ----------
app.post('/api/sessions/:id/matches', requireAuth, requireAdmin, wrap(async (req, res) => {
  const sessionId = req.params.id;

  const { data: session } = await db
    .from('sessions')
    .select('id, status, courts_count')
    .eq('id', sessionId)
    .single();
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'active') {
    return res.status(400).json({ error: 'Session has ended' });
  }

  const [queueRes, activeRes, roundRes] = await Promise.all([
    db.from('session_players').select('*').eq('session_id', sessionId).order('queue_position'),
    db.from('matches').select('*').eq('session_id', sessionId).neq('status', 'completed'),
    db.from('matches').select('round_number').eq('session_id', sessionId)
      .order('round_number', { ascending: false }).limit(1),
  ]);
  if (queueRes.error) return res.status(500).json({ error: queueRes.error.message });

  const activeMatches = activeRes.data || [];
  const onCourt = new Set();
  const occupiedCourts = new Set();
  activeMatches.forEach((m) => {
    occupiedCourts.add(m.court_number);
    [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2]
      .filter(Boolean)
      .forEach((pid) => onCourt.add(pid));
  });

  // top 4 queue entries whose players are not already on court
  const selected = (queueRes.data || []).filter((q) => !onCourt.has(q.player_id)).slice(0, 4);
  if (selected.length < 4) {
    return res.status(400).json({ error: 'Need at least 4 players not already on court' });
  }

  let court = 1;
  while (occupiedCourts.has(court)) court += 1;
  if (court > session.courts_count) {
    return res.status(400).json({ error: 'All courts are busy — complete a match first' });
  }

  const nextRound = (roundRes.data?.[0]?.round_number || 0) + 1;

  const { data: match, error: matchErr } = await db
    .from('matches')
    .insert({
      session_id: sessionId,
      court_number: court,
      round_number: nextRound,
      team1_player1: selected[0].player_id,
      team1_player2: selected[1].player_id,
      team2_player1: selected[2].player_id,
      team2_player2: selected[3].player_id,
      status: 'in_progress',
    })
    .select()
    .single();
  if (matchErr) return res.status(500).json({ error: matchErr.message });
  res.status(201).json({ match });
}));

app.patch('/api/matches/:id/status', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (status !== 'in_progress') {
    return res.status(400).json({ error: 'Status must be in_progress' });
  }
  const { data, error } = await db
    .from('matches')
    .update({ status })
    .eq('id', req.params.id)
    .eq('status', 'upcoming')
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(400).json({ error: 'Match not found or already started' });
  res.json({ match: data });
}));

// ---------- matches: complete via atomic DB function ----------
app.post('/api/matches/:id/complete', requireAuth, requireAdmin, wrap(async (req, res) => {
  const s1 = Number(req.body?.team1_score);
  const s2 = Number(req.body?.team2_score);
  if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) {
    return res.status(400).json({ error: 'Scores must be non-negative integers' });
  }
  if (s1 === s2) {
    return res.status(400).json({ error: 'Scores cannot be equal — pickleball has no draws' });
  }

  // Call the RPC as the requesting admin so the DB-side is_admin() check passes
  const { error } = await asUser(req.token).rpc('complete_match', {
    p_match_id: req.params.id,
    p_team1_score: s1,
    p_team2_score: s2,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
}));

// ---------- 404 + error handlers ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PaddleStacker API listening on http://localhost:${PORT}`);
});
