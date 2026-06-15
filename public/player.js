const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

const joinCard      = document.getElementById('joinCard');
const gameScreen    = document.getElementById('gameScreen');
const joinError     = document.getElementById('joinError');
const nicknameInput = document.getElementById('nicknameInput');
const codeInput     = document.getElementById('codeInput');
const joinBtn       = document.getElementById('joinBtn');
const nicknameTag   = document.getElementById('nicknameTag');
const playerCountPill = document.getElementById('playerCountPill');
const lockPill      = document.getElementById('lockPill');
const roundBadge    = document.getElementById('roundBadge');
const answerInput   = document.getElementById('answerInput');
const buzzerBtn     = document.getElementById('buzzerBtn');
const buzzStatus    = document.getElementById('buzzStatus');
const buzzList      = document.getElementById('buzzList');
const buzzCount     = document.getElementById('buzzCount');
const emptyState    = document.getElementById('emptyState');

let myNickname  = null;
let myCode      = null;
let locked      = false;
let hasBuzzed   = false;
let currentRound = 1;
let buzzerLabel = 'BUZZ'; // 호스트가 설정한 버저 텍스트

// ── 세션 복원 ──
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

// ── DOMContentLoaded ──
window.addEventListener('DOMContentLoaded', () => {
  // QR코드 또는 링크의 ?code= 파라미터 자동 입력
  const params = new URLSearchParams(location.search);
  const urlCode = params.get('code');
  if (urlCode) {
    codeInput.value = urlCode.toUpperCase();
    nicknameInput.focus();
  } else {
    nicknameInput.focus();
  }

  // 세션 복원 시도
  const sess = loadSession();
  if (sess) {
    myNickname = sess.nickname;
    myCode     = sess.code;
    socket.emit('joinRoom', { code: sess.code, nickname: sess.nickname, sessionId: sess.sessionId });
  }
});

// ── 소켓 재연결 시 세션 복원 ──
socket.on('connect', () => {
  const sess = loadSession();
  if (sess && myNickname) {
    socket.emit('joinRoom', { code: sess.code, nickname: sess.nickname, sessionId: sess.sessionId });
  }
});

// ── 입장 ──
function tryJoin() {
  const nickname = nicknameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  joinError.textContent = '';
  if (!nickname) { joinError.textContent = '닉네임을 입력해주세요.'; return; }
  if (!code)     { joinError.textContent = '방 코드를 입력해주세요.'; return; }
  socket.emit('joinRoom', { code, nickname, sessionId: null });
}

joinBtn.addEventListener('click', tryJoin);
[nicknameInput, codeInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); }));

socket.on('joinResult', (res) => {
  if (!res.success) {
    joinError.textContent = res.error || '입장에 실패했습니다.';
    clearSession();
    return;
  }
  myNickname = res.nickname;
  myCode     = res.code;
  saveSession(res.code, res.nickname, res.sessionId);
  nicknameTag.textContent = myNickname;
  joinCard.style.display  = 'none';
  gameScreen.style.display = 'block';
});

// ── 방이 닫혔을 때 ──
socket.on('roomClosed', () => {
  clearSession();
  alert('호스트가 방을 닫았습니다.');
  location.href = 'index.html';
});

// ── 참가자 수 ──
socket.on('playerListUpdate', ({ count }) => {
  playerCountPill.textContent = `참가자 ${count}명`;
});

// ── 라운드 표시 ──
socket.on('roundUpdate', ({ round }) => {
  currentRound = round;
  if (roundBadge) roundBadge.textContent = `라운드 ${round}`;
});

// ── 잠금 ──
socket.on('lockUpdate', ({ locked: isLocked }) => {
  locked = isLocked;
  updateBuzzerState();
  if (locked) {
    lockPill.textContent = '버저 잠김';
    lockPill.className = 'pill locked';
  } else {
    lockPill.textContent = '버저 활성화됨';
    lockPill.className = 'pill unlocked';
  }
});

function getBuzzerLabel() {
  return hasBuzzed ? '입력됨' : buzzerLabel;
}

function updateBuzzerState() {
  buzzerBtn.disabled = hasBuzzed || locked;
  if (!hasBuzzed) buzzerBtn.textContent = buzzerLabel;
  else buzzerBtn.textContent = '입력됨';
}

// ── 버저 ──
function pressBuzzer() {
  if (buzzerBtn.disabled) return;
  socket.emit('buzz', { answer: answerInput.value });
  hasBuzzed = true;
  updateBuzzerState();
  buzzerBtn.classList.add('pressed');
  setTimeout(() => buzzerBtn.classList.remove('pressed'), 400);
  buzzStatus.textContent = '버저를 눌렀습니다! 순서가 정해지면 호스트 화면에 표시됩니다.';
}

buzzerBtn.addEventListener('click', pressBuzzer);
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  if (document.activeElement === answerInput) return;
  if (gameScreen.style.display === 'none') return;
  e.preventDefault();
  pressBuzzer();
});

