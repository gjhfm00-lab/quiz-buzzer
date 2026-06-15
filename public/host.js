const socket = io();

/* ══════════════════════════════════════════
   DOM refs
══════════════════════════════════════════ */
const setupCard     = document.getElementById('setupCard');
const hostPanel     = document.getElementById('hostPanel');
const createError   = document.getElementById('createError');
const setupError    = document.getElementById('setupError');
const createBtn     = document.getElementById('createBtn');
const customCode    = document.getElementById('customCode');
const reconnectBtn  = document.getElementById('reconnectBtn');
const reconnectCode = document.getElementById('reconnectCode');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const joinLinkInput   = document.getElementById('joinLinkInput');
const copyLinkBtn     = document.getElementById('copyLinkBtn');
const playerCountPill = document.getElementById('playerCountPill');
const roundPill       = document.getElementById('roundPill');
const lockPill        = document.getElementById('lockPill');
const lockBtn         = document.getElementById('lockBtn');
const resetBtn        = document.getElementById('resetBtn');
const buzzList        = document.getElementById('buzzList');
const buzzCount       = document.getElementById('buzzCount');
const emptyState      = document.getElementById('emptyState');
const playerTags      = document.getElementById('playerTags');
const playerListCount = document.getElementById('playerListCount');
const playerEmptyState= document.getElementById('playerEmptyState');
const downloadBtn     = document.getElementById('downloadBtn');
const qrCanvas        = document.getElementById('qrCanvas');

// brand
const brandDot   = document.getElementById('brandDot');
const brandTitle = document.getElementById('brandTitle');

/* ══════════════════════════════════════════
   TAB navigation
══════════════════════════════════════════ */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ══════════════════════════════════════════
   DESIGN SETTINGS
══════════════════════════════════════════ */
const DEFAULTS = {
  accent:  '#ff4655',
  bg:      '#11121c',
  surface: '#1c1e2e',
  text:    '#f2f2f7',
  shape:   'circle',
  title:   'QUIZ BUZZER',
  logo:    null,
};

function loadDesign() {
  try {
    const saved = localStorage.getItem('quizbuzz_design');
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

function saveDesign(d) {
  try { localStorage.setItem('quizbuzz_design', JSON.stringify(d)); } catch {}
}

function applyDesign(d) {
  const root = document.documentElement;
  root.style.setProperty('--accent',     d.accent);
  root.style.setProperty('--accent-dim', darken(d.accent, 0.25));
  root.style.setProperty('--bg',         d.bg);
  root.style.setProperty('--surface',    d.surface);
  root.style.setProperty('--surface-2',  lighten(d.surface, 0.06));
  root.style.setProperty('--text',       d.text);

  // brand
  brandDot.style.background = d.accent;
  brandDot.style.boxShadow  = `0 0 14px ${d.accent}`;
  brandTitle.textContent = d.title || 'QUIZ BUZZER';

  // logo
  const logoPreview = document.getElementById('logoPreview');
  if (d.logo) {
    logoPreview.innerHTML = `<img src="${d.logo}" alt="로고" />`;
  } else {
    logoPreview.innerHTML = '<span>이미지 없음</span>';
  }

  // preview buzzer
  updatePreviewBuzzer(d);

  // update design form fields
  document.getElementById('colorAccent').value      = d.accent;
  document.getElementById('colorAccentHex').textContent = d.accent;
  document.getElementById('colorBg').value          = d.bg;
  document.getElementById('colorBgHex').textContent = d.bg;
  document.getElementById('colorSurface').value     = d.surface;
  document.getElementById('colorSurfaceHex').textContent = d.surface;
  document.getElementById('colorText').value        = d.text;
  document.getElementById('colorTextHex').textContent = d.text;
  document.getElementById('siteTitle').value        = d.title || '';

  document.querySelectorAll('.shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === d.shape);
  });
}

function updatePreviewBuzzer(d) {
  const pb = document.getElementById('previewBuzzer');
  const radiusMap = { circle: '50%', rounded: '24px', square: '8px' };
  pb.style.background    = `radial-gradient(circle at 35% 30%, ${lighten(d.accent, 0.15)} 0%, ${d.accent} 55%, ${darken(d.accent, 0.2)} 100%)`;
  pb.style.borderRadius  = radiusMap[d.shape] || '50%';
  pb.style.boxShadow     = `0 6px 0 ${darken(d.accent, 0.25)}, 0 10px 20px ${d.accent}55`;
}

// simple color helpers (hex → rgb arithmetic)
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function darken(hex, amt) {
  const [r,g,b] = hexToRgb(hex);
  return rgbToHex(r*(1-amt), g*(1-amt), b*(1-amt));
}
function lighten(hex, amt) {
  const [r,g,b] = hexToRgb(hex);
  return rgbToHex(r+(255-r)*amt, g+(255-g)*amt, b+(255-b)*amt);
}

// live preview on color change
['colorAccent','colorBg','colorSurface','colorText'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    const hexId = id + 'Hex';
    document.getElementById(hexId).textContent = e.target.value;
    const d = collectFormDesign();
    applyDesign(d);
  });
});

