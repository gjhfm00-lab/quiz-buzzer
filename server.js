const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 업로드 폴더 생성
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 전역 디자인을 파일로 영속 저장 (서버 재시작해도 유지)
const DESIGN_FILE = path.join(__dirname, 'global-design.json');

function loadGlobalDesign() {
  try {
    if (fs.existsSync(DESIGN_FILE)) return JSON.parse(fs.readFileSync(DESIGN_FILE, 'utf8'));
  } catch {}
  return null;
}

function saveGlobalDesign(d) {
  try { fs.writeFileSync(DESIGN_FILE, JSON.stringify(d), 'utf8'); } catch {}
}

// multer 설정 - 파일을 public/uploads에 저장
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
  },
});

// 이미지 업로드 API
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) { res.status(400).json({ error: '파일이 없습니다.' }); return; }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// 700명 이상 동시 접속 대비 설정
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6, // 소켓 메시지 크기 제한 (이미지는 HTTP로만)
  httpCompression: { threshold: 1024 },
  perMessageDeflate: { threshold: 1024 },
  connectTimeout: 10000,
});

// 정적 파일 캐시
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '5m', etag: true, lastModified: true,
}));

// QR 진입 리다이렉트
app.get('/join', (req, res) => {
  const code = (req.query.code || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!code) { res.redirect('/player.html'); return; }
  res.set('Cache-Control', 'public, max-age=300');
  res.redirect(301, `/player.html?code=${code}`);
});

// 전역 디자인 설정 (방과 무관하게 공유 — 파일에서 복원)
let globalDesign = loadGlobalDesign();

// 연결 수 모니터링
let peakConnections = 0;
setInterval(() => {
  const count = io.sockets.sockets.size;
  if (count > peakConnections) peakConnections = count;
  if (count > 0) console.log(`[연결] 현재: ${count}명 / 최고: ${peakConnections}명`);
}, 30000);

// rooms: Map<roomCode, { hostSocketId, players, buzzes, history, round, locked, design, createdAt }>
const rooms = new Map();

// 참가자 재접속용 세션 저장: Map<sessionId, { code, nickname }>
const sessions = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function getPlayerList(room) {
  return Array.from(room.players.values()).map(p => p.nickname);
}

function broadcastPlayerList(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('playerListUpdate', { players: getPlayerList(room), count: room.players.size });
}

function broadcastBuzzUpdate(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('buzzUpdate', { buzzes: room.buzzes });
}

// 호스트에게 전체 방 목록 전송
function sendRoomList(socket) {
  const list = Array.from(rooms.entries()).map(([code, room]) => ({
    code,
    playerCount: room.players.size,
    round: room.round,
    createdAt: room.createdAt,
    locked: room.locked,
  }));
  socket.emit('roomList', list);
}

