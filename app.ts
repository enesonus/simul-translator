import http from 'http';
import { createWebSocketServer } from './websocket-server'; // Assuming app.ts is in the same root directory as websocket-server.ts

const httpServer = http.createServer((req, res) => {
    // Handle regular HTTP requests if any, or just serve as a base for WebSocket
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Simultaneous Translation WebSocket server is running. Connect via WebSocket protocol.');
});

createWebSocketServer(httpServer);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`HTTP server with WebSocket support listening on port ${PORT}`);
}); 