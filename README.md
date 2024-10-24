# ChessMate Server

A real-time chess server implementation using Node.js, Express, and Socket.IO that supports multiplayer games with customizable time controls.

## Features

- Real-time multiplayer chess games
- Custom game room creation with unique codes
- Flexible color selection (white, black, or random)
- Configurable time controls
- Automatic game state management
- Support for different game types
- Real-time move validation
- Automated game completion detection

## Prerequisites

- Node.js (v12 or higher)
- npm (Node Package Manager)

## Dependencies

```json
{
  "express": "^4.x.x",
  "socket.io": "^4.x.x",
  "chess.js": "^1.x.x",
  "cors": "^2.x.x"
}
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Start the server:
```bash
node server.js
```

The server will start running on port 3000, with Socket.IO listening on port 3001.

## Deployment

### Railway App Deployment

This application is specifically designed to be deployed on Railway App, as it provides free hosting for WebSocket applications for personal use. Other platforms like Heroku or Render may have limitations with WebSocket connections in their free tiers.

The server is hosted on the link:
```javascript
https://chess-matebackend-production.up.railway.app/
```
Please use at a limited rate as it is deployed on a free tier subscription.

## API Documentation

### Socket Events

#### Client -> Server

1. **createGame**
   ```javascript
   socket.emit('createGame', {
     colorPreference: 'w' | 'b' | 'random',
     gameType: string,
     timeControl: number // in minutes
   });
   ```

2. **joinGame**
   ```javascript
   socket.emit('joinGame', gameCode);
   ```

3. **makeMove**
   ```javascript
   socket.emit('makeMove', {
     gameCode: string,
     move: object // chess.js move object
   });
   ```

#### Server -> Client

1. **gameCreated**
   ```javascript
   {
     gameCode: string,
     color: 'w' | 'b',
     fen: string,
     gameType: string,
     timeControl: number
   }
   ```

2. **gameJoined**
   ```javascript
   {
     gameCode: string,
     color: 'w' | 'b',
     fen: string,
     opponentName: string,
     gameType: string,
     timeControl: number,
     timeLeft: {
       white: number,
       black: number
     }
   }
   ```

3. **moveMade**
   ```javascript
   {
     fen: string,
     move: object,
     turn: 'w' | 'b',
     timeLeft: {
       white: number,
       black: number
     }
   }
   ```

4. **gameOver**
   ```javascript
   {
     fen: string,
     result: string
   }
   ```

## Game Flow

1. Host creates a game with preferred settings
2. Server generates a unique game code
3. Second player joins using the game code
4. Game starts automatically when both players are connected
5. Players make moves alternately
6. Time control is managed automatically
7. Game ends on checkmate, stalemate, draw, or time out

## Time Control System

- Time is tracked separately for each player
- Timer updates every second
- Time deduction occurs during a player's turn
- Game automatically ends when a player runs out of time

## Error Handling

The server handles various error scenarios:
- Invalid moves
- Non-existent game codes
- Attempting to join full games
- Connection issues

## CORS Configuration

The server is configured to accept connections from:
```javascript
https://chess-mate-one.vercel.app/
```

## Environment

- Server Port: 3000
- Socket.IO Port: 3001

## Production Considerations

1. Implement proper error logging
2. Add authentication system
3. Set up database for game persistence
4. Add rate limiting
5. Implement reconnection handling
6. Add proper environment variable configuration
7. Configure Railway App environment variables:
   - Set PORT variable
   - Configure production CORS origins
   - Set up logging services

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