io.on('connection', (socket) => {

  // 새로 접속한 누구에게든 현재 전역 디자인 즉시 전송
  if (globalDesign) socket.emit('designUpdate', globalDesign);
  socket.on('createRoom', ({ customCode } = {}) => {
    let code;
    if (customCode && customCode.length >= 1) {
      code = customCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (!code) { socket.emit('roomCreateError', { error: '영문/숫자만 사용할 수 있어요.' }); return; }
      if (rooms.has(code)) { socket.emit('roomCreateError', { error: `이미 사용 중인 코드예요: ${code}` }); return; }
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
      design: null,
      createdAt: Date.now(),
    });
    socket.join(code);
    socket.data.role = 'host';
    socket.data.roomCode = code;
    socket.emit('roomCreated', { code });
    sendRoomList(socket);
  });

  // ── 호스트 재접속 ──
  socket.on('hostReconnect', ({ code }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('hostReconnectResult', { success: false, error: '존재하지 않는 방 코드입니다.' }); return; }
    room.hostSocketId = socket.id;
    socket.join(code);
    socket.data.role = 'host';
    socket.data.roomCode = code;
    socket.emit('hostReconnectResult', { success: true, code });
    broadcastPlayerList(code);
    broadcastBuzzUpdate(code);
    socket.emit('lockUpdate', { locked: room.locked });
    socket.emit('roundUpdate', { round: room.round });
    if (room.design) socket.emit('designUpdate', room.design);
    sendRoomList(socket);
  });

  // ── 호스트: 방 목록 요청 ──
  socket.on('getRoomList', () => sendRoomList(socket));

  // ── 호스트: 방 삭제 ──
  socket.on('deleteRoom', ({ code }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return;
    // 해당 방 참가자 전체 연결 끊기 알림
    io.to(code).emit('roomClosed');
    rooms.delete(code);
    sendRoomList(socket);
  });

  // ── 참가자 입장 ──
  socket.on('joinRoom', ({ code, nickname, sessionId }) => {
    code = (code || '').toUpperCase().trim();
    nickname = (nickname || '').trim().slice(0, 20);
    if (!nickname) { socket.emit('joinResult', { success: false, error: '닉네임을 입력해주세요.' }); return; }

    const room = rooms.get(code);
    if (!room) { socket.emit('joinResult', { success: false, error: '존재하지 않는 방 코드입니다.' }); return; }

    // 세션 재접속 처리 (새로고침)
    if (sessionId && sessions.has(sessionId)) {
      const sess = sessions.get(sessionId);
      if (sess.code === code && sess.nickname === nickname) {
        // 기존 소켓 정리
        for (const [sid, p] of room.players.entries()) {
          if (p.nickname === nickname && sid !== socket.id) {
            room.players.delete(sid);
            break;
          }
        }
        room.players.set(socket.id, { nickname, answer: '' });
        socket.join(code);
        socket.data.role = 'player';
        socket.data.roomCode = code;
        socket.data.nickname = nickname;
        socket.data.sessionId = sessionId;
        sessions.set(sessionId, { code, nickname });

        socket.emit('joinResult', { success: true, code, nickname, sessionId });
        socket.emit('buzzUpdate', { buzzes: room.buzzes });
        socket.emit('lockUpdate', { locked: room.locked });
        socket.emit('roundUpdate', { round: room.round });
        if (room.design) socket.emit('designUpdate', room.design);
        broadcastPlayerList(code);
        return;
      }
    }

    // 닉네임 중복 체크
    const taken = Array.from(room.players.values()).some(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (taken) { socket.emit('joinResult', { success: false, error: '이미 사용 중인 닉네임입니다.' }); return; }

    // 새 세션 ID 생성
    const newSessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.set(newSessionId, { code, nickname });

    room.players.set(socket.id, { nickname, answer: '' });
    socket.join(code);
    socket.data.role = 'player';
    socket.data.roomCode = code;
    socket.data.nickname = nickname;
    socket.data.sessionId = newSessionId;

    socket.emit('joinResult', { success: true, code, nickname, sessionId: newSessionId });
    socket.emit('buzzUpdate', { buzzes: room.buzzes });
    socket.emit('lockUpdate', { locked: room.locked });
    socket.emit('roundUpdate', { round: room.round });
    // 방 디자인 또는 전역 디자인 전달
    const d = room.design || globalDesign;
    if (d) socket.emit('designUpdate', d);
    broadcastPlayerList(code);
  });

  // ── 버저 ──
  socket.on('buzz', ({ answer }) => {
    const code = socket.data.roomCode;
    const nickname = socket.data.nickname;
    if (!code || !nickname) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room.locked) { socket.emit('buzzRejected', { reason: '버저가 잠겨 있습니다.' }); return; }
    if (room.buzzes.some(b => b.nickname === nickname)) { socket.emit('buzzRejected', { reason: '이미 버저를 눌렀습니다.' }); return; }

    const entry = { order: room.buzzes.length + 1, nickname, answer: (answer || '').trim().slice(0, 200), time: Date.now() };
    room.buzzes.push(entry);
    room.history.push({ round: room.round, ...entry });
    broadcastBuzzUpdate(code);
  });

  // ── 라운드 초기화 ──
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

  // ── 버저 항목 삭제 ──
  socket.on('removeBuzz', ({ index }) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    if (index >= 0 && index < room.buzzes.length) {
      room.buzzes.splice(index, 1);
      room.buzzes.forEach((b, i) => (b.order = i + 1));
      broadcastBuzzUpdate(code);
    }
  });

  // ── 디자인 브로드캐스트 (전역 - 모든 접속자에게 공유) ──
  socket.on('designUpdate', (design) => {
    // base64 이미지 차단
    const safeDesign = { ...design };
    ['bgImagePc','bgImageMobile','logo','icon','bgUrlPc','bgUrlMobile','logoUrl','iconUrl'].forEach(key => {
      if (safeDesign[key] && String(safeDesign[key]).startsWith('data:')) delete safeDesign[key];
    });

    globalDesign = safeDesign;
    saveGlobalDesign(safeDesign); // 파일에 저장 → 서버 재시작해도 유지

    // 나를 제외한 모든 접속자에게 전파 (다른 기기 호스트 포함)
    socket.broadcast.emit('designUpdate', safeDesign);

    // 방 디자인에도 저장
    const code = socket.data.roomCode;
    if (code) {
      const room = rooms.get(code);
      if (room) room.design = safeDesign;
    }
  });

  // ── 전역 디자인 조회 ──
  socket.on('getGlobalDesign', () => {
    if (globalDesign) socket.emit('designUpdate', globalDesign);
  });

  // ── 잠금 토글 ──
  socket.on('toggleLock', () => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    room.locked = !room.locked;
    io.to(code).emit('lockUpdate', { locked: room.locked });
  });

  // ── 참가자 강퇴 ──
  socket.on('kickPlayer', ({ nickname }) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== 'host') return;
    const room = rooms.get(code);
    if (!room) return;
    for (const [sid, p] of room.players.entries()) {
      if (p.nickname === nickname) {
        room.players.delete(sid);
        room.buzzes = room.buzzes.filter(b => b.nickname !== nickname);
        const target = io.sockets.sockets.get(sid);
        if (target) { target.emit('kicked'); target.leave(code); }
      }
    }
    broadcastPlayerList(code);
    broadcastBuzzUpdate(code);
  });

  // ── 연결 해제 ──
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.data.role === 'player') {
      room.players.delete(socket.id);
      broadcastPlayerList(code);
      // 세션은 유지해서 재접속 가능하게 함
    }
  });
});

