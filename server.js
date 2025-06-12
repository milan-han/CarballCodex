const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const rooms = {};
const waitingQueue = [];

// --- Simple physics classes ---
class Car {
  constructor(x, y, controls) {
    this.x = x;
    this.y = y;
    this.heading = -Math.PI/2;
    this.vx = 0;
    this.vy = 0;
    this.controls = controls;
    this.acceleration = 0.15;
    this.maxSpeed = 6;
    this.turnSpeed = 0.05;
    this.handbrake = false;
  }

  update(dt, input) {
    const scale = dt/16.6667;
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    let forward = this.vx * cos + this.vy * sin;
    let lateral = -this.vx * sin + this.vy * cos;

    if(input[this.controls.forward]) forward += this.acceleration*scale;
    if(input[this.controls.back])    forward -= this.acceleration*0.8*scale;

    let steer = 0;
    if(input[this.controls.left]) steer=-1;
    else if(input[this.controls.right]) steer=1;
    let turnRate = steer*this.turnSpeed*(Math.abs(forward)/2+0.3)*scale;
    if(forward<0) turnRate=-turnRate;
    this.heading += turnRate;

    this.handbrake = input[this.controls.brake];
    const fFric = 0.02;
    const sFric = this.handbrake?0.03:0.3;
    forward *= (1 - fFric*scale);
    lateral *= (1 - sFric*scale);

    this.vx = cos*forward - sin*lateral;
    this.vy = sin*forward + cos*lateral;

    const speed = Math.hypot(this.vx,this.vy);
    if(speed>this.maxSpeed){
      this.vx*=this.maxSpeed/speed;
      this.vy*=this.maxSpeed/speed;
    }

    this.x += this.vx*scale;
    this.y += this.vy*scale;

    if(this.x<20){this.x=20;this.vx=Math.abs(this.vx)*0.5;}
    if(this.x>800-20){this.x=800-20;this.vx=-Math.abs(this.vx)*0.5;}
    if(this.y<20){this.y=20;this.vy=Math.abs(this.vy)*0.5;}
    if(this.y>600-20){this.y=600-20;this.vy=-Math.abs(this.vy)*0.5;}
  }
}

class Ball {
  constructor(x,y){
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.r=12;
  }
  update(dt){
    const scale = dt/16.6667;
    this.vx*=Math.pow(0.98,scale);
    this.vy*=Math.pow(0.98,scale);
    this.x+=this.vx*scale;
    this.y+=this.vy*scale;
    const goalH=120;
    const goalTop=(600-goalH)/2;
    const goalBottom=goalTop+goalH;
    const inGoal=this.y>goalTop && this.y<goalBottom;
    if(this.x-this.r<20 && !inGoal){this.x=20+this.r;this.vx*=-0.6;}
    if(this.x+this.r>800-20 && !inGoal){this.x=800-20-this.r;this.vx*=-0.6;}
    if(this.y-this.r<20){this.y=20+this.r;this.vy*=-0.6;}
    if(this.y+this.r>600-20){this.y=600-20-this.r;this.vy*=-0.6;}
  }
}

function joinRoom(socket, roomId){
  if(!rooms[roomId]) {
    const controls1 = {forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',brake:'Space'};
    const controls2 = {forward:'ArrowUp',back:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',brake:'ShiftRight'};
    rooms[roomId] = {
      players: [],
      ready:[false,false],
      inputs:[{},{}],
      cars:[new Car(100,300,controls1), new Car(700,300,controls2)],
      ball:new Ball(400,300),
      scoreP1:0,
      scoreP2:0,
      lastTime:Date.now()
    };
  }
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

function handleCarBall(room, car){
  const ball = room.ball;
  const dx = ball.x - car.x;
  const dy = ball.y - car.y;
  const dist = Math.hypot(dx,dy);
  const minDist = ball.r + 12;
  if(dist < minDist){
    const overlap = minDist - dist + 0.1;
    const nx = dx / (dist||1);
    const ny = dy / (dist||1);
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    ball.vx += car.vx*0.5 + nx*2;
    ball.vy += car.vy*0.5 + ny*2;
  }
}

function detectGoal(room){
  const ball = room.ball;
  const goalH=120;
  const goalTop=(600-goalH)/2;
  const goalBottom=goalTop+goalH;
  if(ball.x - ball.r <= 20 && ball.y>=goalTop && ball.y<=goalBottom){
    room.scoreP2 +=1; resetAfterGoal(room,'left');
  }
  if(ball.x + ball.r >= 800-20 && ball.y>=goalTop && ball.y<=goalBottom){
    room.scoreP1 +=1; resetAfterGoal(room,'right');
  }
}

function resetAfterGoal(room){
  room.ball.x=400; room.ball.y=300; room.ball.vx=0; room.ball.vy=0;
  room.cars[0].x=100; room.cars[0].y=300; room.cars[0].vx=room.cars[0].vy=0; room.cars[0].heading=-Math.PI/2;
  room.cars[1].x=700; room.cars[1].y=300; room.cars[1].vx=room.cars[1].vy=0; room.cars[1].heading=-Math.PI/2;
}

function gameTick(roomId){
  const room = rooms[roomId];
  if(!room) return;
  const now = Date.now();
  const dt = now - room.lastTime;
  room.lastTime = now;
  room.cars[0].update(dt, room.inputs[0]);
  room.cars[1].update(dt, room.inputs[1]);
  handleCarBall(room, room.cars[0]);
  handleCarBall(room, room.cars[1]);
  room.ball.update(dt);
  detectGoal(room);
  const state = {
    p1:{x:room.cars[0].x,y:room.cars[0].y,h:room.cars[0].heading},
    p2:{x:room.cars[1].x,y:room.cars[1].y,h:room.cars[1].heading},
    ball:{x:room.ball.x,y:room.ball.y},
    scoreP1:room.scoreP1,scoreP2:room.scoreP2
  };
  io.to(roomId).emit('state', state);
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
      room.lastTime = Date.now();
      room.interval = setInterval(()=>gameTick(socket.roomId), 1000/60);
    }
  });

  socket.on('input', (data) => {
    const room = rooms[socket.roomId];
    if(!room) return;
    room.inputs[socket.playerIndex][data.code] = data.value;
  });


  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if(room){
      room.players = room.players.filter(p=>p!==socket);
      room.ready = [false,false];
      room.players.forEach(s=>s.emit('peerDisconnect'));
      if(room.players.length === 0){
        clearInterval(room.interval);
        delete rooms[socket.roomId];
      }
    }
    const idx = waitingQueue.indexOf(socket);
    if(idx !== -1) waitingQueue.splice(idx,1);
  });
});

http.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
