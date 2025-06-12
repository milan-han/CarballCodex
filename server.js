const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const rooms = {};
const waitingQueue = [];

function joinRoom(socket, roomId){
  if(!rooms[roomId]) rooms[roomId] = {players: [], ready:[false,false]};
  const room = rooms[roomId];
  if(room.players.length >= 2){
    socket.emit('full');
    return false;
  }
  socket.roomId = roomId;
  room.players.push(socket);
  socket.playerIndex = room.players.length - 1;
  socket.emit('assignPlayer', socket.playerIndex + 1);
  if(room.players.length === 2){
    room.players.forEach(s=>s.emit('bothJoined'));
  }
  return true;
}

io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    joinRoom(socket, roomId);
  });

  socket.on('queue', () => {
    waitingQueue.push(socket);
    if(waitingQueue.length >= 2){
      const p1 = waitingQueue.shift();
      const p2 = waitingQueue.shift();
      const roomId = Math.random().toString(36).substr(2,6);
      joinRoom(p1, roomId);
      joinRoom(p2, roomId);
      p1.emit('matchFound', roomId);
      p2.emit('matchFound', roomId);
    }
  });

  socket.on('ready', () => {
    const room = rooms[socket.roomId];
    if(!room) return;
    room.ready[socket.playerIndex] = true;
    room.players.forEach(s=>s.emit('readyState', room.ready));
    if(room.ready[0] && room.ready[1]){
      room.players.forEach(s=>s.emit('startGame'));
    }
  });

  socket.on('input', (data) => {
    const room = rooms[socket.roomId];
    if(!room) return;
    room.players.forEach(s=>{
      if(s !== socket) s.emit('input', data);
    });
  });

  socket.on('state', (state) => {
    const room = rooms[socket.roomId];
    if(!room) return;
    room.players.forEach(s=>{
      if(s !== socket) s.emit('state', state);
    });
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if(room){
      room.players = room.players.filter(p=>p!==socket);
      room.ready = [false,false];
      room.players.forEach(s=>s.emit('peerDisconnect'));
      if(room.players.length === 0) delete rooms[socket.roomId];
    }
    const idx = waitingQueue.indexOf(socket);
    if(idx !== -1) waitingQueue.splice(idx,1);
  });
});

http.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