// ── XLSX 내보내기 ──
app.get('/export/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) { res.status(404).send('방을 찾을 수 없습니다.'); return; }

  const byRound = {};
  room.history.forEach(h => { if (!byRound[h.round]) byRound[h.round] = []; byRound[h.round].push(h); });
  const rounds = Object.keys(byRound).map(Number).sort((a,b) => a-b);

  function xmlEsc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function makeSheet(rows) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
    rows.forEach((row,ri) => {
      xml += `<row r="${ri+1}">`;
      row.forEach((cell,ci) => { const ref=`${String.fromCharCode(65+ci)}${ri+1}`; xml += `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(cell)}</t></is></c>`; });
      xml += `</row>`;
    });
    xml += `</sheetData></worksheet>`;
    return xml;
  }

  const header = ['순서','닉네임','답안','제출시각'];
  const sheetDefs = rounds.length === 0
    ? [{ name:'라운드 1', rows:[header] }]
    : rounds.map(r => ({ name:`라운드 ${r}`, rows:[header, ...byRound[r].map(h=>[h.order,h.nickname,h.answer,new Date(h.time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false })])] }));

  function toBytes(str) { return Buffer.from(str,'utf8'); }
  function crc32(buf) {
    let crc=0xFFFFFFFF;
    const t=crc32.t||(crc32.t=(()=>{const t=[];for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}return t;})());
    for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xFF]^(crc>>>8);
    return(crc^0xFFFFFFFF)>>>0;
  }
  function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
  function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
  function zipEntry(fn,data){const fb=Buffer.from(fn,'utf8'),crc=crc32(data),loc=Buffer.concat([Buffer.from([0x50,0x4B,0x03,0x04]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(fb.length),u16(0),fb,data]);return{loc,fb,crc,size:data.length};}

  const ctXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetDefs.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const relsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wbRelsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetDefs.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`;
  const wbXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetDefs.map((s,i)=>`<sheet name="${xmlEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;

  const files=[{name:'[Content_Types].xml',data:toBytes(ctXml)},{name:'_rels/.rels',data:toBytes(relsXml)},{name:'xl/workbook.xml',data:toBytes(wbXml)},{name:'xl/_rels/workbook.xml.rels',data:toBytes(wbRelsXml)},...sheetDefs.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:toBytes(makeSheet(s.rows))}))];
  const entries=files.map(f=>({...zipEntry(f.name,f.data),name:f.name}));
  let off=0; const locs=[],offs=[];
  entries.forEach(e=>{offs.push(off);locs.push(e.loc);off+=e.loc.length;});
  const cd=Buffer.concat(entries.map((e,i)=>Buffer.concat([Buffer.from([0x50,0x4B,0x01,0x02]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(e.crc),u32(e.size),u32(e.size),u16(e.fb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offs[i]),e.fb])));
  const eocd=Buffer.concat([Buffer.from([0x50,0x4B,0x05,0x06]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cd.length),u32(off),u16(0)]);
  const xlsx=Buffer.concat([...locs,cd,eocd]);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(`quiz_results_${code}.xlsx`)}`);
  res.send(xlsx);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Quiz buzzer server running on port ${PORT}`));
