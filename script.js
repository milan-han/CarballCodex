        /* ================================
         *  Enhanced Retro Racer
         * ================================*/

        // ----- Canvas Setup -----
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

        // Scale the canvas up using CSS for a chunky pixel look
        const PIXEL_SCALE = 1.2;
        canvas.style.width = canvas.width * PIXEL_SCALE + "px";
canvas.style.height = canvas.height * PIXEL_SCALE + "px";

// ----- Networking -----
const socket = io();
let playerNum = 0;
let isHost = false;
let myCodes = [];
let gameStarted = false;
let room = new URLSearchParams(window.location.search).get('room');
if(!room){
    room = Math.random().toString(36).substr(2,6);
    window.location.search = '?room=' + room;
}
document.getElementById('roomInfo').textContent = 'Share this link: ' + window.location.href;
socket.emit('join', room);

        // ----- Game State -----
        let gameState = "title"; // "title", "playing"
        let lapStartTime = Date.now();

        // Soccer game state
        let scoreP1 = 0;
        let scoreP2 = 0;
        // Celebration state
        let celebrating = false;
        let confetti = [];
        let celebrateTimer = 0;
        const CELEBRATION_MS = 1500;

        // ----- Input Handling -----
        const keys = {};
        window.addEventListener("keydown", (e) => {
            keys[e.code] = true;
            if(myCodes.includes(e.code)) socket.emit('input',{code:e.code,value:true});
            if (e.code === "Escape" && gameState === "playing") {
                returnToTitle();
            }
        });
        window.addEventListener("keyup", (e) => {
            keys[e.code] = false;
            if(myCodes.includes(e.code)) socket.emit('input',{code:e.code,value:false});
        });

        // ----- UI Functions -----
        function ensureLoops(){
            if(gameStarted) return;
            gameStarted = true;
            if(isHost) gameLoop(); else renderLoop();
        }

        function startGame() {
            gameState = "playing";
            document.getElementById("titleScreen").classList.add("hidden");
            document.getElementById("gameUI").classList.remove("hidden");
            lapStartTime = Date.now();
            scoreP1 = scoreP2 = 0;
            updateUI();
            ensureLoops();
        }

        function returnToTitle() {
            gameState = "title";
            document.getElementById("titleScreen").classList.remove("hidden");
            document.getElementById("gameUI").classList.add("hidden");
            // Reset car position
            player.x = 400;
            player.y = 500;
            player.vx = 0;
            player.vy = 0;
            player.heading = -Math.PI / 2;
        }

        function updateUI() {
            const speed = Math.hypot(player.vx, player.vy);
            document.getElementById("speedometer").textContent = Math.round(speed * 15);
            
            const elapsed = (Date.now() - lapStartTime) / 1000;
            const minutes = Math.floor(elapsed / 60);
            const seconds = (elapsed % 60).toFixed(1);
            document.getElementById("lapTime").textContent = 
                `${minutes.toString().padStart(2, "0")}:${seconds.padStart(4, "0")}`;
            
            document.getElementById("driftMeter").textContent = Math.round(player.driftAmount);
            document.getElementById("hudP1").textContent = scoreP1;
            document.getElementById("hudP2").textContent = scoreP2;
            document.getElementById("topP1").textContent = scoreP1;
            document.getElementById("topP2").textContent = scoreP2;
        }

        // ----- Enhanced Car with Drifting -----
        class Car {
            constructor(x, y, color, controls) {
                this.x = x;
                this.y = y;
                this.heading = -Math.PI / 2;

                // Physics
                this.vx = 0;
                this.vy = 0;
                this.acceleration = 0.15;
                this.maxSpeed = 6;
                this.friction = 0.03;
                this.turnSpeed = 0.05;
                
                // Drift mechanics
                this.gripLevel = 0.85; // How much car grips vs slides
                this.driftAmount = 0; // Visual drift indicator
                this.handbrake = false;
                // Dimensions for drawing
                this.w = 14; // car width
                this.h = 24; // car length

                this.color = color;
                this.controls = controls;
            }

            update() {
                if (gameState !== "playing") return;

                // Capture previous handbrake state then update current
                const prevHandbrake = this.handbrake;
                this.handbrake = keys[this.controls.brake];

                // === Convert world velocity to car-local coordinates ===
                const cos = Math.cos(this.heading);
                const sin = Math.sin(this.heading);
                let forward = this.vx * cos + this.vy * sin;      // velocity along heading
                let lateral = -this.vx * sin + this.vy * cos;     // sideways velocity (drift component)

                // === Throttle & Brake ===
                if (keys[this.controls.forward]) forward += this.acceleration;
                if (keys[this.controls.back])    forward -= this.acceleration * 0.8;

                // === Steering ===
                let steerInput = 0;
                if (keys[this.controls.left])  steerInput = -1;
                else if (keys[this.controls.right]) steerInput = 1;

                // Turn rate grows with speed for tighter feel
                let turnRate = steerInput * this.turnSpeed * (Math.abs(forward) / 2 + 0.3);
                if (forward < 0) turnRate = -turnRate; // invert steering when reversing
                this.heading += turnRate;

                // === Handbrake & Drift Physics ===
                const forwardFriction = 0.02;                        // always present
                const sideFriction = this.handbrake ? 0.03 : 0.3;     // VERY grippy unless handbrake pressed

                forward *= (1 - forwardFriction);
                lateral *= (1 - sideFriction);

                // Drift indicator based on lateral slip
                const slip = Math.abs(lateral);
                this.driftAmount = Math.min(slip * 25, 100);

                // --- Drift particle effects ---
                if (this.handbrake && slip > 0.4) {
                    // tyre marks
                    tyreMarks.push({ x: this.x, y: this.y, life: 200 });
                    // smoke
                    smoke.push({ x: this.x - cos*15, y: this.y - sin*15, vy: -0.5+Math.random()*-0.5, vx:(Math.random()-0.5)*0.5, life:60, alpha:1 });
                    // accumulate drift charge
                    this.driftCharge = (this.driftCharge || 0) + 1;
                    if (this.driftCharge > 60) {
                        // continuous sparks after holding drift > 1s
                        for (let s=0; s<2; s++) {
                            sparks.push({ x: this.x - cos*14, y: this.y - sin*14, vx:(Math.random()-0.5)*4, vy:(Math.random()-1.5)*4, life:30 });
                        }
                    }
                    // flame when boost ready
                    if(this.driftCharge > 60){
                        flames.push({ x: this.x - cos*18, y: this.y - sin*18, vx:-cos*0.2, vy:-sin*0.2, life:20, max:20 });
                    }
                } else {
                    // if we just released after long drift, give boost
                    if (prevHandbrake && !this.handbrake && (this.driftCharge||0) > 60) {
                        forward += 4; // boost
                        for(let f=0; f<30; f++){
                            flames.push({ x: this.x, y: this.y, vx:(Math.random()-0.5)*3, vy:(Math.random()-0.5)*3, life:25, max:25 });
                        }
                    }
                    this.driftCharge = 0;
                }

                // === Convert back to world velocity ===
                this.vx =  cos * forward - sin * lateral;
                this.vy =  sin * forward + cos * lateral;

                // === Speed cap ===
                const speed = Math.hypot(this.vx, this.vy);
                if (speed > this.maxSpeed) {
                    this.vx *= this.maxSpeed / speed;
                    this.vy *= this.maxSpeed / speed;
                }

                // === Update position ===
                this.x += this.vx;
                this.y += this.vy;

                // Track / canvas bounds
                this.checkTrackBounds();
            }

            checkTrackBounds() {
                // Simple boundary check - slow down if hitting grass
                if (!this.isOnTrack()) {
                    this.vx *= 0.8;
                    this.vy *= 0.8;
                }
                
                // Keep in canvas bounds
                if (this.x < 20) { this.x = 20; this.vx = Math.abs(this.vx) * 0.5; }
                if (this.x > canvas.width - 20) { this.x = canvas.width - 20; this.vx = -Math.abs(this.vx) * 0.5; }
                if (this.y < 20) { this.y = 20; this.vy = Math.abs(this.vy) * 0.5; }
                if (this.y > canvas.height - 20) { this.y = canvas.height - 20; this.vy = -Math.abs(this.vy) * 0.5; }
            }

            isOnTrack() {
                // Whole canvas is playable field now
                return true;
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.heading);

                // Car body main
                ctx.fillStyle = this.color;
                ctx.fillRect(-this.h / 2, -this.w / 2, this.h, this.w);
                // Roof
                ctx.fillStyle = "#e57373";
                ctx.fillRect(-this.h/4, -this.w/4, this.h/2, this.w/2);
                // Front bumper
                ctx.fillStyle = "#b71c1c";
                ctx.fillRect(this.h/2-2, -this.w/2, 2, this.w);

                // Car details
                ctx.fillStyle = "#222";
                ctx.fillRect(2, -this.w / 2 + 2, this.h / 3, this.w - 4); // Windshield
                
                // Wheels
                ctx.fillStyle = "#111";
                ctx.fillRect(-this.h / 2 + 3, -this.w / 2 - 1, 4, 2);
                ctx.fillRect(-this.h / 2 + 3, this.w / 2 - 1, 4, 2);
                ctx.fillRect(this.h / 2 - 7, -this.w / 2 - 1, 4, 2);
                ctx.fillRect(this.h / 2 - 7, this.w / 2 - 1, 4, 2);

                // Drift effect
                if (this.driftAmount > 30) {
                    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(-this.h / 2 - 5 - i * 3, -2, 3, 1);
                    }
                }

                ctx.restore();
            }
        }

        // ----- Soccer Ball -----
        class Ball {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.r = 12;
                this.vx = 0;
                this.vy = 0;
            }

            update() {
                // Apply friction
                this.vx *= 0.98;
                this.vy *= 0.98;

                // Update position
                this.x += this.vx;
                this.y += this.vy;

                // Bounce off field boundaries, allowing for goals
                const goalH = 120;
                const goalTop = (canvas.height - goalH) / 2;
                const goalBottom = goalTop + goalH;
                const inGoalMouthY = this.y > goalTop && this.y < goalBottom;

                if (this.x - this.r < 20 && !inGoalMouthY) { this.x = 20 + this.r; this.vx *= -0.6; }
                if (this.x + this.r > canvas.width - 20 && !inGoalMouthY) { this.x = canvas.width - 20 - this.r; this.vx *= -0.6; }
                if (this.y - this.r < 20) { this.y = 20 + this.r; this.vy *= -0.6; }
                if (this.y + this.r > canvas.height - 20) { this.y = canvas.height - 20 - this.r; this.vy *= -0.6; }
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(0, 0, this.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }
        }

        // ----- Field Drawing -----
        function drawField() {
            ctx.fillStyle = "#2d5a2d"; // grass
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Field lines
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4;
            ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40); // outer lines

            // Halfway line
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 20);
            ctx.lineTo(canvas.width / 2, canvas.height - 20);
            ctx.stroke();

            // Center circle
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
            ctx.stroke();

            // Goals
            const goalH = 120;
            // left goal tinted red
            ctx.fillStyle = "rgba(198,40,40,0.4)";
            ctx.fillRect(20, (canvas.height - goalH) / 2, 10, goalH);
            // right goal tinted blue
            ctx.fillStyle = "rgba(41,98,255,0.4)";
            ctx.fillRect(canvas.width - 30, (canvas.height - goalH) / 2, 10, goalH);
        }

        // ----- Initialize Entities -----
        // Control maps
        const player1Controls = { forward:"KeyW", back:"KeyS", left:"KeyA", right:"KeyD", brake:"Space" };
        const player2Controls = { forward:"ArrowUp", back:"ArrowDown", left:"ArrowLeft", right:"ArrowRight", brake:"ShiftRight" };

        const player  = new Car(100, canvas.height / 2, "#c62828", player1Controls);
        const player2 = new Car(canvas.width - 100, canvas.height / 2, "#2962ff", player2Controls);

        const players = [player, player2];

        let ball = new Ball(canvas.width / 2, canvas.height / 2);

        function resetBall() {
            ball.x = canvas.width / 2;
            ball.y = canvas.height / 2;
            ball.vx = 0;
            ball.vy = 0;
        }

        function startCelebration(goalSide) {
            celebrating = true;
            celebrateTimer = 0;
            if(goalSide === "left") scoreP2 += 1; else scoreP1 += 1;
            if(scoreP1 >= 10 || scoreP2 >= 10){
                alert('Game Over! ' + (scoreP1>scoreP2? 'Player 1':'Player 2') + ' wins');
                scoreP1 = scoreP2 = 0;
            }
            updateUI();

            // push all cars away from goal direction
            players.forEach(car=>{
               car.vx = goalSide === "left" ? 1 : -1 * 10;
               car.vy = (Math.random()*2-1)*6;
            });

            // Confetti particles
            confetti = [];
            const originX = ball.x;
            const originY = ball.y;
            for (let i = 0; i < 150; i++) {
                confetti.push({
                    x: originX,
                    y: originY,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8 - 3,
                    color: `hsl(${Math.random()*360}, 80%, 60%)`,
                    life: Math.random() * 60 + 40
                });
            }
        }

        function detectGoal() {
            const goalH = 120;
            const goalTop = (canvas.height - goalH) / 2;
            const goalBottom = goalTop + goalH;

            if (celebrating) return; // ignore during celebration

            // Left goal scored
            if (ball.x - ball.r <= 20 && ball.y >= goalTop && ball.y <= goalBottom) {
                startCelebration("left");
            }
            // Right goal scored
            if (ball.x + ball.r >= canvas.width - 20 && ball.y >= goalTop && ball.y <= goalBottom) {
                startCelebration("right");
            }
        }

        function handleCarBallCollision(car) {
            const dx = ball.x - car.x;
            const dy = ball.y - car.y;
            const dist = Math.hypot(dx, dy);
            const minDist = ball.r + Math.max(car.w, car.h) / 2;
            if (dist < minDist) {
                const overlap = minDist - dist + 0.1;
                const nx = dx / dist;
                const ny = dy / dist;
                // Push ball out of collision
                ball.x += nx * overlap;
                ball.y += ny * overlap;
                // Apply impulse based on car velocity
                ball.vx += car.vx * 0.5 + nx * 2;
                ball.vy += car.vy * 0.5 + ny * 2;
                return true;
            }
            return false;
        }

        function updateConfetti() {
            for (let i = confetti.length - 1; i >= 0; i--) {
                const p = confetti[i];
                p.vy += 0.15; // gravity
                p.x += p.vx;
                p.y += p.vy;
                p.life--;
                if (p.life <= 0) confetti.splice(i, 1);
            }
        }

        function drawConfetti() {
            confetti.forEach(p => {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 3, 3);
            });
        }

        // Add new function below handleCarBallCollision
        function handleCarCarCollisions() {
            for (let i = 0; i < players.length; i++) {
                for (let j = i + 1; j < players.length; j++) {
                    const a = players[i];
                    const b = players[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy);
                    const ra = Math.max(a.w, a.h) / 2;
                    const rb = Math.max(b.w, b.h) / 2;
                    const minDist = ra + rb;
                    if (dist < minDist && dist !== 0) {
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const overlap = minDist - dist;

                        // Separate cars
                        a.x -= nx * overlap / 2;
                        a.y -= ny * overlap / 2;
                        b.x += nx * overlap / 2;
                        b.y += ny * overlap / 2;

                        // Simple elastic impulse
                        const relVx = a.vx - b.vx;
                        const relVy = a.vy - b.vy;
                        const relDot = relVx * nx + relVy * ny;
                        if (relDot < 0) {
                            const restitution = 0.8;
                            const impulse = -(1 + restitution) * relDot / 2;
                            a.vx += nx * impulse;
                            a.vy += ny * impulse;
                            b.vx -= nx * impulse;
                            b.vy -= ny * impulse;
                        }
                    }
                }
            }
        }

        // ----- Setup & Game Loop -----
        function gameLoop() {
            // Clear and draw
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawField();
            
            if(isHost) {
                ball.update();

                if (!celebrating) {
                    // Normal gameplay for all cars
                    const hits = [];
                    players.forEach(car=>{
                        car.update();
                        if (handleCarBallCollision(car)) hits.push(car);
                    });
                // If multiple cars hit in same frame, apply recoil to each
                if (hits.length > 1) {
                    hits.forEach(car=>{
                        const dx = car.x - ball.x;
                        const dy = car.y - ball.y;
                        const dist = Math.hypot(dx, dy) || 1;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        car.vx += nx * 4;
                        car.vy += ny * 4;
                     });
                }
                handleCarCarCollisions();
                detectGoal();
                updateAllParticles();
            } else {
                // Celebration physics
                celebrateTimer += 16; // approximate ms per frame
                // Move exploding car (player 1)
                player.x += player.vx;
                player.y += player.vy;
                player.vx *= 0.95;
                player.vy *= 0.95;

                updateConfetti();
                updateAllParticles();

                if (celebrateTimer >= CELEBRATION_MS) {
                    celebrating = false;
                    resetBall();
                    // Reset both cars to their side positions
                    player.x = 100;
                    player.y = canvas.height / 2;
                    player.vx = player.vy = 0;
                    player.heading = 0;

                    player2.x = canvas.width - 100;
                    player2.y = canvas.height / 2;
                    player2.vx = player2.vy = 0;
                    player2.heading = Math.PI;
                }
            }
            if(isHost) sendState();
            updateUI();
            
            drawTyreMarks();
            players.forEach(car=>car.draw());
            drawFlames();
            ball.draw();
            drawConfetti();

            requestAnimationFrame(gameLoop);
        }

        // ----- Particle Updates -----
        let smoke = [];
        let tyreMarks = [];
        let sparks = [];
        let flames = [];

        function updateParticles(arr) {
            for (let i = arr.length-1; i>=0; i--) {
                const p = arr[i];
                p.x += p.vx || 0;
                p.y += p.vy || 0;
                p.life--;
                if (p.alpha!==undefined) p.alpha = p.life/60;
                if (p.life<=0) arr.splice(i,1);
            }
        }

        function drawSmoke() {
            smoke.forEach(p=> {
                ctx.fillStyle = `rgba(200,200,200,${p.alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
                ctx.fill();
            });
        }

        function drawTyreMarks() {
            tyreMarks.forEach(t=> {
                ctx.strokeStyle = `rgba(50,50,50,${t.life/200})`;
                ctx.lineWidth =2;
                ctx.beginPath();
                ctx.moveTo(t.x, t.y);
                ctx.lineTo(t.x+1, t.y+1);
                ctx.stroke();
            });
        }

        function drawSparks() {
            sparks.forEach(s=> {
                ctx.fillStyle = `rgba(255,${200+Math.random()*55|0},0,${s.life/30})`;
                ctx.fillRect(s.x, s.y,2,2);
            });
        }

        function drawFlames() {
            flames.forEach(f=>{
                const a = f.life / f.max;
                ctx.fillStyle = `rgba(255,${150+Math.random()*80|0},0,${a})`;
                ctx.beginPath();
                ctx.arc(f.x, f.y, 5*(a), 0, Math.PI*2);
                ctx.fill();
            });
        }

        function updateAllParticles() {
            updateParticles(smoke);
            updateParticles(tyreMarks);
            updateParticles(sparks);
            updateParticles(flames);
        }

        // Networking event handlers
        socket.on('assignPlayer', num => {
            playerNum = num;
            isHost = num === 1;
            myCodes = Object.values(isHost ? player1Controls : player2Controls);
        });

        socket.on('bothJoined', () => {
            document.getElementById('lobby').classList.remove('hidden');
        });

        socket.on('readyState', (state) => {
            if(state[playerNum-1]) document.getElementById('readyBtn').textContent = 'WAITING';
        });

        socket.on('startGame', () => {
            document.getElementById('lobby').classList.add('hidden');
            startGame();
        });

        socket.on('input', data => {
            if(isHost) keys[data.code] = data.value;
        });

        socket.on('state', data => {
            if(!isHost) applyState(data);
        });

        socket.on('peerDisconnect', () => {
            alert('Other player disconnected');
            location.reload();
        });

        function readyUp(){
            socket.emit('ready');
            document.getElementById('readyBtn').disabled = true;
        }

        function sendState(){
            const state = {
                p1:{x:player.x,y:player.y,h:player.heading},
                p2:{x:player2.x,y:player2.y,h:player2.heading},
                ball:{x:ball.x,y:ball.y},
                scoreP1,scoreP2
            };
            socket.emit('state', state);
        }

        function applyState(s){
            player.x=s.p1.x; player.y=s.p1.y; player.heading=s.p1.h;
            player2.x=s.p2.x; player2.y=s.p2.y; player2.heading=s.p2.h;
            ball.x=s.ball.x; ball.y=s.ball.y;
            scoreP1=s.scoreP1; scoreP2=s.scoreP2;
        }

        function renderLoop(){
            ctx.clearRect(0,0,canvas.width,canvas.height);
            drawField();
            updateUI();
            players.forEach(car=>car.draw());
            ball.draw();
            requestAnimationFrame(renderLoop);
        }
