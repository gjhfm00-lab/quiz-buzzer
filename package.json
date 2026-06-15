const socket = io();

/* ══════════════════════════════════════════
   DOM refs
══════════════════════════════════════════ */
const setupCard      = document.getElementById('setupCard');
const hostPanel      = document.getElementById('hostPanel');
const createError    = document.getElementById('createError');
const setupError     = document.getElementById('setupError');
const createBtn      = document.getElementById('createBtn');
const customCode     = document.getElementById('customCode');
const reconnectBtn   = document.getElementById('reconnectBtn');
const reconnectCode  = document.getElementById('reconnectCode');
const roomCodeDisplay= document.getElementById('roomCodeDisplay');
const joinLinkInput  = document.getElementById('joinLinkInput');
const copyLinkBtn    = document.getElementById('copyLinkBtn');
const playerCountPill= document.getElementById('playerCountPill');
const roundPill      = document.getElementById('roundPill');
const lockPill       = document.getElementById('lockPill');
const lockBtn        = document.getElementById('lockBtn');
const resetBtn       = document.getElementById('resetBtn');
const buzzList       = document.getElementById('buzzList');
const buzzCount      = document.getElementById('buzzCount');
const emptyState     = document.getElementById('emptyState');
const playerTags     = document.getElementById('playerTags');
const playerListCount= document.getElementById('playerListCount');
const playerEmptyState=document.getElementById('playerEmptyState');
const downloadBtn    = document.getElementById('downloadBtn');
const qrCanvas       = document.getElementById('qrCanvas');
const brandDot       = document.getElementById('brandDot');
const brandTitle     = document.getElementById('brandTitle');
const brandIcon      = document.getElementById('brandIcon');

/* ══════════════════════════════════════════
   TAB navigation
══════════════════════════════════════════ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ══════════════════════════════════════════
   COLOR HELPERS
══════════════════════════════════════════ */
function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function darken(hex,amt){ try{ const[r,g,b]=hexToRgb(hex); return rgbToHex(r*(1-amt),g*(1-amt),b*(1-amt)); }catch{return hex;} }
function lighten(hex,amt){ try{ const[r,g,b]=hexToRgb(hex); return rgbToHex(r+(255-r)*amt,g+(255-g)*amt,b+(255-b)*amt); }catch{return hex;} }

/* ══════════════════════════════════════════
   DESIGN SETTINGS
══════════════════════════════════════════ */
const DEFAULTS = {
  accent:     '#ff4655',
  bg:         '#11121c',
  surface:    '#1c1e2e',
  text:       '#f2f2f7',
  shape:      'circle',
  buzzerText: 'BUZZ',
  title:      'QUIZ BUZZER',
  icon:       null,   // 브랜드 앞 도형/아이콘 이미지
  logo:       null,   // 로고 이미지 (텍스트 대신)
  bgImage:    null,   // 배경 이미지
};