socket.on('buzzRejected', ({ reason }) => { buzzStatus.textContent = reason || '버저를 누를 수 없습니다.'; });

// ── 라운드 리셋 ──
socket.on('roundReset', () => {
  hasBuzzed = false;
  answerInput.value = '';       // ← 정답란 자동 초기화
  updateBuzzerState();
  buzzStatus.textContent = '새 라운드가 시작되었습니다. 다시 버저를 누를 수 있어요.';
});

// ── 강퇴 ──
socket.on('kicked', () => {
  clearSession();
  alert('호스트에 의해 방에서 제외되었습니다.');
  location.href = 'index.html';
});

// ── 버저 순서 목록 ──
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;
  if (buzzes.length === 0) { buzzList.innerHTML = ''; emptyState.style.display = 'block'; return; }
  emptyState.style.display = 'none';
  buzzList.innerHTML = buzzes.map(b => {
    const isMine = b.nickname === myNickname;
    const answer = isMine
      ? (b.answer ? escapeHtml(b.answer) : '<span style="opacity:0.5;">(답안 미입력)</span>')
      : '<span style="opacity:0.5;">제출 완료</span>';
    const mine = isMine ? ' style="border-color:var(--accent);"' : '';
    return `<li class="buzz-item"${mine}>
      <div class="buzz-rank">${b.order}</div>
      <div class="buzz-info">
        <div class="buzz-nickname">${escapeHtml(b.nickname)}${isMine ? ' (나)' : ''}</div>
        <div class="buzz-answer">${answer}</div>
      </div>
    </li>`;
  }).join('');
});

function escapeHtml(str) { const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

/* ══ 디자인 적용 ══ */
function hexToRgb(hex) { const h=hex.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function rgbToHex(r,g,b) { return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function darken(hex,amt){ try{const[r,g,b]=hexToRgb(hex);return rgbToHex(r*(1-amt),g*(1-amt),b*(1-amt));}catch{return hex;} }
function lighten(hex,amt){ try{const[r,g,b]=hexToRgb(hex);return rgbToHex(r+(255-r)*amt,g+(255-g)*amt,b+(255-b)*amt);}catch{return hex;} }

function applyDesign(d) {
  if (!d) return;
  const root = document.documentElement;
  if (d.accent)  { root.style.setProperty('--accent',d.accent); root.style.setProperty('--accent-dim',darken(d.accent,0.25)); }
  if (d.bg)      root.style.setProperty('--bg',d.bg);
  if (d.surface) { root.style.setProperty('--surface',d.surface); root.style.setProperty('--surface-2',lighten(d.surface,0.06)); }
  if (d.text)    root.style.setProperty('--text',d.text);

  // 배경 이미지
  if (d.bgImage) {
    document.body.style.backgroundImage=`url(${d.bgImage})`;
    document.body.style.backgroundSize='cover';
    document.body.style.backgroundPosition='center';
    document.body.style.backgroundAttachment='fixed';
  } else { document.body.style.backgroundImage=''; }

  // 브랜드
  const brand = document.querySelector('.brand');
  if (brand) {
    let iconEl = brand.querySelector('.brand-icon');
    if (!iconEl) { iconEl=document.createElement('span'); iconEl.className='brand-icon'; brand.insertBefore(iconEl,brand.firstChild); }
    if (d.icon) {
      iconEl.innerHTML=`<img src="${d.icon}" style="height:24px;width:24px;object-fit:contain;vertical-align:middle;" />`;
    } else {
      const acc=d.accent||'#ff4655';
      iconEl.innerHTML=`<span class="dot" style="background:${acc};box-shadow:0 0 14px ${acc};display:inline-block;width:12px;height:12px;border-radius:50%;"></span>`;
    }
    let titleEl = brand.querySelector('.brand-text');
    if (!titleEl) { titleEl=document.createElement('span'); titleEl.className='brand-text'; brand.appendChild(titleEl); }
    if (d.logo) {
      titleEl.innerHTML=`<img src="${d.logo}" style="height:28px;object-fit:contain;vertical-align:middle;" alt="로고" />`;
    } else {
      titleEl.textContent=' '+(d.title||'QUIZ BUZZER');
    }
  }

  // 버저 버튼
  const buzzer = document.getElementById('buzzerBtn');
  if (buzzer) {
    if (d.buzzerText) { buzzerLabel = d.buzzerText; if (!hasBuzzed) buzzer.textContent = d.buzzerText; }
    if (d.shape) { const m={circle:'50%',rounded:'24px',square:'8px'}; buzzer.style.borderRadius=m[d.shape]||'50%'; }
    if (d.accent) {
      buzzer.style.background=`radial-gradient(circle at 35% 30%, ${lighten(d.accent,0.15)} 0%, ${d.accent} 55%, ${darken(d.accent,0.2)} 100%)`;
      buzzer.style.boxShadow=`0 12px 0 ${darken(d.accent,0.25)}, 0 16px 30px ${d.accent}55`;
    }
  }
}
socket.on('designUpdate', applyDesign);
