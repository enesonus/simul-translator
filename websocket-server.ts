import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { AudioWorker } from './audio-worker';
import { v4 as uuidv4 } from 'uuid';

export function createWebSocketServer(server: http.Server) {
    const wss = new WebSocketServer({ server });
    const workers = new Map<string, AudioWorker>(); // sessionId to AudioWorker

    console.log('WebSocket server created and attached to HTTP server');

    wss.on('connection', (ws: WebSocket) => {
        const sessionId = uuidv4(); // Generate a unique session ID for this connection
        console.log(`Client connected, assigned sessionId: ${sessionId}`);

        const worker = new AudioWorker(ws, sessionId);
        workers.set(sessionId, worker);

        // Send session.created message
        ws.send(JSON.stringify({
            type: 'session.created',
            sessionId: sessionId,
            // These should come from actual session configuration (REST API part later)
            model: 'simul-translator-default-model',
            instructions: 'Speak naturally, the system will translate in real-time.',
            voiceIOFormat: 'audio/wav; rate=48000', // Example
            turnDetectionSettings: { mode: 'auto', silenceMs: 1000 } // Example
        }));

        ws.on('message', (message: string) => {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type !== 'input_audio_buffer.append') {
                console.log(`WebSocket Server: Received message from ${sessionId}: ${message}`);
            }
            worker.handleMessage(message);
        });

        ws.on('close', () => {
            console.log(`Client disconnected, sessionId: ${sessionId}`);
            worker.cleanup();
            workers.delete(sessionId);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for sessionId ${sessionId}:`, error);
            // worker.cleanup(); // Ensure cleanup on error too
            // workers.delete(sessionId); // Might already be handled by close or might need careful handling
        });
    });

    console.log('WebSocket server is listening for connections...');
    return wss;
}