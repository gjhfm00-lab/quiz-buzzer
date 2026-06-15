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
  socket.on('createRoom', ({ customCode } = {}) => {
    let code;
    if (customCode && customCode.length >= 1) {
      code = customCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (code.length === 0) {
        socket.emit('roomCreateError', { error: '영문/숫자만 사용할 수 있어요.' });
        return;
      }
      if (rooms.has(code)) {
        socket.emit('roomCreateError', { error: `이미 사용 중인 코드예요: ${code}` });
        return;
      }
    } else {
      code = generateRoomCode();
    }
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
    if (room.design) socket.emit('designUpdate', room.design);
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

  // ---- Host: broadcast design to all players ----
  socket.on('designUpdate', (design) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    room.design = design;
    // broadcast to everyone else in the room (players)
    socket.to(code).emit('designUpdate', design);
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

// ---- XLSX export for host - 라운드별 시트 구분 ----
app.get('/export/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    res.status(404).send('방을 찾을 수 없습니다.');
    return;
  }

  // Group history by round
  const byRound = {};
  room.history.forEach((h) => {
    if (!byRound[h.round]) byRound[h.round] = [];
    byRound[h.round].push(h);
  });

  // Build a minimal xlsx binary in memory (pure JS, no library needed)
  // We use the XML-based xlsx (Office Open XML) format
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  function xmlEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function makeSheet(rows) {
    // rows: Array of Arrays
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
    rows.forEach((row, ri) => {
      xml += `<row r="${ri + 1}">`;
      row.forEach((cell, ci) => {
        const colLetter = String.fromCharCode(65 + ci);
        const ref = `${colLetter}${ri + 1}`;
        const val = String(cell ?? '');
        // Use inline string type
        xml += `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(val)}</t></is></c>`;
      });
      xml += `</row>`;
    });
    xml += `</sheetData></worksheet>`;
    return xml;
  }

  // Build all sheet data
  const header = ['순서', '닉네임', '답안', '제출시각'];
  const sheetDefs = [];

  if (rounds.length === 0) {
    sheetDefs.push({ name: '라운드 1', rows: [header] });
  } else {
    rounds.forEach((r) => {
      const rows = [header, ...byRound[r].map((h) => [
        h.order,
        h.nickname,
        h.answer,
        new Date(h.time).toLocaleString('ko-KR'),
      ])];
      sheetDefs.push({ name: `라운드 ${r}`, rows });
    });
  }

  // JSZip-less approach: build xlsx as a zip manually using stored (no compression) method
  // Each file is stored as-is, using the ZIP stored method (compression=0)
  function toBytes(str) {
    const buf = Buffer.from(str, 'utf8');
    return buf;
  }

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = crc32.table || (crc32.table = (() => {
      const t = [];
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })());
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function uint16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
  function uint32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

  function zipEntry(filename, data) {
    const fnBuf = Buffer.from(filename, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // local file header sig
      uint16LE(20), uint16LE(0), uint16LE(0), // version, flags, compression
      uint16LE(0), uint16LE(0),               // mod time, mod date
      uint32LE(crc),
      uint32LE(data.length), uint32LE(data.length), // compressed = uncompressed
      uint16LE(fnBuf.length), uint16LE(0),    // filename len, extra len
      fnBuf, data,
    ]);
    return { local, fnBuf, crc, size: data.length };
  }

  // Build xlsx parts
  const contentTypes = toBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetDefs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);

  const relsMain = toBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);

  const wbRels = toBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetDefs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);

  const workbook = toBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetDefs.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);

  const files = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: relsMain },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    ...sheetDefs.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: toBytes(makeSheet(s.rows)) })),
  ];

  // Build zip
  const entries = files.map(f => ({ ...zipEntry(f.name, f.data), name: f.name }));
  let offset = 0;
  const localParts = [];
  const offsets = [];
  entries.forEach(e => {
    offsets.push(offset);
    localParts.push(e.local);
    offset += e.local.length;
  });

  // Central directory
  const cdParts = entries.map((e, i) => {
    const fnBuf = e.fnBuf;
    return Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]),
      uint16LE(20), uint16LE(20), uint16LE(0), uint16LE(0),
      uint16LE(0), uint16LE(0),
      uint32LE(e.crc),
      uint32LE(e.size), uint32LE(e.size),
      uint16LE(fnBuf.length), uint16LE(0), uint16LE(0),
      uint16LE(0), uint16LE(0), uint32LE(0),
      uint32LE(offsets[i]),
      fnBuf,
    ]);
  });

  const cd = Buffer.concat(cdParts);
  const cdOffset = offset;
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    uint16LE(0), uint16LE(0),
    uint16LE(entries.length), uint16LE(entries.length),
    uint32LE(cd.length), uint32LE(cdOffset),
    uint16LE(0),
  ]);

  const xlsx = Buffer.concat([...localParts, cd, eocd]);
  const filename = `quiz_results_${code}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(xlsx);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz buzzer server running on port ${PORT}`);
});
