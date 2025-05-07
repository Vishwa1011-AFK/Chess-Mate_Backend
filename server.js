const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Chess } = require("chess.js");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "https://chess-mate-one.vercel.app",
  credentials: true
}));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://chess-mate-one.vercel.app",
    methods: ["GET", "POST"],
    credentials: true
  },
});

const games = new Map();
const userGames = new Map();

function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startGameTimer(gameCode) {
  const game = games.get(gameCode);
  if (!game || game.timerInterval) return;

  game.lastMoveTime = Date.now();
  game.timerInterval = setInterval(() => updateGameTimer(gameCode, false), 1000);
  console.log(`Timer started for game ${gameCode}`);
}

function updateGameTimer(gameCode, turnSwitched = false) {
  const game = games.get(gameCode);
  if (!game || (game.chessGame && game.chessGame.isGameOver())) {
    if (game && game.timerInterval) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
    }
    return;
  }

  const now = Date.now();
  let elapsedSeconds = 0;

  if (game.lastMoveTime) {
    elapsedSeconds = Math.floor((now - game.lastMoveTime) / 1000);
  }

  const currentTurnColorFull = game.chessGame.turn() === "w" ? "white" : "black";

  if (turnSwitched) {
    const previousTurnColorFull = currentTurnColorFull === "white" ? "black" : "white";
    if (elapsedSeconds > 0) {
      game.timeLeft[previousTurnColorFull] = Math.max(
        0,
        game.timeLeft[previousTurnColorFull] - elapsedSeconds
      );
    }
  } else {
    if (elapsedSeconds >= 1) {
      game.timeLeft[currentTurnColorFull] = Math.max(
        0,
        game.timeLeft[currentTurnColorFull] - elapsedSeconds
      );
    }
  }

  game.lastMoveTime = now;

  if (game.timeLeft.white <= 0 || game.timeLeft.black <= 0) {
    checkGameOver(gameCode);
    return;
  }
  if (game.players.white) io.to(game.players.white).emit("timeUpdate", game.timeLeft);
  if (game.players.black) io.to(game.players.black).emit("timeUpdate", game.timeLeft);
}

