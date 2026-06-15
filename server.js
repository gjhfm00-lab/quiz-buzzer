const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room storage
// rooms: Map<roomCode, {
//   hostSocketId: string,
//   players: Map<socketId, {nickname, answer}>,
//   buzzes: Array<{order, nickname, answer, time}>,
//   history: Array<{round, order, nickname, answer, time}>,
//   round: number,
//   locked: boolean
// }>
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid confusing chars (0,O,1,I)
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function getPlayerList(room) {
  return Array.from(room.players.values()).map((p) => p.nickname);
}

function broadcastPlayerList(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('playerListUpdate', {
    players: getPlayerList(room),
    count: room.players.size,
  });
}

function broadcastBuzzUpdate(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('buzzUpdate', { buzzes: room.buzzes });
}

io.on('connection', (socket) => {
  // ---- Host creates a new room ----
  socket.on('createRoom', () => {
    const code = generateRoomCode();
    rooms.set(code, {
      hostSocketId: socket.id,
      players: new Map(),
      buzzes: [],
      history: [],
      round: 1,
      locked: false,
    });
    socket.join(code);
    socket.data.role = 'host';
    socket.data.roomCode = code;
    socket.emit('roomCreated', { code });
  });

  // ---- Host reconnects to an existing room (e.g. after refresh) ----
  socket.on('hostReconnect', ({ code }) => {
    code = (code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      socket.emit('hostReconnectResult', { success: false, error: '존재하지 않는 방 코드입니다.' });
      return;
    }
    room.hostSocketId = socket.id;
    socket.join(code);
    socket.data.role = 'host';
    socket.data.roomCode = code;
    socket.emit('hostReconnectResult', { success: true, code });
    broadcastPlayerList(code);
    broadcastBuzzUpdate(code);
    socket.emit('lockUpdate', { locked: room.locked });
    socket.emit('roundUpdate', { round: room.round });
  });

  // ---- Player joins a room ----
  socket.on('joinRoom', ({ code, nickname }) => {
    code = (code || '').toUpperCase().trim();
    nickname = (nickname || '').trim().slice(0, 20);

    if (!nickname) {
      socket.emit('joinResult', { success: false, error: '닉네임을 입력해주세요.' });
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      socket.emit('joinResult', { success: false, error: '존재하지 않는 방 코드입니다.' });
      return;
    }

    // Check duplicate nickname
    const taken = Array.from(room.players.values()).some(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (taken) {
      socket.emit('joinResult', { success: false, error: '이미 사용 중인 닉네임입니다.' });
      return;
    }

    room.players.set(socket.id, { nickname, answer: '' });
    socket.join(code);
    socket.data.role = 'player';
    socket.data.roomCode = code;
    socket.data.nickname = nickname;

    socket.emit('joinResult', { success: true, code, nickname });
    socket.emit('buzzUpdate', { buzzes: room.buzzes });
    socket.emit('lockUpdate', { locked: room.locked });
    broadcastPlayerList(code);
  });

  // ---- Player buzzes in ----
  socket.on('buzz', ({ answer }) => {
    const code = socket.data.roomCode;
    const nickname = socket.data.nickname;
    if (!code || !nickname) return;
    const room = rooms.get(code);
    if (!room) return;

    if (room.locked) {
      socket.emit('buzzRejected', { reason: '버저가 잠겨 있습니다.' });
      return;
    }

    // Prevent the same player from buzzing twice in the same round
    const alreadyBuzzed = room.buzzes.some((b) => b.nickname === nickname);
    if (alreadyBuzzed) {
      socket.emit('buzzRejected', { reason: '이미 버저를 눌렀습니다.' });
      return;
    }

    const entry = {
      order: room.buzzes.length + 1,
      nickname,
      answer: (answer || '').trim().slice(0, 200),
      time: Date.now(),
    };
    room.buzzes.push(entry);
    room.history.push({ round: room.round, ...entry });

    broadcastBuzzUpdate(code);
  });

  // ---- Host: reset all buzzes for a new round ----
  socket.on('resetBuzzes', () => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    room.buzzes = [];
    room.round += 1;
    broadcastBuzzUpdate(code);
    io.to(code).emit('roundReset');
    io.to(code).emit('roundUpdate', { round: room.round });
  });

  // ---- Host: remove a single buzz entry ----
  socket.on('removeBuzz', ({ index }) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    if (index >= 0 && index < room.buzzes.length) {
      room.buzzes.splice(index, 1);
      // re-number order
      room.buzzes.forEach((b, i) => (b.order = i + 1));
      broadcastBuzzUpdate(code);
    }
  });

  // ---- Host: lock / unlock buzzer ----
  socket.on('toggleLock', () => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    room.locked = !room.locked;
    io.to(code).emit('lockUpdate', { locked: room.locked });
  });

  // ---- Host: kick a player ----
  socket.on('kickPlayer', ({ nickname }) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    for (const [sid, p] of room.players.entries()) {
      if (p.nickname === nickname) {
        room.players.delete(sid);
        room.buzzes = room.buzzes.filter((b) => b.nickname !== nickname);
        const targetSocket = io.sockets.sockets.get(sid);
        if (targetSocket) {
          targetSocket.emit('kicked');
          targetSocket.leave(code);
        }
      }
    }
    broadcastPlayerList(code);
    broadcastBuzzUpdate(code);
  });

  // ---- Disconnect handling ----
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    if (socket.data.role === 'player') {
      room.players.delete(socket.id);
      broadcastPlayerList(code);
    }
    // Note: rooms persist even if host disconnects, so a host can
    // refresh the page and reconnect using hostReconnect.
  });
});

// ---- CSV export for host (opens in Excel) ----
app.get('/export/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).send('방을 찾을 수 없습니다.');
    return;
  }

  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [['라운드', '순서', '닉네임', '답안', '제출시각']];
  room.history.forEach((h) => {
    const time = new Date(h.time).toLocaleString('ko-KR');
    rows.push([h.round, h.order, h.nickname, h.answer, time]);
  });

  // UTF-8 BOM so Excel reads Korean characters correctly
  const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quiz_results_${code}.csv"`);
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz buzzer server running on port ${PORT}`);
});
