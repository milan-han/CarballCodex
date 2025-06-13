# Car Ball

This project is a small browser game. It now includes a basic online mode using Node.js and Socket.IO.

## Quick Start

1. Install dependencies with `npm install`.
2. Run the server using `npm start`.
3. Open `http://localhost:3000` in your browser.
4. Click **Generate Game Link** and copy the URL that appears.
5. Share that link with a friend so they can join the same room.
6. See the `Style reference` folder for a snapshot of the original single-player files.

## How to Play
1. Clone or download this repository.
2. Install dependencies and start the server (`npm install` then `npm start`).
3. Open `http://localhost:3000` in a browser.
4. Send the address to a friend so they can join your room.
5. Hold **Shift** to charge a boost. When the fire appears, release to launch forward!
6. Hold **Space** to drift and leave tire streaks.
7. Each player gets a unique car color shared with all others.

## Development
Development mainly happens inside `script.js` and `style.css`.

1. Edit `script.js` to modify the game logic.
2. Edit `style.css` to adjust visual styles.
3. For testing changes, run a local HTTP server (for example with `python3 -m http.server`) and navigate to `http://localhost:8000` in your browser. This avoids issues with local file permissions.
4. Refresh the browser to see your changes.

Have fun!