function loadDesign() {
  try {
    const saved = localStorage.getItem('quizbuzz_design');
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

function saveDesign(d) {
  try { localStorage.setItem('quizbuzz_design', JSON.stringify(d)); } catch(e) {
    // localStorage 용량 초과 시 이미지 데이터 없이 저장
    const slim = { ...d, logo: null, icon: null, bgImage: null };
    try { localStorage.setItem('quizbuzz_design', JSON.stringify(slim)); } catch {}
  }
}

function applyDesign(d) {
  if (!d) return;
  const root = document.documentElement;

  // 색상
  root.style.setProperty('--accent',    d.accent);
  root.style.setProperty('--accent-dim', darken(d.accent, 0.25));
  root.style.setProperty('--bg',        d.bg);
  root.style.setProperty('--surface',   d.surface);
  root.style.setProperty('--surface-2', lighten(d.surface, 0.06));
  root.style.setProperty('--text',      d.text);

  // 배경 이미지
  if (d.bgImage) {
    document.body.style.backgroundImage = `url(${d.bgImage})`;
    document.body.style.backgroundSize  = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = '';
  }

  // 브랜드 아이콘 (도형/이미지)
  if (d.icon) {
    brandIcon.innerHTML = `<img src="${d.icon}" style="height:24px;width:24px;object-fit:contain;vertical-align:middle;" />`;
  } else {
    brandIcon.innerHTML = `<span class="dot" id="brandDot" style="background:${d.accent};box-shadow:0 0 14px ${d.accent};"></span>`;
  }

  // 브랜드 타이틀 & 로고
  if (d.logo) {
    brandTitle.innerHTML = `<img src="${d.logo}" style="height:28px;object-fit:contain;vertical-align:middle;" alt="로고" />`;
  } else {
    brandTitle.textContent = d.title || 'QUIZ BUZZER';
  }

  // 미리보기 버저
  updatePreviewBuzzer(d);

  // 폼 필드 동기화
  document.getElementById('colorAccent').value         = d.accent;
  document.getElementById('colorAccentHex').textContent = d.accent;
  document.getElementById('colorBg').value             = d.bg;
  document.getElementById('colorBgHex').textContent    = d.bg;
  document.getElementById('colorSurface').value        = d.surface;
  document.getElementById('colorSurfaceHex').textContent = d.surface;
  document.getElementById('colorText').value           = d.text;
  document.getElementById('colorTextHex').textContent  = d.text;
  document.getElementById('siteTitle').value           = d.title || '';
  document.getElementById('buzzerText').value          = d.buzzerText || 'BUZZ';

  document.querySelectorAll('.shape-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.shape === d.shape)
  );

  // 배경 미리보기
  const bgPreview = document.getElementById('bgPreview');
  if (d.bgImage) {
    bgPreview.innerHTML = `<img src="${d.bgImage}" />`;
  } else {
    bgPreview.innerHTML = '<span>배경 이미지 없음</span>';
  }

  // 로고 미리보기
  const logoPreview = document.getElementById('logoPreview');
  if (d.logo) {
    logoPreview.innerHTML = `<img src="${d.logo}" style="max-height:60px;max-width:100%;object-fit:contain;" />`;
  } else {
    logoPreview.innerHTML = '<span>로고 이미지 없음</span>';
  }

  // 아이콘 미리보기
  const iconPreview = document.getElementById('iconPreview');
  if (d.icon) {
    iconPreview.innerHTML = `<img src="${d.icon}" style="height:40px;width:40px;object-fit:contain;border-radius:8px;" /><span style="font-size:13px;color:var(--text-muted);">브랜드 앞에 표시됩니다</span>`;
  } else {
    iconPreview.innerHTML = '<span style="font-size:13px;color:var(--text-muted);">업로드하면 브랜드 이름 앞에 표시돼요</span>';
  }
}

function updatePreviewBuzzer(d) {
  const pb = document.getElementById('previewBuzzer');
  if (!pb) return;
  const radiusMap = { circle:'50%', rounded:'24px', square:'8px' };
  pb.style.background   = `radial-gradient(circle at 35% 30%, ${lighten(d.accent,0.15)} 0%, ${d.accent} 55%, ${darken(d.accent,0.2)} 100%)`;
  pb.style.borderRadius = radiusMap[d.shape] || '50%';
  pb.style.boxShadow    = `0 6px 0 ${darken(d.accent,0.25)}, 0 10px 20px ${d.accent}55`;
  pb.textContent        = d.buzzerText || 'BUZZ';
}

// 색상 피커 실시간 반영
['colorAccent','colorBg','colorSurface','colorText'].forEach(id => {
  document.getElementById(id).addEventListener('input', e => {
    document.getElementById(id+'Hex').textContent = e.target.value;
    applyDesign(collectFormDesign());
  });
});

// 버저 텍스트 실시간 반영
document.getElementById('buzzerText').addEventListener('input', () => {
  updatePreviewBuzzer(collectFormDesign());
});

// 버저 모양 버튼
document.querySelectorAll('.shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePreviewBuzzer(collectFormDesign());
  });
});

// 파일 업로드 헬퍼
function handleFileInput(inputId, onLoad) {
  document.getElementById(inputId).addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onLoad(ev.target.result);
    reader.readAsDataURL(file);
  });
}

