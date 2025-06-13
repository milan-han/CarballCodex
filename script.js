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

function startGame() {
  socket = io({ query: { room } });

  socket.on('init', id => {
    myId = id;
  });

  socket.on('state', state => {
    ball = state.ball;
    for (const id of Object.keys(state.cars)) {
      if (!cars[id]) cars[id] = { x: 0, y: 0, h: 0 };
      cars[id].x = state.cars[id].x;
      cars[id].y = state.cars[id].y;
      cars[id].h = state.cars[id].h;
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
  ctx.fillRect(-12, -6, 24, 12);
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

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawField();
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