function checkGameOver(gameCode) {
  const game = games.get(gameCode);
  if (!game) return;

  let gameOverReason = null;
  let fen = game.chessGame.fen();

  if (game.timeLeft.white <= 0) {
    gameOverReason = "Black wins: White out of time";
  } else if (game.timeLeft.black <= 0) {
    gameOverReason = "White wins: Black out of time";
  } else if (game.chessGame.isGameOver()) {
    if (game.chessGame.isCheckmate()) {
      gameOverReason = `Checkmate: ${
        game.chessGame.turn() === "w" ? "Black" : "White"
      } wins`;
    } else if (game.chessGame.isDraw()) {
      gameOverReason = "Draw";
      if (game.chessGame.isStalemate()) gameOverReason = "Draw: Stalemate";
      if (game.chessGame.isThreefoldRepetition())
        gameOverReason = "Draw: Threefold Repetition";
      if (game.chessGame.isInsufficientMaterial())
        gameOverReason = "Draw: Insufficient Material";
    }
  }

  if (gameOverReason) {
    if (game.timerInterval) {
      clearInterval(game.timerInterval);
      game.timerInterval = null;
    }

    const gameOverPayload = { fen: fen, result: gameOverReason };

    if (game.players.white) {
      io.to(game.players.white).emit("gameOver", gameOverPayload);
      userGames.delete(game.players.white);
    }
    if (game.players.black) {
      io.to(game.players.black).emit("gameOver", gameOverPayload);
      userGames.delete(game.players.black);
    }

    games.delete(gameCode);
    console.log(
      `Game over: ${gameOverReason} in game ${gameCode}. Fen: ${fen}`
    );
  }
}

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("createGame", ({ colorPreference, gameType, timeControl }) => {
    const gameCode = generateGameCode();
    const chessGame = new Chess();

    let playerColor = colorPreference;
    if (colorPreference === "random") {
      playerColor = Math.random() < 0.5 ? "w" : "b";
    }

    games.set(gameCode, {
      chessGame,
      players: {
        white: playerColor === "w" ? socket.id : null,
        black: playerColor === "b" ? socket.id : null,
      },
      gameType,
      timeControl,
      timeLeft: { white: timeControl * 60, black: timeControl * 60 },
      lastMoveTime: null,
      timerInterval: null,
    });
    userGames.set(socket.id, gameCode);

    socket.emit("gameCreated", {
      gameCode,
      color: playerColor,
      fen: chessGame.fen(),
      gameType,
      timeControl,
    });
    console.log(
      `Game created: ${gameCode}, Player: ${socket.id} as ${playerColor}, Type: ${gameType}, Time: ${timeControl} min`
    );
  });

  socket.on("joinGame", (gameCode) => {
    const game = games.get(gameCode);
    if (!game) {
      return socket.emit("joinError", "Game not found");
    }
    if (game.players.white === socket.id || game.players.black === socket.id) {
      return socket.emit("joinError", "You are already in this game.");
    }

    let joinedColor;
    if (!game.players.white) {
      game.players.white = socket.id;
      joinedColor = "w";
    } else if (!game.players.black) {
      game.players.black = socket.id;
      joinedColor = "b";
    } else {
      return socket.emit("joinError", "Game is full");
    }

    userGames.set(socket.id, gameCode);
    socket.emit("gameJoined", {
      gameCode,
      color: joinedColor,
      fen: game.chessGame.fen(),
      opponentName: "Opponent",
      gameType: game.gameType,
      timeControl: game.timeControl,
      timeLeft: game.timeLeft,
    });

    const opponentSocketId =
      joinedColor === "w" ? game.players.black : game.players.white;

    if (opponentSocketId) {
      io.to(opponentSocketId).emit("opponentJoined", {
        fen: game.chessGame.fen(),
        opponentName: "Opponent",
        timeLeft: game.timeLeft,
        timeControl: game.timeControl,
      });
      if (game.players.white && game.players.black) {
        startGameTimer(gameCode);
      }
    }
    console.log(`Player ${socket.id} joined game ${gameCode} as ${joinedColor}`);
  });

  socket.on("makeMove", ({ gameCode, move }) => {
    const game = games.get(gameCode);
    if (!game) {
      return socket.emit("moveError", "Game not found");
    }
    if (game.chessGame.isGameOver()) {
      return socket.emit("moveError", "Game is already over");
    }

    const currentTurnPlayerSocketId =
      game.chessGame.turn() === "w"
        ? game.players.white
        : game.players.black;
    if (socket.id !== currentTurnPlayerSocketId) {
      return socket.emit("moveError", "Not your turn");
    }

    const result = game.chessGame.move(move);
    if (result) {
      const nextTurn = game.chessGame.turn();
      updateGameTimer(gameCode, true);

      const updatedFen = game.chessGame.fen();
      const clientMoveResult = { ...result };
      if (result.captured) {
        const capturedPieceColor = result.color === 'w' ? 'b' : 'w';
        clientMoveResult.capturedPieceFull = capturedPieceColor + result.captured.toUpperCase();
      }

      const payload = {
        fen: updatedFen,
        move: clientMoveResult,
        turn: nextTurn,
        timeLeft: game.timeLeft,
      };

      if (game.players.white) io.to(game.players.white).emit("moveMade", payload);
      if (game.players.black) io.to(game.players.black).emit("moveMade", payload);

      checkGameOver(gameCode);
    } else {
      socket.emit("moveError", "Invalid move: Move could not be made by chess.js");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const gameCode = userGames.get(socket.id);

    if (gameCode) {
      const game = games.get(gameCode);
      if (game) {
        if (game.timerInterval) {
          clearInterval(game.timerInterval);
          game.timerInterval = null;
        }

        let opponentSocketId = null;
        let disconnectedPlayerColor = null;

        if (game.players.white === socket.id) {
          opponentSocketId = game.players.black;
          disconnectedPlayerColor = 'w';
          game.players.white = null;
        } else if (game.players.black === socket.id) {
          opponentSocketId = game.players.white;
          disconnectedPlayerColor = 'b';
          game.players.black = null;
        }

        userGames.delete(socket.id);

        if (opponentSocketId && userGames.has(opponentSocketId)) {
          const disconnectedPlayerColorName = disconnectedPlayerColor === 'w' ? "White" : "Black";
          const winningPlayerColorName = disconnectedPlayerColor === 'w' ? "Black" : "White";
          
          const message = game.chessGame.isGameOver()
            ? `Game over. ${disconnectedPlayerColorName} left.`
            : `${disconnectedPlayerColorName} disconnected. ${winningPlayerColorName} wins by forfeit.`;
          
          io.to(opponentSocketId).emit("playerLeft", { message });
          
          userGames.delete(opponentSocketId);
          games.delete(gameCode);
          console.log(`Game ${gameCode} ended and removed due to disconnect of player ${socket.id}.`);
        } else {
          games.delete(gameCode);
          console.log(
            `Game ${gameCode} removed. Player ${socket.id} (Color: ${disconnectedPlayerColor || 'unknown'}) disconnected. No active opponent.`
          );
        }
      } else {
        console.log(
          `Player ${socket.id} disconnected, but game ${gameCode} was already finished or cleaned up.`
        );
        userGames.delete(socket.id);
      }
    } else {
      console.log(
        `Player ${socket.id} disconnected but was not in any tracked active game.`
      );
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP Server listening on port ${PORT}`);
  console.log(`Socket.IO also listening on port ${PORT} (attached to HTTP server)`);
});