// 배경 이미지
handleFileInput('bgFile', dataUrl => {
  const bgPreview = document.getElementById('bgPreview');
  bgPreview.innerHTML = `<img src="${dataUrl}" />`;
  document.getElementById('bgFile').dataset.dataUrl = dataUrl;
  document.body.style.backgroundImage = `url(${dataUrl})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
});
document.getElementById('bgRemoveBtn').addEventListener('click', () => {
  document.getElementById('bgPreview').innerHTML = '<span>배경 이미지 없음</span>';
  document.getElementById('bgFile').value = '';
  delete document.getElementById('bgFile').dataset.dataUrl;
  document.body.style.backgroundImage = '';
});

// 로고 이미지 (텍스트 대신)
handleFileInput('logoFile', dataUrl => {
  const logoPreview = document.getElementById('logoPreview');
  logoPreview.innerHTML = `<img src="${dataUrl}" style="max-height:60px;max-width:100%;object-fit:contain;" />`;
  document.getElementById('logoFile').dataset.dataUrl = dataUrl;
  // 즉시 브랜드에 반영
  brandTitle.innerHTML = `<img src="${dataUrl}" style="height:28px;object-fit:contain;vertical-align:middle;" alt="로고" />`;
});
document.getElementById('logoRemoveBtn').addEventListener('click', () => {
  document.getElementById('logoPreview').innerHTML = '<span>로고 이미지 없음</span>';
  document.getElementById('logoFile').value = '';
  delete document.getElementById('logoFile').dataset.dataUrl;
  brandTitle.textContent = document.getElementById('siteTitle').value || 'QUIZ BUZZER';
});

// 아이콘 이미지 (브랜드 앞 도형)
handleFileInput('iconFile', dataUrl => {
  const iconPreview = document.getElementById('iconPreview');
  iconPreview.innerHTML = `<img src="${dataUrl}" style="height:40px;width:40px;object-fit:contain;border-radius:8px;" /><span style="font-size:13px;color:var(--text-muted);">브랜드 앞에 표시됩니다</span>`;
  document.getElementById('iconFile').dataset.dataUrl = dataUrl;
  brandIcon.innerHTML = `<img src="${dataUrl}" style="height:24px;width:24px;object-fit:contain;vertical-align:middle;" />`;
});
document.getElementById('iconRemoveBtn').addEventListener('click', () => {
  const iconPreview = document.getElementById('iconPreview');
  iconPreview.innerHTML = '<span style="font-size:13px;color:var(--text-muted);">업로드하면 브랜드 이름 앞에 표시돼요</span>';
  document.getElementById('iconFile').value = '';
  delete document.getElementById('iconFile').dataset.dataUrl;
  const accent = document.getElementById('colorAccent').value;
  brandIcon.innerHTML = `<span class="dot" style="background:${accent};box-shadow:0 0 14px ${accent};"></span>`;
});

function collectFormDesign() {
  const activeShape = document.querySelector('.shape-btn.active');
  const get = id => document.getElementById(id).dataset.dataUrl || null;
  const existingLogo = document.querySelector('#logoPreview img');
  const existingIcon = document.querySelector('#iconPreview img');
  const existingBg   = document.querySelector('#bgPreview img');
  return {
    accent:     document.getElementById('colorAccent').value,
    bg:         document.getElementById('colorBg').value,
    surface:    document.getElementById('colorSurface').value,
    text:       document.getElementById('colorText').value,
    shape:      activeShape ? activeShape.dataset.shape : 'circle',
    buzzerText: document.getElementById('buzzerText').value.trim() || 'BUZZ',
    title:      document.getElementById('siteTitle').value.trim() || 'QUIZ BUZZER',
    logo:       get('logoFile') || (existingLogo ? existingLogo.src : null),
    icon:       get('iconFile') || (existingIcon ? existingIcon.src : null),
    bgImage:    get('bgFile')   || (existingBg   ? existingBg.src   : null),
  };
}

// 저장 버튼
document.getElementById('saveDesignBtn').addEventListener('click', () => {
  const d = collectFormDesign();
  saveDesign(d);
  applyDesign(d);
  socket.emit('designUpdate', d);
  const btn = document.getElementById('saveDesignBtn');
  btn.textContent = '✅ 저장됨!';
  setTimeout(() => { btn.textContent = '💾 설정 저장 및 적용'; }, 2000);
});

// 초기화 버튼
document.getElementById('resetDesignBtn').addEventListener('click', () => {
  if (!confirm('기본값으로 초기화할까요?')) return;
  // 파일 입력 초기화
  ['bgFile','logoFile','iconFile'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    delete el.dataset.dataUrl;
  });
  saveDesign(DEFAULTS);
  applyDesign(DEFAULTS);
  socket.emit('designUpdate', DEFAULTS);
});

// 페이지 로드 시 저장된 디자인 적용
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
      QRCode.toCanvas(qrCanvas, joinUrl, { width:180, margin:2, color:{ dark:'#000000', light:'#ffffff' } }, err => {
        if (err) console.error('QR error:', err);
      });
    } else { setTimeout(tryQR, 200); }
  }
  tryQR();

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
socket.on('hostReconnectResult', res => {
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
    lockPill.textContent = '버저 잠김'; lockPill.className = 'pill locked'; lockBtn.textContent = '버저 열기';
  } else {
    lockPill.textContent = '버저 활성화됨'; lockPill.className = 'pill unlocked'; lockBtn.textContent = '버저 잠그기';
  }
});
resetBtn.addEventListener('click', () => socket.emit('resetBuzzes'));

/* ══════════════════════════════════════════
   BUZZ LIST
══════════════════════════════════════════ */
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;
  if (buzzes.length === 0) { buzzList.innerHTML = ''; emptyState.style.display = 'block'; return; }
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
      <button class="buzz-remove" title="삭제" data-idx="${idx}">✕</button>
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
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}
