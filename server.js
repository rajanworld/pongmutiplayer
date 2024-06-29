import http from 'http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  }
});

const PORT = process.env.PORT || 4000;

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 10;
const BALL_SIZE = 10; 
const PADDLE_SPEED = 5;

let gameSessions = {};

function initializeGame() {
  return {
    ball: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, speedX: 5, speedY: 5 },
    leftPaddle: { y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    rightPaddle: { y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    score: { left: 0, right: 0 },
    players: { left: null, right: null },
    isActive: false
  };
}

function updateGameState(gameId) {
  if (gameSessions[gameId] && gameSessions[gameId].isActive) {
    let gameState = gameSessions[gameId];

    // Update ball position
    gameState.ball.x += gameState.ball.speedX;
    gameState.ball.y += gameState.ball.speedY;

    // Ball collision with top and bottom walls
    if (gameState.ball.y <= 0 || gameState.ball.y >= GAME_HEIGHT - BALL_SIZE) {
      gameState.ball.speedY = -gameState.ball.speedY;
    }

    // Ball collision with paddles
    if (
      (gameState.ball.x <= PADDLE_WIDTH && gameState.ball.y + BALL_SIZE >= gameState.leftPaddle.y && gameState.ball.y <= gameState.leftPaddle.y + PADDLE_HEIGHT) ||
      (gameState.ball.x >= GAME_WIDTH - PADDLE_WIDTH - BALL_SIZE && gameState.ball.y + BALL_SIZE >= gameState.rightPaddle.y && gameState.ball.y <= gameState.rightPaddle.y + PADDLE_HEIGHT)
    ) {
      gameState.ball.speedX = -gameState.ball.speedX;
    }

    // Score points and reset ball if it goes past paddles
    if (gameState.ball.x <= 0) {
        gameState.score.right++;
        resetBall(gameState);
      } else if (gameState.ball.x >= GAME_WIDTH) {
        gameState.score.left++;
        resetBall(gameState);
      }
      

    io.to(gameId).emit('gameState', gameState);
  }
}

function resetBall(gameState) {
  gameState.ball.x = GAME_WIDTH / 2;
  gameState.ball.y = GAME_HEIGHT / 2;
  gameState.ball.speedX = Math.random() > 0.5 ? 5 : -5;
  gameState.ball.speedY = Math.random() > 0.5 ? 5 : -5;
}

setInterval(() => {
  Object.keys(gameSessions).forEach(updateGameState);
}, 16);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinGame', (gameId) => {
    console.log(`User ${socket.id} attempting to join game: ${gameId}`);

    if (typeof gameId !== 'string' || gameId.trim() === '') {
      console.log('Invalid game ID');
      socket.emit('error', 'Invalid game ID');
      return;
    }

    if (!gameSessions[gameId]) {
      console.log(`Creating new game session for ID: ${gameId}`);
      gameSessions[gameId] = initializeGame();
    }

    let game = gameSessions[gameId];
    let playerSide;

    if (!game.players.left) {
      playerSide = 'left';
      game.players.left = socket.id;
    } else if (!game.players.right) {
      playerSide = 'right';
      game.players.right = socket.id;
    } else {
      console.log(`Game ${gameId} is full, rejecting player ${socket.id}`);
      socket.emit('error', 'Game is full');
      return;
    }

    socket.join(gameId);
    console.log(`Player ${socket.id} assigned ${playerSide} side for game ID ${gameId}`);
    socket.emit('playerAssigned', { side: playerSide, gameId: gameId });

    if (game.players.left && game.players.right) {
      console.log(`Game ${gameId} is now full, starting the game`);
      game.isActive = true;
      io.to(gameId).emit('gameStart', game);
    } else {
      console.log(`Waiting for opponent in game ${gameId}`);
      socket.emit('waitingForOpponent');
    }
  });

  socket.on('movePaddle', (direction) => {
    Object.keys(gameSessions).forEach(gameId => {
      let game = gameSessions[gameId];
      if (game.players.left === socket.id) {
        if (direction === 'up' && game.leftPaddle.y > 0) {
          game.leftPaddle.y -= PADDLE_SPEED;
        } else if (direction === 'down' && game.leftPaddle.y < GAME_HEIGHT - PADDLE_HEIGHT) {
          game.leftPaddle.y += PADDLE_SPEED;
        }
      } else if (game.players.right === socket.id) {
        if (direction === 'up' && game.rightPaddle.y > 0) {
          game.rightPaddle.y -= PADDLE_SPEED;
        } else if (direction === 'down' && game.rightPaddle.y < GAME_HEIGHT - PADDLE_HEIGHT) {
          game.rightPaddle.y += PADDLE_SPEED;
        }
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    Object.keys(gameSessions).forEach(gameId => {
      let game = gameSessions[gameId];
      if (game.players.left === socket.id || game.players.right === socket.id) {
        io.to(gameId).emit('gameOver', 'Opponent disconnected');
        delete gameSessions[gameId];
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});