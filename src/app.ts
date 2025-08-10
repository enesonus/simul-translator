import http from 'http';
import fs from 'fs';
import path from 'path';
import { createWebSocketServer } from './websocket-server'; // Assuming app.ts is in the same root directory as websocket-server.ts
// Import new WebSocket message types if they are used directly in this file
// import { WebSocketMessage, ClientWebSocketMessage, ServerWebSocketMessage } from './websocket-types';
import dotenv from 'dotenv';
dotenv.config();


const httpServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html' || req.url === '/demo') {
        const filePath = path.join(__dirname, '../demo', 'index.html');
        console.log(`Serving index.html from: ${filePath}`);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.url && (req.url.endsWith('.js') || req.url.endsWith('.css'))) {
        const fileName = req.url.startsWith('/') ? req.url.substring(1) : req.url;
        const filePath = path.join(__dirname, '../demo', fileName);
        const contentType = req.url.endsWith('.js') ? 'text/javascript' : 'text/css';
        // console.log(`Serving static file: ${filePath}`);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    } else {
        // Handle regular HTTP requests if any, or just serve as a base for WebSocket
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Simultaneous Translation WebSocket server is running. Connect via WebSocket protocol.');
    }
});

createWebSocketServer(httpServer);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    console.log(`HTTP server with WebSocket support listening on port ${PORT}`);
}); 