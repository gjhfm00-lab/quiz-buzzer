const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

/* ══ DOM refs ══ */
const joinCard        = document.getElementById('joinCard');
const gameScreen      = document.getElementById('gameScreen');
const joinError       = document.getElementById('joinError');
const nicknameInput   = document.getElementById('nicknameInput');
const codeInput       = document.getElementById('codeInput');
const joinBtn         = document.getElementById('joinBtn');
const nicknameTag     = document.getElementById('nicknameTag');
const playerCountPill = document.getElementById('playerCountPill');
const lockPill        = document.getElementById('lockPill');
const roundBadge      = document.getElementById('roundBadge');
const answerInput     = document.getElementById('answerInput');
const buzzerBtn       = document.getElementById('buzzerBtn');
const buzzStatus      = document.getElementById('buzzStatus');
const buzzList        = document.getElementById('buzzList');
const buzzCount       = document.getElementById('buzzCount');
const emptyState      = document.getElementById('emptyState');

let myNickname  = null;
let myCode      = null;
let locked      = false;
let hasBuzzed   = false;
let buzzerLabel = 'BUZZ';

/* ══ 색상 헬퍼 ══ */
function hexToRgb(hex){ const h=hex.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function darken(hex,amt){ try{const[r,g,b]=hexToRgb(hex);return rgbToHex(r*(1-amt),g*(1-amt),b*(1-amt));}catch{return hex;} }
function lighten(hex,amt){ try{const[r,g,b]=hexToRgb(hex);return rgbToHex(r+(255-r)*amt,g+(255-g)*amt,b+(255-b)*amt);}catch{return hex;} }

/* ══ 디자인 적용 ══ */
function applyDesign(d) {
  if (!d) return;
  const root = document.documentElement;
  if (d.accent)  { root.style.setProperty('--accent', d.accent); root.style.setProperty('--accent-dim', darken(d.accent, 0.25)); }
  if (d.bg)      root.style.setProperty('--bg', d.bg);
  if (d.surface) { root.style.setProperty('--surface', d.surface); root.style.setProperty('--surface-2', lighten(d.surface, 0.06)); }
  if (d.text)    root.style.setProperty('--text', d.text);
  if (d.cardOpacity !== undefined) root.style.setProperty('--card-opacity', d.cardOpacity / 100);

  // 배경 이미지 (PC/모바일 분기, URL 방식 + 구버전 base64 폴백)
  const isMobile = window.innerWidth <= 768;
  const bgUrl = isMobile
    ? (d.bgUrlMobile || d.bgUrlPc || d.bgImageMobile || d.bgImagePc || '')
    : (d.bgUrlPc || d.bgUrlMobile || d.bgImagePc || d.bgImageMobile || '');
  const bgColor = isMobile
    ? (d.bgColorMobile || d.bgColorPc || '')
    : (d.bgColorPc || d.bgColorMobile || '');

  if (bgUrl) {
    document.body.style.backgroundImage    = `url(${bgUrl})`;
    document.body.style.backgroundSize     = 'cover';
    document.body.style.backgroundPosition = 'top center';
    document.body.style.backgroundRepeat   = 'no-repeat';
    document.body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
    document.body.style.backgroundColor   = bgColor || '';
    if (isMobile) {
      document.documentElement.style.minHeight = '100%';
      document.body.style.minHeight = '100vh';
    }
  } else {
    document.body.style.backgroundImage   = '';
    document.body.style.backgroundAttachment = '';
    document.body.style.backgroundColor  = bgColor || '';
  }

  // 브랜드 (원 도형 없이)
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.innerHTML = '';
    if (d.iconUrl) {
      const sp = document.createElement('span');
      sp.style.cssText = 'display:inline-flex;align-items:center;margin-right:8px;';
      sp.innerHTML = `<img src="${d.iconUrl}" style="height:24px;width:24px;object-fit:contain;vertical-align:middle;" />`;
      brand.appendChild(sp);
    }
    const titleEl = document.createElement('span');
    if (d.logoUrl) {
      titleEl.innerHTML = `<img src="${d.logoUrl}" style="height:28px;object-fit:contain;vertical-align:middle;" alt="로고" />`;
    } else {
      titleEl.textContent = d.title || 'QUIZ BUZZER';
      titleEl.style.color = d.logoText || d.text || '#f2f2f7';
    }
    brand.appendChild(titleEl);
  }

  // 버저 버튼
  const buzzer = document.getElementById('buzzerBtn');
  if (buzzer) {
    if (d.buzzerText) { buzzerLabel = d.buzzerText; if (!hasBuzzed) buzzer.textContent = d.buzzerText; }
    if (d.shape) { const m={circle:'50%',rounded:'24px',square:'8px'}; buzzer.style.borderRadius = m[d.shape]||'50%'; }
    if (d.accent) {
      buzzer.style.background = `radial-gradient(circle at 35% 30%, ${lighten(d.accent,0.15)} 0%, ${d.accent} 55%, ${darken(d.accent,0.2)} 100%)`;
      buzzer.style.boxShadow  = `0 12px 0 ${darken(d.accent,0.25)}, 0 16px 30px ${d.accent}55`;
    }
  }

  // 캐시 저장 (새로고침 시 즉시 적용용)
  try { localStorage.setItem('quizbuzz_design_cache', JSON.stringify(d)); } catch {}
}

/* ══ 새로고침 시 즉시 디자인 적용 (소켓 연결 전) ══ */
(function applyCache() {
  try {
    const cached = localStorage.getItem('quizbuzz_design_cache');
    if (cached) applyDesign(JSON.parse(cached));
  } catch {}
})();

