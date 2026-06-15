const socket = io();

const joinCard = document.getElementById('joinCard');
const gameScreen = document.getElementById('gameScreen');
const joinError = document.getElementById('joinError');

const nicknameInput = document.getElementById('nicknameInput');
const codeInput = document.getElementById('codeInput');
const joinBtn = document.getElementById('joinBtn');

const nicknameTag = document.getElementById('nicknameTag');
const playerCountPill = document.getElementById('playerCountPill');
const lockPill = document.getElementById('lockPill');
const answerInput = document.getElementById('answerInput');
const buzzerBtn = document.getElementById('buzzerBtn');
const buzzStatus = document.getElementById('buzzStatus');

const buzzList = document.getElementById('buzzList');
const buzzCount = document.getElementById('buzzCount');
const emptyState = document.getElementById('emptyState');

let myNickname = null;
let locked = false;
let hasBuzzed = false;

// Pre-fill room code from URL (e.g. ?code=ABCD from a QR code) and focus nickname
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    codeInput.value = code.toUpperCase();
    nicknameInput.focus();
  } else {
    nicknameInput.focus();
  }
});

// ---------- join ----------
function tryJoin() {
  const nickname = nicknameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  joinError.textContent = '';

  if (!nickname) {
    joinError.textContent = '닉네임을 입력해주세요.';
    return;
  }
  if (!code) {
    joinError.textContent = '방 코드를 입력해주세요.';
    return;
  }
  socket.emit('joinRoom', { code, nickname });
}

joinBtn.addEventListener('click', tryJoin);
[nicknameInput, codeInput].forEach((el) => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryJoin();
  });
});

socket.on('joinResult', (res) => {
  if (!res.success) {
    joinError.textContent = res.error || '입장에 실패했습니다.';
    return;
  }
  myNickname = res.nickname;
  nicknameTag.textContent = myNickname;
  joinCard.style.display = 'none';
  gameScreen.style.display = 'block';
});

// ---------- player count ----------
socket.on('playerListUpdate', ({ count }) => {
  playerCountPill.textContent = `참가자 ${count}명`;
});

// ---------- lock state ----------
socket.on('lockUpdate', ({ locked: isLocked }) => {
  locked = isLocked;
  updateBuzzerState();
  if (locked) {
    lockPill.textContent = '버저 잠김';
    lockPill.classList.remove('unlocked');
    lockPill.classList.add('locked');
  } else {
    lockPill.textContent = '버저 활성화됨';
    lockPill.classList.remove('locked');
    lockPill.classList.add('unlocked');
  }
});

function updateBuzzerState() {
  if (hasBuzzed) {
    buzzerBtn.disabled = true;
    buzzerBtn.textContent = '입력됨';
  } else if (locked) {
    buzzerBtn.disabled = true;
    buzzerBtn.textContent = 'BUZZ';
  } else {
    buzzerBtn.disabled = false;
    buzzerBtn.textContent = 'BUZZ';
  }
}

// ---------- buzz ----------
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

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  // Don't hijack spacebar while typing in the answer field
  if (document.activeElement === answerInput) return;
  if (gameScreen.style.display === 'none') return;
  e.preventDefault();
  pressBuzzer();
});

socket.on('buzzRejected', ({ reason }) => {
  buzzStatus.textContent = reason || '버저를 누를 수 없습니다.';
});

// ---------- round reset ----------
socket.on('roundReset', () => {
  hasBuzzed = false;
  updateBuzzerState();
  buzzStatus.textContent = '새 라운드가 시작되었습니다. 다시 버저를 누를 수 있어요.';
});

// ---------- kicked ----------
socket.on('kicked', () => {
  alert('호스트에 의해 방에서 제외되었습니다.');
  location.href = 'index.html';
});

// ---------- buzz list rendering (read-only view for players) ----------
socket.on('buzzUpdate', ({ buzzes }) => {
  buzzCount.textContent = buzzes.length;

  if (buzzes.length === 0) {
    buzzList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  buzzList.innerHTML = buzzes
    .map((b) => {
      const isMine = b.nickname === myNickname;
      let answer;
      if (isMine) {
        answer = b.answer
          ? escapeHtml(b.answer)
          : '<span style="opacity:0.5;">(답안 미입력)</span>';
      } else {
        answer = '<span style="opacity:0.5;">제출 완료</span>';
      }
      const mine = isMine ? ' style="border-color: var(--accent);"' : '';
      return `
        <li class="buzz-item"${mine}>
          <div class="buzz-rank">${b.order}</div>
          <div class="buzz-info">
            <div class="buzz-nickname">${escapeHtml(b.nickname)}${isMine ? ' (나)' : ''}</div>
            <div class="buzz-answer">${answer}</div>
          </div>
        </li>
      `;
    })
    .join('');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