// shape buttons
document.querySelectorAll('.shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePreviewBuzzer(collectFormDesign());
  });
});

// logo file upload
document.getElementById('logoFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const logoPreview = document.getElementById('logoPreview');
    logoPreview.innerHTML = `<img src="${ev.target.result}" alt="로고" />`;
    // store in temp
    document.getElementById('logoFile').dataset.dataUrl = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('logoRemoveBtn').addEventListener('click', () => {
  document.getElementById('logoPreview').innerHTML = '<span>이미지 없음</span>';
  document.getElementById('logoFile').value = '';
  delete document.getElementById('logoFile').dataset.dataUrl;
});

function collectFormDesign() {
  const activeShape = document.querySelector('.shape-btn.active');
  const logoDataUrl = document.getElementById('logoFile').dataset.dataUrl || null;
  const existingLogo = document.querySelector('#logoPreview img');
  return {
    accent:  document.getElementById('colorAccent').value,
    bg:      document.getElementById('colorBg').value,
    surface: document.getElementById('colorSurface').value,
    text:    document.getElementById('colorText').value,
    shape:   activeShape ? activeShape.dataset.shape : 'circle',
    title:   document.getElementById('siteTitle').value.trim() || 'QUIZ BUZZER',
    logo:    logoDataUrl || (existingLogo ? existingLogo.src : null),
  };
}

// save button
document.getElementById('saveDesignBtn').addEventListener('click', () => {
  const d = collectFormDesign();
  saveDesign(d);
  applyDesign(d);
  // broadcast to all connected players via socket
  socket.emit('designUpdate', d);
  const btn = document.getElementById('saveDesignBtn');
  btn.textContent = '✅ 저장됨!';
  setTimeout(() => { btn.textContent = '💾 설정 저장 및 적용'; }, 2000);
});

// reset button
document.getElementById('resetDesignBtn').addEventListener('click', () => {
  if (!confirm('기본값으로 초기화할까요?')) return;
  saveDesign(DEFAULTS);
  applyDesign(DEFAULTS);
  socket.emit('designUpdate', DEFAULTS);
});

// apply saved design on load
window.addEventListener('DOMContentLoaded', () => {
  applyDesign(loadDesign());
  try {
    const saved = localStorage.getItem('quizbuzz_host_code');
    if (saved) reconnectCode.value = saved;
  } catch {}
});

/* ══════════════════════════════════════════
   ROOM SETUP
══════════════════════════════════════════ */
let currentCode = null;

function showHostPanel(code) {
  currentCode = code;
  roomCodeDisplay.textContent = code;
  setupCard.style.display = 'none';
  hostPanel.style.display = 'block';
  try { localStorage.setItem('quizbuzz_host_code', code); } catch {}

  const joinUrl = `${location.origin}/player.html?code=${code}`;
  joinLinkInput.value = joinUrl;
  downloadBtn.href = `/export/${code}`;
  downloadBtn.removeAttribute('download');

  function tryQR() {
    if (window.QRCode) {
      qrCanvas.width = 180; qrCanvas.height = 180;
      QRCode.toCanvas(qrCanvas, joinUrl, { width: 180, margin: 2, color: { dark: '#000000', light: '#ffffff' } }, (err) => {
        if (err) console.error('QR error:', err);
      });
    } else { setTimeout(tryQR, 200); }
  }
  tryQR();

  // send current design to new connections
  socket.emit('designUpdate', loadDesign());
}

copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(joinLinkInput.value).then(() => {
    copyLinkBtn.textContent = '복사됨!';
    setTimeout(() => { copyLinkBtn.textContent = '복사'; }, 2000);
  });
});
joinLinkInput.addEventListener('click', () => joinLinkInput.select());