// 화면 크기 변경 시 배경 재적용
let lastDesign = null;
window.addEventListener('resize', () => { if (lastDesign) applyDesign(lastDesign); });

// 소켓에서 디자인 수신 (전역 브로드캐스트)
socket.on('designUpdate', d => {
  lastDesign = d;
  applyDesign(d);
});

/* ══ 세션 복원 ══ */
const SESSION_KEY = 'quizbuzz_session';
function saveSession(code, nickname, sessionId) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, nickname, sessionId })); } catch {}
}
function loadSession() {
  try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

/* ══ DOMContentLoaded ══ */
window.addEventListener('DOMContentLoaded', () => {
  // URL ?code= 자동 입력
  const params = new URLSearchParams(location.search);
  const urlCode = params.get('code');
  if (urlCode) { codeInput.value = urlCode.toUpperCase(); nicknameInput.focus(); }
  else nicknameInput.focus();

  // 세션 복원
  const sess = loadSession();
  if (sess) {
    myNickname = sess.nickname;
    myCode     = sess.code;
    socket.emit('joinRoom', { code: sess.code, nickname: sess.nickname, sessionId: sess.sessionId });
  }

  // 최신 전역 디자인 요청 (세션 복원이 아닌 첫 방문)
  if (!sess) socket.emit('getGlobalDesign');
});

/* ══ 재연결 시 세션 & 디자인 복원 ══ */
socket.on('connect', () => {
  const sess = loadSession();
  if (sess && myNickname) {
    socket.emit('joinRoom', { code: sess.code, nickname: sess.nickname, sessionId: sess.sessionId });
  } else {
    socket.emit('getGlobalDesign');
  }
});

/* ══ 입장 ══ */
function tryJoin() {
  const nickname = nicknameInput.value.trim();
  const code     = codeInput.value.trim().toUpperCase();
  joinError.textContent = '';
  if (!nickname) { joinError.textContent = '닉네임을 입력해주세요.'; return; }
  if (!code)     { joinError.textContent = '방 코드를 입력해주세요.'; return; }
  socket.emit('joinRoom', { code, nickname, sessionId: null });
}
joinBtn.addEventListener('click', tryJoin);
[nicknameInput, codeInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); }));

socket.on('joinResult', (res) => {
  if (!res.success) { joinError.textContent = res.error || '입장에 실패했습니다.'; clearSession(); return; }
  myNickname = res.nickname;
  myCode     = res.code;
  saveSession(res.code, res.nickname, res.sessionId);
  nicknameTag.textContent  = myNickname;
  joinCard.style.display   = 'none';
  gameScreen.style.display = 'block';
});

socket.on('roomClosed', () => { clearSession(); alert('호스트가 방을 닫았습니다.'); location.href = 'index.html'; });
socket.on('playerListUpdate', ({ count }) => { playerCountPill.textContent = `참가자 ${count}명`; });
socket.on('roundUpdate', ({ round }) => { if (roundBadge) roundBadge.textContent = `라운드 ${round}`; });

/* ══ 잠금 ══ */
socket.on('lockUpdate', ({ locked: isLocked }) => {
  locked = isLocked;
  updateBuzzerState();
  if (locked) { lockPill.textContent = '버저 잠김'; lockPill.className = 'pill locked'; }
  else        { lockPill.textContent = '버저 활성화됨'; lockPill.className = 'pill unlocked'; }
});
function updateBuzzerState() {
  buzzerBtn.disabled = hasBuzzed || locked;
  buzzerBtn.textContent = hasBuzzed ? '입력됨' : buzzerLabel;
}

/* ══ 버저 ══ */
function pressBuzzer() {
  if (buzzerBtn.disabled) return;
  socket.emit('buzz', { answer: answerInput.value });
  hasBuzzed = true;
  updateBuzzerState();
  buzzerBtn.classList.add('pressed');
  setTimeout(() => buzzerBtn.classList.remove('pressed'), 400);
  buzzStatus.textContent = '버저를 눌렀습니다!';
}
buzzerBtn.addEventListener('click', pressBuzzer);
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || document.activeElement === answerInput || gameScreen.style.display === 'none') return;
  e.preventDefault();
  pressBuzzer();
});

socket.on('buzzRejected', ({ reason }) => { buzzStatus.textContent = reason; });
socket.on('roundReset', () => {
  hasBuzzed = false;
  answerInput.value = '';
  updateBuzzerState();
  buzzStatus.textContent = '새 라운드가 시작되었습니다. 다시 버저를 누를 수 있어요.';
});
socket.on('kicked', () => { clearSession(); alert('호스트에 의해 방에서 제외되었습니다.'); location.href = 'index.html'; });

/* ══ 버저 순서 목록 ══ */
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;
  if (buzzes.length === 0) { buzzList.innerHTML = ''; emptyState.style.display = 'block'; return; }
  emptyState.style.display = 'none';
  buzzList.innerHTML = buzzes.map(b => {
    const isMine = b.nickname === myNickname;
    const answer = isMine
      ? (b.answer ? escapeHtml(b.answer) : '<span style="opacity:0.5;">(답안 미입력)</span>')
      : '<span style="opacity:0.5;">제출 완료</span>';
    return `<li class="buzz-item"${isMine ? ' style="border-color:var(--accent);"' : ''}>
      <div class="buzz-rank">${b.order}</div>
      <div class="buzz-info">
        <div class="buzz-nickname">${escapeHtml(b.nickname)}${isMine ? ' (나)' : ''}</div>
        <div class="buzz-answer">${answer}</div>
      </div>
    </li>`;
  }).join('');
});

function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
