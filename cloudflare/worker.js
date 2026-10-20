import {
  QUALIFY_SECONDS, MAX_COMPETITIVE_SECONDS, MAX_MANUAL_SECONDS, HEARTBEAT_GRACE_MS,
  dayKey, shiftDay, weekKey, allocateSegments, stableSessionId, scoreForSession,
  currentAndPreviousWeeks, cleanText, cleanName, intInRange, scoreReviewTransition
} from './score-logic.js';

const GLOBAL_RACE_ROOM = 'XDU92JXZ';
const MAX_BODY_BYTES = 200_000;
let cachedJwks = null;
let cachedJwksAt = 0;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}
function apiError(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}
function decodeB64Url(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(s).length % 4) % 4);
  const raw = atob(b64);
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
function decodeJwtPart(s) {
  return JSON.parse(new TextDecoder().decode(decodeB64Url(s)));
}
async function getJwks() {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 45 * 60 * 1000) return cachedJwks;
  const resp = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
    headers: { 'accept': 'application/json' }
  });
  if (!resp.ok) throw apiError('auth/unavailable', 'Không tải được khóa xác minh đăng nhập. Thử lại sau.', 503);
  const data = await resp.json();
  if (!Array.isArray(data.keys)) throw apiError('auth/unavailable', 'Không đọc được khóa xác minh đăng nhập.', 503);
  cachedJwks = data.keys;
  cachedJwksAt = now;
  return cachedJwks;
}
async function verifyFirebaseToken(request, env) {
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw apiError('unauthenticated', 'Hãy đăng nhập Google trước.', 401);
  const parts = match[1].split('.');
  if (parts.length !== 3) throw apiError('unauthenticated', 'Mã đăng nhập không hợp lệ.', 401);
  let head, claims;
  try { head = decodeJwtPart(parts[0]); claims = decodeJwtPart(parts[1]); }
  catch { throw apiError('unauthenticated', 'Mã đăng nhập không hợp lệ.', 401); }
  const projectId = String(env.FIREBASE_PROJECT_ID || '');
  const nowSec = Math.floor(Date.now() / 1000);
  if (!projectId || head.alg !== 'RS256' || !head.kid ||
      claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || claims.exp <= nowSec ||
      !Number.isFinite(claims.iat) || claims.iat > nowSec + 60) {
    throw apiError('unauthenticated', 'Mã đăng nhập đã hết hạn hoặc không thuộc dự án này. Đăng nhập lại.', 401);
  }
  const jwks = await getJwks();
  const jwk = jwks.find(k => k.kid === head.kid && k.kty === 'RSA');
  if (!jwk) {
    cachedJwks = null;
    const refreshed = await getJwks();
    const retryKey = refreshed.find(k => k.kid === head.kid && k.kty === 'RSA');
    if (!retryKey) throw apiError('unauthenticated', 'Không xác minh được mã đăng nhập. Hãy đăng nhập lại.', 401);
    return await verifySignatureAndReturn(retryKey, parts, claims, nowSec);
  }
  return await verifySignatureAndReturn(jwk, parts, claims, nowSec);
}
async function verifySignatureAndReturn(jwk, parts, claims, nowSec) {
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeB64Url(parts[2]), signed);
    if (!valid) throw new Error('bad signature');
  } catch {
    throw apiError('unauthenticated', 'Chữ ký đăng nhập không hợp lệ. Hãy đăng nhập lại.', 401);
  }
  if (claims.exp <= nowSec || claims.iat > nowSec + 60) throw apiError('unauthenticated', 'Mã đăng nhập hết hạn.', 401);
  return { uid: claims.sub, name: cleanName(claims.name || claims.email || 'Người học'), email: String(claims.email || '') };
}
async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) throw apiError('invalid-argument', 'Yêu cầu quá lớn.', 413);
  try { return await request.json(); }
  catch { throw apiError('invalid-argument', 'Dữ liệu yêu cầu không phải JSON hợp lệ.'); }
}
async function all(db, sql, ...binds) {
  const base = db.prepare(sql), statement = binds.length ? base.bind(...binds) : base;
  return (await statement.all()).results || [];
}
async function first(db, sql, ...binds) {
  const base = db.prepare(sql), statement = binds.length ? base.bind(...binds) : base;
  return await statement.first();
}
async function run(db, sql, ...binds) {
  const base = db.prepare(sql), statement = binds.length ? base.bind(...binds) : base;
  return await statement.run();
}
function activeAdmins(env) {
  return new Set(String(env.ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean));
}
function newId(prefix = 'evt') { return `${prefix}-${crypto.randomUUID()}`; }
function toSegments(row) {
  try { const x = JSON.parse(row.segments_json || '[]'); return Array.isArray(x) ? x : []; }
  catch { return []; }
}
function cleanSession(row) {
  return { ...row, segments: toSegments(row) };
}
async function ensureMember(env, user, givenName = '') {
  const name = cleanName(givenName || user.name || 'Người học');
  const now = Date.now();
  await run(env.DB,
    `INSERT INTO members (uid,name,created_at_ms,updated_at_ms,t,source_rev,score_policy_version)
     VALUES (?,?,?,?,?,?,1) ON CONFLICT(uid) DO NOTHING`, user.uid, name, now, now, now, now);
  if (givenName) await run(env.DB, 'UPDATE members SET name=?,updated_at_ms=? WHERE uid=?', name, now, user.uid);
  return await first(env.DB, 'SELECT * FROM members WHERE uid=?', user.uid);
}
async function logEvent(env, data) {
  await run(env.DB,
    `INSERT INTO score_events (id,uid,session_id,type,delta,reason,at_ms,source,status,day_key,potential_xp,actor_uid,owner_uid,week_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    data.id || newId('evt'), data.uid, data.sessionId || '', data.type, Number(data.delta) || 0,
    cleanText(data.reason || '', 240), Number(data.atMs) || Date.now(), data.source || '', data.status || '',
    data.dayKey || '', Number(data.potentialXP) || 0, data.actorUid || '', data.ownerUid || '', data.weekKey || '');
}
function summaryFromRow(r) {
  return {
    id: r.uid, uid: r.uid, name: r.name || 'Người học',
    week: r.week || '', xpWeek: Number(r.xp_week) || 0, daysWeek: Number(r.days_week) || 0, minWeek: Number(r.min_week) || 0,
    prevWeek: r.prev_week || '', xpPrevWeek: Number(r.xp_prev_week) || 0,
    daysPrevWeek: Number(r.days_prev_week) || 0, minPrevWeek: Number(r.min_prev_week) || 0,
    prevWeekHasData: !!Number(r.prev_week_has_data), xp: Number(r.xp) || 0,
    verifiedXP: Number(r.verified_xp) || 0, legacyXP: Number(r.legacy_xp) || 0,
    legacyXPIncludedInCompetition: false, level: Number(r.level) || 1, streak: Number(r.streak) || 0,
    t: Number(r.t) || 0, sourceRev: Number(r.source_rev) || 0, scorePolicyVersion: Number(r.score_policy_version) || 1
  };
}
async function rebuildMember(env, uid) {
  const member = await first(env.DB, 'SELECT * FROM members WHERE uid=?', uid);
  if (!member) return null;
  const rows = (await all(env.DB, 'SELECT * FROM score_sessions WHERE uid=?', uid)).map(cleanSession);
  const posted = rows.filter(e => e.status === 'posted');
  let verifiedLifetimeXP = 0;
  const weeklyXP = {}, weeklyMinutes = {}, daySeconds = {};
  for (const e of posted) {
    const xp = Math.max(0, Number(e.xp_base) || 0);
    verifiedLifetimeXP += xp;
    const wk = e.week_key || weekKey(dayKey(Number(e.finished_at_ms) || Date.now()));
    weeklyXP[wk] = (weeklyXP[wk] || 0) + xp;
    weeklyMinutes[wk] = (weeklyMinutes[wk] || 0) + Math.floor((Number(e.duration_seconds) || 0) / 60);
    if (e.source === 'timer') {
      const segments = toSegments(e);
      const fromSegments = allocateSegments(segments);
      for (const [d, secs] of Object.entries(fromSegments)) daySeconds[d] = (daySeconds[d] || 0) + secs;
    }
  }
  const verifiedQualifiedDays = Object.keys(daySeconds).filter(d => daySeconds[d] >= QUALIFY_SECONDS).sort();
  let oldBonusDays = [];
  try { oldBonusDays = JSON.parse(member.active_bonus_days_json || '[]'); } catch {}
  if (!Array.isArray(oldBonusDays)) oldBonusDays = [];
  const oldSet = new Set(oldBonusDays), newSet = new Set(verifiedQualifiedDays);
  for (const d of verifiedQualifiedDays.filter(d => !oldSet.has(d))) {
    await logEvent(env, { uid, type: 'daily_bonus', delta: 30, reason: `Đạt ít nhất 15 phút học đã xác minh ngày ${d}.`, atMs: Date.now(), dayKey: d, actorUid: 'system', status: 'posted' });
  }
  for (const d of oldBonusDays.filter(d => !newSet.has(d))) {
    await logEvent(env, { uid, type: 'daily_bonus_removed', delta: -30, reason: `Thu hồi thưởng ngày ${d} do thay đổi trạng thái bản ghi liên quan.`, atMs: Date.now(), dayKey: d, actorUid: 'system', status: 'adjusted' });
  }
  const keys = currentAndPreviousWeeks(Date.now());
  const bonusForWeek = k => verifiedQualifiedDays.filter(d => weekKey(d) === k).length * 30;
  const daysCurrent = verifiedQualifiedDays.filter(d => weekKey(d) === keys.current);
  const daysPrevious = verifiedQualifiedDays.filter(d => weekKey(d) === keys.previous);
  const xpWeek = (weeklyXP[keys.current] || 0) + bonusForWeek(keys.current);
  const xpPrevWeek = (weeklyXP[keys.previous] || 0) + bonusForWeek(keys.previous);
  const minWeek = weeklyMinutes[keys.current] || 0, minPrevWeek = weeklyMinutes[keys.previous] || 0;
  const today = dayKey(Date.now());
  let cursor = (daySeconds[today] || 0) >= QUALIFY_SECONDS ? today : shiftDay(today, -1);
  let streak = 0;
  for (let i = 0; i < 370; i++) {
    if ((daySeconds[cursor] || 0) >= QUALIFY_SECONDS) { streak++; cursor = shiftDay(cursor, -1); }
    else break;
  }
  const lifetimeXP = verifiedLifetimeXP + verifiedQualifiedDays.length * 30;
  const now = Date.now();
  const prevHasData = xpPrevWeek > 0 || rows.some(e => e.week_key === keys.previous);
  await run(env.DB,
    `UPDATE members SET active_bonus_days_json=?,week=?,xp_week=?,days_week=?,min_week=?,prev_week=?,xp_prev_week=?,days_prev_week=?,min_prev_week=?,prev_week_has_data=?,xp=?,verified_xp=?,legacy_xp=0,level=?,streak=?,t=?,source_rev=?,score_policy_version=1,updated_at_ms=? WHERE uid=?`,
    JSON.stringify(verifiedQualifiedDays), keys.current, xpWeek, Math.min(7, daysCurrent.length), minWeek,
    keys.previous, xpPrevWeek, Math.min(7, daysPrevious.length), minPrevWeek, prevHasData ? 1 : 0,
    lifetimeXP, verifiedLifetimeXP, Math.floor(Math.sqrt(Math.max(0, lifetimeXP) / 50)) + 1, streak, now, now, now, uid);
  return summaryFromRow(await first(env.DB, 'SELECT * FROM members WHERE uid=?', uid));
}
async function currentRow(env, uid) {
  const row = await first(env.DB, 'SELECT * FROM members WHERE uid=?', uid);
  const currentWeek = currentAndPreviousWeeks(Date.now()).current;
  if (row && row.week !== currentWeek) return await rebuildMember(env, uid);
  return row ? summaryFromRow(row) : null;
}
function legacySummary(r) {
  let raw = {};
  try { raw = JSON.parse(r.raw_json || '{}'); } catch {}
  return {
    id: r.uid, uid: r.uid, name: r.name || 'Người học',
    xp: Number(r.xp) || 0, level: Number(r.level) || 1, streak: Number(r.streak) || 0,
    week: r.week || '', xpWeek: Number(r.xp_week) || 0, daysWeek: Number(r.days_week) || 0,
    minWeek: Number(r.min_week) || 0, prevWeek: r.prev_week || '',
    xpPrevWeek: Number(r.xp_prev_week) || 0, daysPrevWeek: Number(r.days_prev_week) || 0,
    minPrevWeek: Number(r.min_prev_week) || 0, prevWeekHasData: !!Number(r.prev_week_has_data),
    t: Number(r.source_t) || 0, importedAt: Number(r.imported_at_ms) || 0,
    source: 'legacy-archive'
  };
}
async function importLegacyMembers(env, admin, data) {
  if (!activeAdmins(env).has(admin.uid)) throw apiError('permission-denied', 'Chỉ người quản trị đã cấu hình trong ADMIN_UIDS mới được nhập dữ liệu cũ.', 403);
  const room = String(data.room || '').trim().toUpperCase();
  if (room !== GLOBAL_RACE_ROOM) throw apiError('invalid-argument', `Mã phòng nguồn phải là ${GLOBAL_RACE_ROOM}.`, 400);
  if (!Array.isArray(data.members) || data.members.length < 1 || data.members.length > 100) {
    throw apiError('invalid-argument', 'Mỗi lần nhập cần từ 1 đến 100 thành viên.', 400);
  }
  const now = Date.now(); let imported = 0;
  for (const m of data.members) {
    const uid = String(m?.uid || m?.id || '').trim();
    if (!uid || uid.length > 128 || uid.includes('/')) continue;
    const name = cleanName(m.name || 'Người học');
    const int = (v, max=1000000000) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    const snapshot = {
      uid, name, xp: int(m.xp), level: Math.max(1, int(m.level, 10000)), streak: int(m.streak, 10000),
      week: String(m.week || '').slice(0, 20), xpWeek: int(m.xpWeek), daysWeek: int(m.daysWeek, 7), minWeek: int(m.minWeek, 10080),
      prevWeek: String(m.prevWeek || '').slice(0, 20), xpPrevWeek: int(m.xpPrevWeek), daysPrevWeek: int(m.daysPrevWeek, 7),
      minPrevWeek: int(m.minPrevWeek, 10080), prevWeekHasData: m.prevWeekHasData === true ? 1 : 0,
      sourceT: int(m.t, 9007199254740991), raw: JSON.stringify(m).slice(0, 12000)
    };
    await run(env.DB,
      `INSERT INTO legacy_member_snapshots (room,uid,name,xp,level,streak,week,xp_week,days_week,min_week,prev_week,xp_prev_week,days_prev_week,min_prev_week,prev_week_has_data,source_t,raw_json,imported_at_ms,imported_by_uid)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(room,uid) DO UPDATE SET name=excluded.name,xp=excluded.xp,level=excluded.level,streak=excluded.streak,week=excluded.week,xp_week=excluded.xp_week,days_week=excluded.days_week,min_week=excluded.min_week,prev_week=excluded.prev_week,xp_prev_week=excluded.xp_prev_week,days_prev_week=excluded.days_prev_week,min_prev_week=excluded.min_prev_week,prev_week_has_data=excluded.prev_week_has_data,source_t=excluded.source_t,raw_json=excluded.raw_json,imported_at_ms=excluded.imported_at_ms,imported_by_uid=excluded.imported_by_uid`,
      room, snapshot.uid, snapshot.name, snapshot.xp, snapshot.level, snapshot.streak, snapshot.week, snapshot.xpWeek, snapshot.daysWeek, snapshot.minWeek,
      snapshot.prevWeek, snapshot.xpPrevWeek, snapshot.daysPrevWeek, snapshot.minPrevWeek, snapshot.prevWeekHasData, snapshot.sourceT, snapshot.raw, now, admin.uid);
    imported++;
  }
  if (!imported) throw apiError('invalid-argument', 'Không tìm thấy thành viên có UID hợp lệ trong tệp.', 400);
  return { ok: true, imported, room, note: 'Đã lưu bản lưu trữ; điểm cũ không được cộng vào XP thi đấu đã xác minh.' };
}
function getSessionError(code) {
  const msgs = {
    'already-active': 'Tài khoản đang có một phiên học khác chạy hoặc tạm dừng trên máy chủ.',
    'not-found': 'Không tìm thấy phiên học trên máy chủ.',
    'not-running': 'Phiên học không ở trạng thái đang chạy trên máy chủ.',
    'not-paused': 'Phiên học không ở trạng thái tạm dừng.',
    'not-active': 'Phiên học không ở trạng thái có thể kết thúc.',
    'not-stopped': 'Hãy kết thúc bộ đếm trên máy chủ trước khi lưu.',
    'too-short': 'Phiên học cần ít nhất 1 phút để được tính XP.',
    'not-scored': 'Phiên này chưa được tính điểm hoặc không thể thu hồi.',
    'client-id-used': 'Mã phiên này đã được sử dụng và không thể mở lại.',
    'client-id-conflict': 'Mã phiên bị trùng; hãy tải lại trang và thử lại.'
  };
  return msgs[code] || 'Không thể xử lý yêu cầu điểm. Hãy thử lại.';
}
async function getOwnSession(env, uid, sid) {
  if (!sid) throw apiError('invalid-argument', 'Thiếu mã phiên học.');
  const row = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', uid, sid);
  if (!row) throw apiError('failed-precondition', getSessionError('not-found'));
  return cleanSession(row);
}
async function handleStart(env, user, data) {
  await ensureMember(env, user, data.name || '');
  const clientId = cleanText(data.clientId, 80);
  if (!clientId) throw apiError('invalid-argument', 'Thiếu mã phiên từ ứng dụng.');
  const sid = await stableSessionId(user.uid, clientId), now = Date.now();
  const existing = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', user.uid, sid);
  if (existing) {
    const d = cleanSession(existing);
    if (d.client_id !== clientId) throw apiError('failed-precondition', getSessionError('client-id-conflict'));
    if (d.status === 'running') {
      const last = Number(d.last_heartbeat_at_ms) || Number(d.current_segment_start_ms) || Number(d.started_at_ms) || now;
      const start = Number(d.current_segment_start_ms) || last;
      if (now - last > HEARTBEAT_GRACE_MS) {
        const end = Math.max(start, Math.min(now, last + HEARTBEAT_GRACE_MS));
        const segs = d.segments.concat(end > start ? [{ startAtMs: start, endAtMs: end }] : []);
        const elapsed = (Number(d.elapsed_ms) || 0) + Math.max(0, end - start);
        await run(env.DB, `UPDATE score_sessions SET status='paused',elapsed_ms=?,segments_json=?,current_segment_start_ms=NULL,last_heartbeat_at_ms=NULL,updated_at_ms=? WHERE uid=? AND session_id=?`, elapsed, JSON.stringify(segs), now, user.uid, sid);
        await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, sid);
        return { sessionId: sid, startedAtMs: d.started_at_ms, status: 'paused', elapsedMs: elapsed, durationSeconds: Math.floor(elapsed / 1000), resumed: true, pausedByHeartbeat: true };
      }
      await run(env.DB, 'INSERT OR IGNORE INTO active_locks(uid,session_id,created_at_ms) VALUES(?,?,?)', user.uid, sid, now);
      const lock = await first(env.DB, 'SELECT session_id FROM active_locks WHERE uid=?', user.uid);
      if (lock && lock.session_id !== sid) throw apiError('failed-precondition', getSessionError('already-active'));
      const elapsed = (Number(d.elapsed_ms) || 0) + Math.max(0, Math.min(now, last + HEARTBEAT_GRACE_MS) - start);
      return { sessionId: sid, startedAtMs: d.started_at_ms, status: 'running', elapsedMs: elapsed, durationSeconds: Math.floor(elapsed / 1000), resumed: true };
    }
    if (d.status === 'paused') {
      await run(env.DB, 'INSERT OR IGNORE INTO active_locks(uid,session_id,created_at_ms) VALUES(?,?,?)', user.uid, sid, now);
      const lock = await first(env.DB, 'SELECT session_id FROM active_locks WHERE uid=?', user.uid);
      if (lock && lock.session_id !== sid) throw apiError('failed-precondition', getSessionError('already-active'));
      return { sessionId: sid, startedAtMs: d.started_at_ms, finishedAtMs: d.finished_at_ms, status: 'paused', elapsedMs: Number(d.elapsed_ms) || 0, durationSeconds: Number(d.duration_seconds) || Math.floor((Number(d.elapsed_ms) || 0) / 1000), resumed: true };
    }
    if (['stopped', 'posted', 'held', 'revoked'].includes(d.status)) {
      await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, sid);
      return { sessionId: sid, startedAtMs: d.started_at_ms, finishedAtMs: d.finished_at_ms, status: d.status, elapsedMs: Number(d.elapsed_ms) || Number(d.duration_seconds) * 1000 || 0, durationSeconds: Number(d.duration_seconds) || Math.floor((Number(d.elapsed_ms) || 0) / 1000), resumed: true };
    }
    throw apiError('failed-precondition', getSessionError('client-id-used'));
  }
  const subject = cleanText(data.subject || 'Khác', 60) || 'Khác';
  await run(env.DB, 'INSERT OR IGNORE INTO active_locks(uid,session_id,created_at_ms) VALUES(?,?,?)', user.uid, sid, now);
  const lock = await first(env.DB, 'SELECT session_id FROM active_locks WHERE uid=?', user.uid);
  if (!lock || lock.session_id !== sid) throw apiError('failed-precondition', getSessionError('already-active'));
  try {
    await run(env.DB,
      `INSERT INTO score_sessions (uid,session_id,client_id,status,subject,source,started_at_ms,current_segment_start_ms,last_heartbeat_at_ms,elapsed_ms,segments_json,created_at_ms,updated_at_ms)
       VALUES (?,?,?,'running',?,'timer',?,?,?,0,'[]',?,?)`,
      user.uid, sid, clientId, subject, now, now, now, now, now);
  } catch (e) {
    const old = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', user.uid, sid);
    // A parallel retry may have inserted this same idempotent session. Keep its active lock.
    if (old) return { sessionId: sid, startedAtMs: old.started_at_ms, status: old.status, elapsedMs: old.elapsed_ms || 0, durationSeconds: old.duration_seconds || 0, resumed: true };
    await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, sid);
    throw e;
  }
  return { sessionId: sid, startedAtMs: now, status: 'running', elapsedMs: 0, durationSeconds: 0, resumed: false };
}
async function handleHeartbeat(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  const now = Date.now();
  if (d.status !== 'running') throw apiError('failed-precondition', getSessionError('not-running'));
  const last = Number(d.last_heartbeat_at_ms) || Number(d.current_segment_start_ms) || Number(d.started_at_ms) || now;
  if (now - last > HEARTBEAT_GRACE_MS) {
    const start = Number(d.current_segment_start_ms) || last;
    const end = Math.max(start, Math.min(now, last + HEARTBEAT_GRACE_MS));
    const segs = d.segments.concat(end > start ? [{ startAtMs: start, endAtMs: end }] : []);
    const elapsed = (Number(d.elapsed_ms) || 0) + Math.max(0, end - start);
    await run(env.DB, `UPDATE score_sessions SET status='paused',elapsed_ms=?,segments_json=?,current_segment_start_ms=NULL,last_heartbeat_at_ms=NULL,updated_at_ms=? WHERE uid=? AND session_id=?`, elapsed, JSON.stringify(segs), now, user.uid, d.session_id);
    await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, d.session_id);
    return { ok: true, paused: true, durationSeconds: Math.floor(elapsed / 1000), staleMs: now - last };
  }
  await run(env.DB, 'UPDATE score_sessions SET last_heartbeat_at_ms=?,updated_at_ms=? WHERE uid=? AND session_id=?', now, now, user.uid, d.session_id);
  return { ok: true, paused: false };
}
async function handlePause(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  if (d.status === 'paused') return { ok: true, durationSeconds: Math.floor((Number(d.elapsed_ms) || 0) / 1000) };
  if (d.status !== 'running') throw apiError('failed-precondition', getSessionError('not-running'));
  const now = Date.now(), start = Number(d.current_segment_start_ms) || now;
  const last = Number(d.last_heartbeat_at_ms) || Number(d.started_at_ms) || now;
  const end = Math.max(start, Math.min(now, last + HEARTBEAT_GRACE_MS));
  const elapsed = (Number(d.elapsed_ms) || 0) + Math.max(0, end - start);
  const segs = d.segments.concat(end > start ? [{ startAtMs: start, endAtMs: end }] : []);
  await run(env.DB, `UPDATE score_sessions SET status='paused',elapsed_ms=?,segments_json=?,current_segment_start_ms=NULL,last_heartbeat_at_ms=NULL,updated_at_ms=? WHERE uid=? AND session_id=?`, elapsed, JSON.stringify(segs), now, user.uid, d.session_id);
  return { ok: true, durationSeconds: Math.floor(elapsed / 1000) };
}
async function handleResume(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  if (d.status === 'running') return { ok: true };
  if (d.status !== 'paused') throw apiError('failed-precondition', getSessionError('not-paused'));
  const now = Date.now();
  await run(env.DB, 'INSERT OR IGNORE INTO active_locks(uid,session_id,created_at_ms) VALUES(?,?,?)', user.uid, d.session_id, now);
  const lock = await first(env.DB, 'SELECT session_id FROM active_locks WHERE uid=?', user.uid);
  if (!lock || lock.session_id !== d.session_id) throw apiError('failed-precondition', getSessionError('already-active'));
  await run(env.DB, `UPDATE score_sessions SET status='running',current_segment_start_ms=?,last_heartbeat_at_ms=?,updated_at_ms=? WHERE uid=? AND session_id=?`, now, now, now, user.uid, d.session_id);
  return { ok: true };
}
async function handleStop(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  if (d.status === 'stopped') return { ok: true, durationSeconds: Number(d.duration_seconds) || Math.floor((Number(d.elapsed_ms) || 0) / 1000), startedAtMs: d.started_at_ms, finishedAtMs: d.finished_at_ms };
  if (!['running', 'paused'].includes(d.status)) throw apiError('failed-precondition', getSessionError('not-active'));
  const now = Date.now(); let elapsed = Number(d.elapsed_ms) || 0; const segs = d.segments.slice();
  if (d.status === 'running') {
    const start = Number(d.current_segment_start_ms) || now;
    const last = Number(d.last_heartbeat_at_ms) || Number(d.started_at_ms) || now;
    const end = Math.max(start, Math.min(now, last + HEARTBEAT_GRACE_MS));
    elapsed += Math.max(0, end - start);
    if (end > start) segs.push({ startAtMs: start, endAtMs: end });
  }
  const seconds = Math.floor(elapsed / 1000), finishedDay = dayKey(now), wk = weekKey(finishedDay);
  await run(env.DB,
    `UPDATE score_sessions SET status='stopped',elapsed_ms=?,segments_json=?,current_segment_start_ms=NULL,last_heartbeat_at_ms=NULL,duration_seconds=?,finished_at_ms=?,finished_day=?,week_key=?,updated_at_ms=? WHERE uid=? AND session_id=?`,
    elapsed, JSON.stringify(segs), seconds, now, finishedDay, wk, now, user.uid, d.session_id);
  await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, d.session_id);
  return { ok: true, durationSeconds: seconds, startedAtMs: d.started_at_ms, finishedAtMs: now };
}
async function handleCancel(env, user, data) {
  const sid = cleanText(data.sessionId, 80);
  if (!sid) return { ok: true };
  const d = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', user.uid, sid);
  if (!d) return { ok: true };
  if (['posted', 'held', 'revoked'].includes(d.status)) return { ok: true };
  const now = Date.now();
  await run(env.DB, `UPDATE score_sessions SET status='cancelled',cancel_reason=?,current_segment_start_ms=NULL,last_heartbeat_at_ms=NULL,updated_at_ms=? WHERE uid=? AND session_id=?`, 'Người dùng hủy phiên chưa lưu.', now, user.uid, sid);
  await run(env.DB, 'DELETE FROM active_locks WHERE uid=? AND session_id=?', user.uid, sid);
  return { ok: true };
}
async function handleSubmitTimer(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  const n = intInRange(data.questions ?? 0, 0, 100000, 'Số bài làm');
  const c = intInRange(data.correct ?? 0, 0, 100000, 'Số bài đúng');
  if (c > n) throw apiError('invalid-argument', 'Số bài đúng không thể lớn hơn số bài đã làm.');
  const focus = intInRange(data.focus ?? 0, 0, 5, 'Mức tập trung');
  const type = cleanText(data.type || '', 40);
  if (['posted', 'held', 'revoked'].includes(d.status)) {
    return { ok: true, existing: true, status: d.status, durationSeconds: d.duration_seconds, xp: d.status === 'posted' ? d.xp_base : 0, potentialXP: d.potential_xp || 0, finishedAtMs: d.finished_at_ms, startedAtMs: d.started_at_ms, reason: d.hold_reason || '' };
  }
  if (d.status !== 'stopped') throw apiError('failed-precondition', getSessionError('not-stopped'));
  const seconds = Math.max(0, Math.floor(Number(d.duration_seconds) || (Number(d.elapsed_ms) || 0) / 1000));
  if (seconds < 60) throw apiError('failed-precondition', getSessionError('too-short'));
  const score = scoreForSession(seconds, n, c, false);
  const shouldHold = seconds > MAX_COMPETITIVE_SECONDS;
  const status = shouldHold ? 'held' : 'posted';
  const reason = shouldHold ? 'Phiên có hơn 6 giờ thời lượng được tính; cần người quản trị xem lại trước khi cộng XP.' : '';
  const now = Date.now();
  const updateResult = await run(env.DB,
    `UPDATE score_sessions SET status=?,questions=?,counted_questions=?,correct=?,counted_correct=?,focus=?,activity_type=?,potential_xp=?,xp_base=?,hold_reason=?,source='timer',submitted_at_ms=?,updated_at_ms=? WHERE uid=? AND session_id=? AND status='stopped'`,
    status, n, score.countedQuestions, c, score.countedCorrect, focus, type, score.baseXP, shouldHold ? 0 : score.baseXP, reason, now, now, user.uid, d.session_id);
  if (!(Number(updateResult?.meta?.changes) > 0)) {
    const latest = await getOwnSession(env, user.uid, d.session_id);
    if (['posted', 'held', 'revoked'].includes(latest.status)) return { ok: true, existing: true, status: latest.status,
      durationSeconds: latest.duration_seconds, xp: latest.status === 'posted' ? latest.xp_base : 0,
      potentialXP: latest.potential_xp || 0, finishedAtMs: latest.finished_at_ms, startedAtMs: latest.started_at_ms, reason: latest.hold_reason || '' };
    throw apiError('failed-precondition', 'Phiên này vừa được xử lý ở nơi khác. Hãy làm mới lịch sử điểm.');
  }
  await logEvent(env, { uid: user.uid, sessionId: d.session_id, type: shouldHold ? 'held' : 'earned', delta: shouldHold ? 0 : score.baseXP,
    reason: reason || 'XP của phiên học được tính từ thời lượng do máy chủ đo.', atMs: now, source: 'timer', status, actorUid: user.uid, potentialXP: score.baseXP, weekKey: d.week_key || '' });
  const summary = await rebuildMember(env, user.uid);
  const latest = await getOwnSession(env, user.uid, d.session_id);
  return { ok: true, existing: false, status, durationSeconds: seconds, xp: shouldHold ? 0 : score.baseXP, potentialXP: score.baseXP,
    finishedAtMs: d.finished_at_ms, startedAtMs: d.started_at_ms, reason, countedQuestions: score.countedQuestions, countedCorrect: score.countedCorrect, summary };
}
async function handleSubmitManual(env, user, data) {
  await ensureMember(env, user, '');
  const clientId = cleanText(data.clientId, 80);
  if (!clientId) throw apiError('invalid-argument', 'Thiếu mã bản ghi nhập tay.');
  const seconds = intInRange(data.durationSeconds, 60, MAX_MANUAL_SECONDS, 'Thời lượng nhập tay');
  const n = intInRange(data.questions ?? 0, 0, 100000, 'Số bài làm');
  const c = intInRange(data.correct ?? 0, 0, 100000, 'Số bài đúng');
  if (c > n) throw apiError('invalid-argument', 'Số bài đúng không thể lớn hơn số bài đã làm.');
  const focus = intInRange(data.focus ?? 0, 0, 5, 'Mức tập trung');
  const finishedAt = intInRange(data.finishedAtMs, 0, Date.now(), 'Ngày giờ kết thúc');
  if ((Date.now() - finishedAt) / 86400000 > 90) throw apiError('invalid-argument', 'Chỉ có thể gửi bản ghi nhập tay trong 90 ngày gần đây để xét duyệt.');
  const sid = `manual-${clientId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 70)}`;
  if (sid === 'manual-') throw apiError('invalid-argument', 'Mã bản ghi nhập tay không hợp lệ.');
  const old = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', user.uid, sid);
  if (old) return { sessionId: sid, status: old.status, potentialXP: Number(old.potential_xp) || 0, duplicate: true };
  const score = scoreForSession(seconds, n, c, false), now = Date.now(), finishedDay = dayKey(finishedAt), wk = weekKey(finishedDay);
  const reason = 'Bản ghi nhập tay do người dùng tự khai; chỉ cộng vào đường đua sau khi quản trị viên xác minh.';
  const insertResult = await run(env.DB,
    `INSERT OR IGNORE INTO score_sessions (uid,session_id,client_id,status,subject,source,started_at_ms,elapsed_ms,segments_json,duration_seconds,finished_at_ms,finished_day,week_key,questions,counted_questions,correct,counted_correct,focus,activity_type,potential_xp,xp_base,hold_reason,submitted_at_ms,created_at_ms,updated_at_ms)
     VALUES (?,?,?,'held',?,'manual',?,?, '[]',?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
    user.uid, sid, `manual:${clientId}`, cleanText(data.subject || 'Khác', 60) || 'Khác', finishedAt - seconds * 1000,
    seconds * 1000, seconds, finishedAt, finishedDay, wk, n, score.countedQuestions, c, score.countedCorrect, focus,
    cleanText(data.type || '', 40), score.baseXP, reason, now, now, now);
  if (!(Number(insertResult?.meta?.changes) > 0)) {
    const duplicate = await first(env.DB, "SELECT session_id,status,potential_xp FROM score_sessions WHERE uid=? AND source='manual' AND (session_id=? OR client_id=?) LIMIT 1", user.uid, sid, `manual:${clientId}`);
    if (duplicate) return { sessionId: duplicate.session_id, status: duplicate.status, potentialXP: Number(duplicate.potential_xp) || 0, duplicate: true };
    throw apiError('failed-precondition', 'Bản ghi nhập tay vừa được nhận ở thiết bị khác. Hãy làm mới lịch sử.');
  }
  await logEvent(env, { uid: user.uid, sessionId: sid, type: 'held', delta: 0, reason, atMs: now, source: 'manual', status: 'held', actorUid: user.uid, potentialXP: score.baseXP, weekKey: wk });
  return { sessionId: sid, status: 'held', potentialXP: score.baseXP, duplicate: false };
}
async function handleWithdraw(env, user, data) {
  const d = await getOwnSession(env, user.uid, cleanText(data.sessionId, 80));
  const reason = cleanText(data.reason || 'Người dùng yêu cầu thu hồi điểm của bản ghi.', 200);
  if (d.status === 'revoked') return { ok: true, already: true, delta: 0 };
  if (!['posted', 'held'].includes(d.status)) throw apiError('failed-precondition', getSessionError('not-scored'));
  const prior = d.status === 'posted' ? Number(d.xp_base) || 0 : 0;
  const now = Date.now();
  const updateResult = await run(env.DB, `UPDATE score_sessions SET status='revoked',xp_base=0,potential_xp=?,hold_reason=?,updated_at_ms=? WHERE uid=? AND session_id=? AND status=?`, Number(d.potential_xp) || Number(d.xp_base) || 0, reason, now, user.uid, d.session_id, d.status);
  if (!(Number(updateResult?.meta?.changes) > 0)) return { ok: true, already: true, delta: 0 };
  await logEvent(env, { uid: user.uid, sessionId: d.session_id, type: 'withdrawn', delta: -prior, reason, atMs: now, source: d.source, status: 'revoked', actorUid: user.uid, potentialXP: Number(d.potential_xp) || 0 });
  await rebuildMember(env, user.uid);
  return { ok: true, delta: -prior };
}
async function handleGetHistory(env, user) {
  const member = await first(env.DB, 'SELECT name FROM members WHERE uid=?', user.uid);
  const rows = await all(env.DB,
    `SELECT id,type,delta,reason,session_id,source,status,day_key,at_ms,actor_uid,potential_xp,owner_uid FROM score_events WHERE uid=? ORDER BY at_ms DESC LIMIT 60`, user.uid);
  return { name: member?.name || '', isAdmin: activeAdmins(env).has(user.uid), events: rows.map(x => ({
    id: x.id, type: x.type || 'event', delta: Number(x.delta) || 0, reason: x.reason || '', sessionId: x.session_id || '',
    source: x.source || '', status: x.status || '', dayKey: x.day_key || '', at: Number(x.at_ms) || 0,
    actorUid: x.actor_uid || '', potentialXP: Number(x.potential_xp) || 0, ownerUid: x.owner_uid || ''
  })) };
}
async function handleGetQueue(env, user) {
  if (!activeAdmins(env).has(user.uid)) throw apiError('permission-denied', 'Chỉ người quản trị bảng điểm mới được duyệt điểm.', 403);
  const rows = await all(env.DB,
    `SELECT s.uid,s.session_id,s.source,s.status,s.potential_xp,s.hold_reason,s.created_at_ms,m.name
     FROM score_sessions s LEFT JOIN members m ON m.uid=s.uid WHERE s.status='held' ORDER BY s.created_at_ms ASC LIMIT 100`);
  return { items: rows.map(x => ({ id: `${x.uid}__${x.session_id}`, uid: x.uid, sessionId: x.session_id, source: x.source,
    status: 'open', potentialXP: Number(x.potential_xp) || 0, reason: x.hold_reason || '', name: x.name || 'Người học', createdAtMs: Number(x.created_at_ms) || 0 })) };
}
async function handleReview(env, admin, data) {
  if (!activeAdmins(env).has(admin.uid)) throw apiError('permission-denied', 'Chỉ người quản trị bảng điểm mới được duyệt điểm.', 403);
  const ownerUid = cleanText(data.ownerUid, 128), sid = cleanText(data.sessionId, 100);
  const action = cleanText(data.action, 20), reason = cleanText(data.reason, 240);
  if (!ownerUid || !sid || !['hold', 'release', 'revoke'].includes(action) || reason.length < 5) throw apiError('invalid-argument', 'Cần UID, mã phiên, hành động và lý do ít nhất 5 ký tự.');
  const d = await first(env.DB, 'SELECT * FROM score_sessions WHERE uid=? AND session_id=?', ownerUid, sid);
  if (!d) throw apiError('failed-precondition', 'Không tìm thấy bản ghi.');
  const transition = scoreReviewTransition(d.status, d.xp_base, d.potential_xp, action);
  if (transition.error) {
    const msg = { 'not-posted':'Chỉ có thể tạm giữ bản ghi đã tính điểm.', 'not-held':'Chỉ có thể duyệt bản ghi đang tạm giữ.', 'not-scored':'Chỉ có thể thu hồi bản ghi đã tính hoặc đang tạm giữ XP.', 'invalid-action':'Hành động kiểm duyệt không hợp lệ.' };
    throw apiError('failed-precondition', msg[transition.error] || 'Không thể xử lý bản ghi.');
  }
  if (transition.unchanged) return { ok: true, unchanged: true, status: transition.status, delta: 0 };
  const now = Date.now(), newStatus = transition.status;
  const updateResult = await run(env.DB, 'UPDATE score_sessions SET status=?,xp_base=?,hold_reason=?,updated_at_ms=? WHERE uid=? AND session_id=? AND status=?',
    newStatus, transition.xpBase, action === 'release' ? '' : reason, now, ownerUid, sid, d.status);
  if (!(Number(updateResult?.meta?.changes) > 0)) {
    const latest = await first(env.DB, 'SELECT status FROM score_sessions WHERE uid=? AND session_id=?', ownerUid, sid);
    return { ok: true, unchanged: true, status: latest?.status || newStatus, delta: 0 };
  }
  await logEvent(env, { uid: ownerUid, sessionId: sid, type: transition.eventType, delta: transition.delta, reason, atMs: now,
    source: d.source || 'timer', status: newStatus, actorUid: admin.uid, ownerUid, potentialXP: Number(d.potential_xp) || 0 });
  const summary = await rebuildMember(env, ownerUid);
  return { ok: true, status: newStatus, delta: transition.delta, summary };
}
async function callMethod(env, user, method, data) {
  switch (method) {
    case 'ensureCompetition': {
      await ensureMember(env, user, data.name || '');
      return { ok: true, summary: await rebuildMember(env, user.uid) };
    }
    case 'updateCompetitionName': {
      await ensureMember(env, user, data.name || user.name);
      return { ok: true, summary: await rebuildMember(env, user.uid) };
    }
    case 'startCompetitiveSession': return await handleStart(env, user, data);
    case 'heartbeatCompetitiveSession': return await handleHeartbeat(env, user, data);
    case 'pauseCompetitiveSession': return await handlePause(env, user, data);
    case 'resumeCompetitiveSession': return await handleResume(env, user, data);
    case 'stopCompetitiveSession': return await handleStop(env, user, data);
    case 'cancelCompetitiveSession': return await handleCancel(env, user, data);
    case 'submitCompetitiveSession': return await handleSubmitTimer(env, user, data);
    case 'submitManualStudyEntry': return await handleSubmitManual(env, user, data);
    case 'withdrawCompetitiveSession': return await handleWithdraw(env, user, data);
    case 'getScoreHistory': return await handleGetHistory(env, user);
    case 'getScoreReviewQueue': return await handleGetQueue(env, user);
    case 'reviewScoreEntry': return await handleReview(env, user, data);
    default: throw apiError('not-found', `API không hỗ trợ thao tác ${cleanText(method, 60)}.`, 404);
  }
}
async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return json({ ok: true });
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const dbOk = !!(await first(env.DB, 'SELECT 1 AS ok'));
    return json({ ok: dbOk, service: 'studylog-score-api', database: dbOk ? 'connected' : 'unavailable', mode: 'free-worker-d1' }, dbOk ? 200 : 503);
  }
  const user = await verifyFirebaseToken(request, env);
  if (url.pathname === '/api/admin/import-legacy-members' && request.method === 'POST') {
    const data = await readJson(request);
    return json(await importLegacyMembers(env, user, data || {}));
  }
  if (url.pathname === '/api/legacy-board' && request.method === 'GET') {
    const room = (url.searchParams.get('room') || GLOBAL_RACE_ROOM).toUpperCase();
    if (room !== GLOBAL_RACE_ROOM) throw apiError('invalid-argument', 'Không tồn tại bảng thành tích lưu trữ này.');
    const rows = await all(env.DB, 'SELECT * FROM legacy_member_snapshots WHERE room=? ORDER BY xp_week DESC, xp DESC, name COLLATE NOCASE ASC LIMIT 500', room);
    return json({ room, members: rows.map(legacySummary), importedAt: rows.reduce((max, r) => Math.max(max, Number(r.imported_at_ms) || 0), 0) });
  }
  if (url.pathname === '/api/board' && request.method === 'GET') {
    const rows = await all(env.DB, 'SELECT * FROM members ORDER BY name COLLATE NOCASE ASC LIMIT 500');
    const currentWeek = currentAndPreviousWeeks(Date.now()).current;
    const summaries = [];
    for (const row of rows) {
      if (row.week !== currentWeek) summaries.push(await rebuildMember(env, row.uid));
      else summaries.push(summaryFromRow(row));
    }
    return json({ room: GLOBAL_RACE_ROOM, members: summaries });
  }
  if (url.pathname === '/api/member' && request.method === 'GET') {
    const room = url.searchParams.get('room') || GLOBAL_RACE_ROOM;
    if (room !== GLOBAL_RACE_ROOM) throw apiError('invalid-argument', 'Không tồn tại đường đua này.');
    const existing = await currentRow(env, user.uid);
    return json({ member: existing });
  }
  const match = url.pathname.match(/^\/api\/call\/([A-Za-z0-9]+)$/);
  if (match && request.method === 'POST') {
    const data = await readJson(request);
    return json(await callMethod(env, user, match[1], data || {}));
  }
  throw apiError('not-found', 'Không tìm thấy đường dẫn API.', 404);
}
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      const code = String(e?.code || 'internal').slice(0, 80);
      const status = Number(e?.status) || (code === 'unauthenticated' ? 401 : code === 'permission-denied' ? 403 : code === 'not-found' ? 404 : 400);
      if (status >= 500) console.error('Worker API error:', code, e?.message || 'unknown');
      return json({ error: code, message: cleanText(e?.message || 'Đã xảy ra lỗi máy chủ.', 240) }, status);
    }
  }
};
