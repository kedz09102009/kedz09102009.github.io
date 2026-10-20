// Cầu nối Firebase + bảng điểm miễn phí trên Cloudflare Worker.
// Firebase lưu đăng nhập và nhật ký cá nhân; XP thi đấu chính thức chỉ do Worker/D1 tính.
const cfg = window.FIREBASE_CONFIG;
const SCORE_API_URL = String(window.SCORE_API_URL || '').trim().replace(/\/$/, '');
function parseState(doc) { try { return JSON.parse(doc && doc.j || '{}'); } catch { return {}; } }
function mergeStates(remoteDoc, incomingDoc) {
  const remote = parseState(remoteDoc), local = parseState(incomingDoc), deleted = {};
  for (const [id, t] of Object.entries(remote.del || {})) deleted[id] = t;
  for (const [id, t] of Object.entries(local.del || {})) deleted[id] = Math.max(Number(deleted[id]) || 0, Number(t) || 0);
  const sessions = new Map();
  for (const x of [...(remote.sessions || []), ...(local.sessions || [])]) {
    if (!x || x.id == null || deleted[String(x.id)]) continue;
    const k = String(x.id), old = sessions.get(k);
    if (!old || (Number(x.m) || 0) > (Number(old.m) || 0) ||
      ((Number(x.m) || 0) === (Number(old.m) || 0) && x === local.sessions?.find?.(z => String(z.id) === k))) sessions.set(k, x);
  }
  const ach = { ...(remote.ach || {}) };
  for (const [k, v] of Object.entries(local.ach || {})) ach[k] = Math.max(Number(ach[k]) || 0, Number(v) || 0);
  const pref = (Number(remote.su) || 0) > (Number(local.su) || 0) ? remote : local;
  const other = pref === remote ? local : remote;
  const out = { ...remote, ...local, sessions: [...sessions.values()], del: deleted, ach };
  for (const k of ['goalD','goalW','pomo','rem','minD','goalDays','rest','room','name','subjects','goals','su','ver']) {
    if (pref[k] !== undefined) out[k] = pref[k]; else if (other[k] !== undefined) out[k] = other[k];
  }
  return JSON.stringify(out);
}
if (cfg && cfg.apiKey) {
  try {
    const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
    const [{ initializeApp }, A, F] = await Promise.all([
      import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-firestore.js')
    ]);
    const app = initializeApp(cfg), auth = A.getAuth(app), db = F.getFirestore(app);
    const api = async (path, { method = 'GET', data = null } = {}) => {
      if (!SCORE_API_URL) throw Object.assign(new Error('Hãy điền SCORE_API_URL trong config.js sau khi triển khai Cloudflare Worker.'), { code: 'score-api-not-configured' });
      if (!auth.currentUser) throw Object.assign(new Error('Hãy đăng nhập Google trước.'), { code: 'unauthenticated' });
      const token = await auth.currentUser.getIdToken();
      let response;
      try {
        response = await fetch(SCORE_API_URL + path, {
          method,
          headers: { 'Authorization': 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
          body: data ? JSON.stringify(data) : undefined,
          cache: 'no-store'
        });
      } catch (e) {
        throw Object.assign(new Error('Không kết nối được Worker tính điểm. Hãy kiểm tra địa chỉ API và mạng.'), { code: 'unavailable' });
      }
      let result;
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok) {
        const code = String(result.error || (response.status === 401 ? 'unauthenticated' : 'server-error'));
        const error = new Error(result.message || ('Yêu cầu thất bại (' + response.status + ').'));
        error.code = code;
        throw error;
      }
      return result;
    };
    const call = name => async data => api('/api/call/' + encodeURIComponent(name), { method: 'POST', data: data || {} });
    window.cloud = {
      ready: true,
      apiConfigured: !!SCORE_API_URL,
      onAuth: cb => A.onAuthStateChanged(auth, cb),
      signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
      signOut: () => A.signOut(auth),
      watchMine: cb => F.onSnapshot(F.doc(db, 'users', auth.currentUser.uid), s => cb(s.exists() ? s.data() : null), err => { console.warn('Không đọc được hồ sơ Firebase:', err); }),
      // Gộp nhật ký giữa điện thoại và máy tính, không thay đổi quy tắc sở hữu hồ sơ cá nhân.
      setMine: d => F.runTransaction(db, async tx => {
        const ref = F.doc(db, 'users', auth.currentUser.uid), snap = await tx.get(ref), old = snap.exists() ? snap.data() : null;
        const result = { ...(old || {}), ...d, j: old && old.j ? mergeStates(old, d) : d.j,
          u: Math.max(Number(old && old.u) || 0, Number(d.u) || 0, Date.now()), updatedAt: F.serverTimestamp() };
        tx.set(ref, result); return result;
      }),
      setMember: (room, d) => call('ensureCompetition')({ name: d && d.name }),
      getMember: async room => {
        const r = await api('/api/member?room=' + encodeURIComponent(room || 'XDU92JXZ'));
        return r.member || null;
      },
      getLegacyBoard: async room => {
        const r = await api('/api/legacy-board?room=' + encodeURIComponent(room || 'XDU92JXZ'));
        return Array.isArray(r.members) ? r.members : [];
      },
      delMember: () => Promise.reject(Object.assign(new Error('Bảng điểm được quản lý bởi máy chủ.'), { code: 'permission-denied' })),
      // D1 không cung cấp Firestore onSnapshot; polling 20 giây thay thế và vẫn có nút làm mới thủ công.
      watchRoom: (room, cb) => {
        let stopped = false, timer = null, running = false;
        const poll = async () => {
          if (stopped || running) return;
          running = true;
          try {
            const r = await api('/api/board?room=' + encodeURIComponent(room || 'XDU92JXZ'));
            if (!stopped) cb(Array.isArray(r.members) ? r.members : []);
          } catch (e) {
            if (!stopped) { console.warn('Không đọc được đường đua chung:', e); cb(null); }
          } finally { running = false; }
        };
        poll(); timer = setInterval(poll, 20000);
        return () => { stopped = true; if (timer) clearInterval(timer); };
      },
      ensureCompetition: call('ensureCompetition'),
      updateCompetitionName: call('updateCompetitionName'),
      startCompetitiveSession: call('startCompetitiveSession'),
      heartbeatCompetitiveSession: call('heartbeatCompetitiveSession'),
      pauseCompetitiveSession: call('pauseCompetitiveSession'),
      resumeCompetitiveSession: call('resumeCompetitiveSession'),
      stopCompetitiveSession: call('stopCompetitiveSession'),
      cancelCompetitiveSession: call('cancelCompetitiveSession'),
      submitCompetitiveSession: call('submitCompetitiveSession'),
      submitManualStudyEntry: call('submitManualStudyEntry'),
      withdrawCompetitiveSession: call('withdrawCompetitiveSession'),
      getScoreHistory: call('getScoreHistory'),
      getScoreReviewQueue: call('getScoreReviewQueue'),
      reviewScoreEntry: call('reviewScoreEntry')
    };
    window.dispatchEvent(new Event('cloudready'));
  } catch (e) {
    console.warn('Không tải được Firebase (có thể đang ngoại tuyến):', e);
  }
}
