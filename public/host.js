const socket = io();

const setupCard = document.getElementById('setupCard');
const hostPanel = document.getElementById('hostPanel');
const setupError = document.getElementById('setupError');

const createBtn = document.getElementById('createBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const reconnectCode = document.getElementById('reconnectCode');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playerCountPill = document.getElementById('playerCountPill');
const roundPill = document.getElementById('roundPill');
const lockPill = document.getElementById('lockPill');
const lockBtn = document.getElementById('lockBtn');
const resetBtn = document.getElementById('resetBtn');
const buzzList = document.getElementById('buzzList');
const buzzCount = document.getElementById('buzzCount');
const emptyState = document.getElementById('emptyState');
const playerTags = document.getElementById('playerTags');
const playerListCount = document.getElementById('playerListCount');
const playerEmptyState = document.getElementById('playerEmptyState');
const downloadBtn = document.getElementById('downloadBtn');
const qrCanvas = document.getElementById('qrCanvas');

let currentCode = null;
let locked = false;

function showHostPanel(code) {
  currentCode = code;
  roomCodeDisplay.textContent = code;
  setupCard.style.display = 'none';
  hostPanel.style.display = 'block';
  // remember the code locally so a refresh can offer reconnect
  try { localStorage.setItem('quizbuzz_host_code', code); } catch (e) {}

  // result download link
  downloadBtn.href = `/export/${code}`;

  // QR code linking straight to the player join page with the code pre-filled
  const joinUrl = `${location.origin}/player.html?code=${code}`;
  if (window.QRCode) {
    QRCode.toCanvas(qrCanvas, joinUrl, { width: 180, margin: 1 }, (err) => {
      if (err) console.error(err);
    });
  }
}

createBtn.addEventListener('click', () => {
  setupError.textContent = '';
  socket.emit('createRoom');
});

reconnectBtn.addEventListener('click', () => {
  const code = reconnectCode.value.trim().toUpperCase();
  if (!code) {
    setupError.textContent = '코드를 입력해주세요.';
    return;
  }
  setupError.textContent = '';
  socket.emit('hostReconnect', { code });
});

socket.on('roomCreated', ({ code }) => {
  showHostPanel(code);
});

socket.on('hostReconnectResult', (res) => {
  if (res.success) {
    showHostPanel(res.code);
  } else {
    setupError.textContent = res.error || '방을 찾을 수 없습니다.';
  }
});

// Pre-fill reconnect field if we have a remembered code
window.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('quizbuzz_host_code');
    if (saved) reconnectCode.value = saved;
  } catch (e) {}
});

// ---------- player list / counts ----------
socket.on('playerListUpdate', ({ players, count }) => {
  playerCountPill.textContent = `참가자 ${count}명`;
  playerListCount.textContent = count;

  if (!players || players.length === 0) {
    playerTags.innerHTML = '';
    playerEmptyState.style.display = 'block';
    return;
  }
  playerEmptyState.style.display = 'none';

  playerTags.innerHTML = players
    .map(
      (name) => `
        <div class="player-tag">
          <span>${escapeHtml(name)}</span>
          <button class="player-kick" title="내쫓기" data-name="${escapeHtml(name)}">✕</button>
        </div>
      `
    )
    .join('');

  playerTags.querySelectorAll('.player-kick').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm(`${btn.dataset.name} 님을 방에서 내보낼까요?`)) {
        socket.emit('kickPlayer', { nickname: btn.dataset.name });
      }
    });
  });
});

// ---------- round number ----------
socket.on('roundUpdate', ({ round }) => {
  roundPill.textContent = `라운드 ${round}`;
});

// ---------- lock toggle ----------
lockBtn.addEventListener('click', () => {
  socket.emit('toggleLock');
});

socket.on('lockUpdate', ({ locked: isLocked }) => {
  locked = isLocked;
  if (locked) {
    lockPill.textContent = '버저 잠김';
    lockPill.classList.remove('unlocked');
    lockPill.classList.add('locked');
    lockBtn.textContent = '버저 열기';
  } else {
    lockPill.textContent = '버저 활성화됨';
    lockPill.classList.remove('locked');
    lockPill.classList.add('unlocked');
    lockBtn.textContent = '버저 잠그기';
  }
});

// ---------- reset ----------
resetBtn.addEventListener('click', () => {
  socket.emit('resetBuzzes');
});

// ---------- buzz list rendering ----------
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;

  if (buzzes.length === 0) {
    buzzList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  buzzList.innerHTML = buzzes
    .map((b, idx) => {
      const time = new Date(b.time);
      const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const answer = b.answer
        ? escapeHtml(b.answer)
        : '<span style="opacity:0.5;">(답안 미입력)</span>';
      return `
        <li class="buzz-item">
          <div class="buzz-rank">${b.order}</div>
          <div class="buzz-info">
            <div class="buzz-nickname">${escapeHtml(b.nickname)}</div>
            <div class="buzz-answer">${answer}</div>
          </div>
          <div class="buzz-time">${timeStr}</div>
          <button class="buzz-remove" title="이 항목 삭제" data-idx="${idx}">✕</button>
        </li>
      `;
    })
    .join('');

  buzzList.querySelectorAll('.buzz-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      socket.emit('removeBuzz', { index: idx });
    });
  });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
