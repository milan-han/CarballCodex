const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// store separate game state for each room
const games = {}; // roomId -> game object

class Car {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.heading = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.acceleration = 0.15;
    this.maxSpeed = 6;
    this.turnSpeed = 0.05;
    this.handbrake = false;
    this.boostEnergy = 0;
    this.boostReady = false;
    this.boostCharging = false;
    this.boostTimer = 0;
  }

  update(dt, input) {
    const scale = dt / 16.6667;
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    let forward = this.vx * cos + this.vy * sin;
    let lateral = -this.vx * sin + this.vy * cos;

    if (input['ShiftLeft']) {
      this.boostCharging = true;
      this.boostEnergy += dt * 0.2;
      if (this.boostEnergy >= 100) {
        this.boostEnergy = 100;
        this.boostReady = true;
      }
    } else {
      if (this.boostCharging) {
        if (this.boostReady) {
          forward += 8;
          this.boostTimer = 10;
        }
        this.boostCharging = false;
        this.boostReady = false;
        this.boostEnergy = 0;
      }
    }

    if (this.boostTimer > 0) {
      this.boostTimer -= scale;
      if (this.boostTimer < 0) this.boostTimer = 0;
    }

    if (input['KeyW']) forward += this.acceleration * scale;
    if (input['KeyS']) forward -= this.acceleration * 0.8 * scale;

    let steer = 0;
    if (input['KeyA']) steer = -1;
    else if (input['KeyD']) steer = 1;
    let turnRate = steer * this.turnSpeed * (Math.abs(forward) / 2 + 0.3) * scale;
    if (forward < 0) turnRate = -turnRate;
    this.heading += turnRate;

    this.handbrake = input['Space'];
    const fFric = 0.02;
    const sFric = this.handbrake ? 0.03 : 0.3;
    forward *= 1 - fFric * scale;
    lateral *= 1 - sFric * scale;

    this.vx = cos * forward - sin * lateral;
    this.vy = sin * forward + cos * lateral;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.maxSpeed) {
      this.vx *= this.maxSpeed / speed;
      this.vy *= this.maxSpeed / speed;
    }

    this.x += this.vx * scale;
    this.y += this.vy * scale;

    if (this.x < 20) {
      this.x = 20;
      this.vx = Math.abs(this.vx) * 0.5;
    }
    if (this.x > 800 - 20) {
      this.x = 800 - 20;
      this.vx = -Math.abs(this.vx) * 0.5;
    }
    if (this.y < 20) {
      this.y = 20;
      this.vy = Math.abs(this.vy) * 0.5;
    }
    if (this.y > 600 - 20) {
      this.y = 600 - 20;
      this.vy = -Math.abs(this.vy) * 0.5;
    }
  }
}

class Ball {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = 12;
  }
  update(dt) {
    const scale = dt / 16.6667;
    this.vx *= Math.pow(0.98, scale);
    this.vy *= Math.pow(0.98, scale);
    this.x += this.vx * scale;
    this.y += this.vy * scale;
    const goalH = 120;
    const goalTop = (600 - goalH) / 2;
    const goalBottom = goalTop + goalH;
    const inGoal = this.y > goalTop && this.y < goalBottom;
    if (this.x - this.r < 20 && !inGoal) {
      this.x = 20 + this.r;
      this.vx *= -0.6;
    }
    if (this.x + this.r > 800 - 20 && !inGoal) {
      this.x = 800 - 20 - this.r;
      this.vx *= -0.6;
    }
    if (this.y - this.r < 20) {
      this.y = 20 + this.r;
      this.vy *= -0.6;
    }
    if (this.y + this.r > 600 - 20) {
      this.y = 600 - 20 - this.r;
      this.vy *= -0.6;
    }
  }
}

function handleCarBall(car, ball) {
  const dx = ball.x - car.x;
  const dy = ball.y - car.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ball.r + 12;
  if (dist < minDist) {
    const overlap = minDist - dist + 0.1;
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    ball.vx += car.vx * 0.5 + nx * 2;
    ball.vy += car.vy * 0.5 + ny * 2;
  }
}

function createGame(room) {
  return {
    room,
    cars: {}, // id -> Car
    inputs: {}, // id -> input map
    ball: new Ball(400, 300),
    lastTime: Date.now(),
    interval: null
  };
}

function gameTick(room) {
  const game = games[room];
  if (!game) return;
  const now = Date.now();
  const dt = now - game.lastTime;
  game.lastTime = now;
  for (const id of Object.keys(game.cars)) {
    const car = game.cars[id];
    car.update(dt, game.inputs[id] || {});
    handleCarBall(car, game.ball);
  }
  game.ball.update(dt);

  const state = {
    cars: {},
    ball: { x: game.ball.x, y: game.ball.y }
  };
  for (const [id, car] of Object.entries(game.cars)) {
    state.cars[id] = { x: car.x, y: car.y, h: car.heading, hb: car.handbrake, br: car.boostReady, bt: car.boostTimer > 0 };
  }
  io.to(room).emit('state', state);
}

io.on('connection', socket => {
  const room = socket.handshake.query.room;
  if (!room) {
    socket.disconnect();
    return;
  }

  socket.join(room);
  if (!games[room]) {
    games[room] = createGame(room);
  }
  const game = games[room];

  const spawnX = 100 + Math.random() * 600;
  const spawnY = 100 + Math.random() * 400;
  game.cars[socket.id] = new Car(spawnX, spawnY);
  game.inputs[socket.id] = {};
  socket.emit('init', socket.id);

  if (!game.interval) {
    game.lastTime = Date.now();
    game.interval = setInterval(() => gameTick(room), 1000 / 60);
  }

  socket.on('input', data => {
    if (game.inputs[socket.id]) {
      game.inputs[socket.id][data.code] = data.value;
    }
  });

  socket.on('disconnect', () => {
    delete game.cars[socket.id];
    delete game.inputs[socket.id];
    if (Object.keys(game.cars).length === 0) {
      clearInterval(game.interval);
      delete games[room];
    }
  });
});

http.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