createBtn.addEventListener('click', () => {
  createError.textContent = '';
  const code = customCode.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  socket.emit('createRoom', { customCode: code });
});
customCode.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });

reconnectBtn.addEventListener('click', () => {
  const code = reconnectCode.value.trim().toUpperCase();
  if (!code) { setupError.textContent = '코드를 입력해주세요.'; return; }
  setupError.textContent = '';
  socket.emit('hostReconnect', { code });
});

socket.on('roomCreated', ({ code }) => showHostPanel(code));
socket.on('roomCreateError', ({ error }) => { createError.textContent = error; });
socket.on('hostReconnectResult', (res) => {
  if (res.success) showHostPanel(res.code);
  else setupError.textContent = res.error || '방을 찾을 수 없습니다.';
});

/* ══════════════════════════════════════════
   PLAYERS
══════════════════════════════════════════ */
socket.on('playerListUpdate', ({ players, count }) => {
  playerCountPill.textContent = `참가자 ${count}명`;
  playerListCount.textContent = count;
  if (!players || players.length === 0) {
    playerTags.innerHTML = '';
    playerEmptyState.style.display = 'block';
    return;
  }
  playerEmptyState.style.display = 'none';
  playerTags.innerHTML = players.map(name => `
    <div class="player-tag">
      <span>${escapeHtml(name)}</span>
      <button class="player-kick" title="내쫓기" data-name="${escapeHtml(name)}">✕</button>
    </div>`).join('');
  playerTags.querySelectorAll('.player-kick').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(`${btn.dataset.name} 님을 방에서 내보낼까요?`))
        socket.emit('kickPlayer', { nickname: btn.dataset.name });
    });
  });
});

socket.on('roundUpdate', ({ round }) => { roundPill.textContent = `라운드 ${round}`; });

/* ══════════════════════════════════════════
   LOCK / RESET
══════════════════════════════════════════ */
lockBtn.addEventListener('click', () => socket.emit('toggleLock'));
socket.on('lockUpdate', ({ locked }) => {
  if (locked) {
    lockPill.textContent = '버저 잠김';
    lockPill.className = 'pill locked';
    lockBtn.textContent = '버저 열기';
  } else {
    lockPill.textContent = '버저 활성화됨';
    lockPill.className = 'pill unlocked';
    lockBtn.textContent = '버저 잠그기';
  }
});
resetBtn.addEventListener('click', () => socket.emit('resetBuzzes'));

/* ══════════════════════════════════════════
   BUZZ LIST
══════════════════════════════════════════ */
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;
  if (buzzes.length === 0) {
    buzzList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  buzzList.innerHTML = buzzes.map((b, idx) => {
    const timeStr = new Date(b.time).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const answer = b.answer ? escapeHtml(b.answer) : '<span style="opacity:0.5;">(답안 미입력)</span>';
    return `<li class="buzz-item">
      <div class="buzz-rank">${b.order}</div>
      <div class="buzz-info">
        <div class="buzz-nickname">${escapeHtml(b.nickname)}</div>
        <div class="buzz-answer">${answer}</div>
      </div>
      <div class="buzz-time">${timeStr}</div>
      <button class="buzz-remove" title="이 항목 삭제" data-idx="${idx}">✕</button>
    </li>`;
  }).join('');
  buzzList.querySelectorAll('.buzz-remove').forEach(btn => {
    btn.addEventListener('click', () => socket.emit('removeBuzz', { index: parseInt(btn.dataset.idx, 10) }));
  });
});

/* ══════════════════════════════════════════
   UTIL
══════════════════════════════════════════ */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
