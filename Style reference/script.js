const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const linkBox = document.getElementById('linkBox');
const generateBtn = document.getElementById('generateLink');
const shareArea = document.getElementById('shareArea');
const roomLink = document.getElementById('gameLink');

const params = new URLSearchParams(window.location.search);
let room = params.get('room');

let socket = null;
let myId = null;
let cars = {};
let ball = { x: 400, y: 300 };
const effects = {
  streaks: [],
  smokes: [],
  fires: []
};
let lastTime = performance.now();

function startGame() {
  socket = io({ query: { room } });

  socket.on('init', id => {
    myId = id;
  });

  socket.on('state', state => {
    ball = state.ball;
    for (const id of Object.keys(state.cars)) {
      if (!cars[id]) cars[id] = { x: 0, y: 0, h: 0 };
      const cstate = state.cars[id];
      cars[id].prevX = cars[id].x;
      cars[id].prevY = cars[id].y;
      cars[id].x = cstate.x;
      cars[id].y = cstate.y;
      cars[id].h = cstate.h;
      cars[id].hb = cstate.hb;
      cars[id].br = cstate.br;
      cars[id].bt = cstate.bt;
    }
    for (const id of Object.keys(cars)) {
      if (!state.cars[id]) delete cars[id];
    }
  });

  window.addEventListener('keydown', e => {
    socket.emit('input', { code: e.code, value: true });
  });
  window.addEventListener('keyup', e => {
    socket.emit('input', { code: e.code, value: false });
  });
}

function drawField() {
  ctx.fillStyle = '#2d5a2d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 20);
  ctx.lineTo(canvas.width / 2, canvas.height - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
  ctx.stroke();
  const goalH = 120;
  ctx.fillStyle = 'rgba(198,40,40,0.4)';
  ctx.fillRect(20, (canvas.height - goalH) / 2, 10, goalH);
  ctx.fillStyle = 'rgba(41,98,255,0.4)';
  ctx.fillRect(canvas.width - 30, (canvas.height - goalH) / 2, 10, goalH);
}

function drawCar(c, isMe) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.h);
  ctx.fillStyle = isMe ? '#c62828' : '#2962ff';
  ctx.fillRect(-12, -7, 24, 14);
  ctx.fillStyle = '#333';
  ctx.fillRect(-8, -5, 16, 6);
  ctx.fillStyle = '#555';
  ctx.fillRect(-10, -7, 4, 14);
  ctx.fillRect(6, -7, 4, 14);
  ctx.restore();
}

function drawBall() {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function updateEffects(dt) {
  for (const id of Object.keys(cars)) {
    const c = cars[id];
    const cos = Math.cos(c.h);
    const sin = Math.sin(c.h);
    const backX = c.x - cos * 12;
    const backY = c.y - sin * 12;
    if (c.hb) {
      effects.streaks.push({ x: backX, y: backY, life: 30 });
      effects.smokes.push({ x: backX, y: backY, r: 4, life: 20 });
    }
    if (c.br) {
      effects.fires.push({ x: backX, y: backY, r: 5, life: 15 });
    }
    if (c.bt) {
      for (let i = 0; i < 5; i++) {
        effects.fires.push({
          x: backX + (Math.random() - 0.5) * 8,
          y: backY + (Math.random() - 0.5) * 8,
          r: 6 + Math.random() * 4,
          life: 30
        });
      }
    }
  }
  effects.streaks.forEach(s => (s.life -= dt * 0.1));
  effects.streaks = effects.streaks.filter(s => s.life > 0);
  effects.smokes.forEach(s => {
    s.life -= dt * 0.1;
    s.r += dt * 0.02;
  });
  effects.smokes = effects.smokes.filter(s => s.life > 0);
  effects.fires.forEach(f => (f.life -= dt * 0.1));
  effects.fires = effects.fires.filter(f => f.life > 0);
}

function drawEffects() {
  effects.streaks.forEach(s => {
    ctx.strokeStyle = `rgba(0,0,0,${s.life / 30})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - 5, s.y - 5);
    ctx.stroke();
  });
  effects.smokes.forEach(s => {
    ctx.fillStyle = `rgba(200,200,200,${s.life / 20})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  effects.fires.forEach(f => {
    ctx.fillStyle = `rgba(255,120,0,${f.life / 30})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function loop() {
  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawField();
  updateEffects(dt);
  drawEffects();
  drawBall();
  for (const id of Object.keys(cars)) {
    drawCar(cars[id], id === myId);
  }
  requestAnimationFrame(loop);
}

loop();

if (room) {
  const url = window.location.origin + window.location.pathname + '?room=' + room;
  roomLink.textContent = url;
  roomLink.href = url;
  shareArea.classList.remove('hidden');
  generateBtn.classList.add('hidden');
  startGame();
} else {
  canvas.classList.add('hidden');
  generateBtn.addEventListener('click', () => {
    room = Math.random().toString(36).substr(2, 6);
    const url = window.location.origin + window.location.pathname + '?room=' + room;
    roomLink.textContent = url;
    roomLink.href = url;
    shareArea.classList.remove('hidden');
    generateBtn.classList.add('hidden');
  });
}
