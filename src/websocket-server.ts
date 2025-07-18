import WebSocket, { WebSocketServer } from "ws";
import http, { IncomingMessage } from "http";
import { AudioWorker } from "./workers/types/audio-worker";
import { v4 as uuidv4 } from "uuid";
import * as WebSocketTypes from "./websocket-types"; // Import types
import { createSessionConfig, SessionConfig } from "./workers/types/models";

export function createWebSocketServer(server: http.Server) {
	const wss = new WebSocketServer({ server });
	const workers = new Map<string, AudioWorker>(); // sessionId to AudioWorker

	console.log("WebSocket server created and attached to HTTP server");

	wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
		console.log(`Client IP: ${JSON.stringify(request.socket.remoteAddress)}`);
		// TODO: Get temp auth token from request headers, verify it and calculate expiration.
		// Normal API keys will not be allowed.

		const worker = new AudioWorker(ws);
		let sessionId: string;

		ws.on("message", (message: string) => {
			const parsedMessage = JSON.parse(
				message
			) as WebSocketTypes.WebSocketMessage;
			if (parsedMessage.type !== "input_audio_buffer.append") {
				console.log(
					`WebSocket Server: Received message from ${sessionId}: ${message}`
				);
			}
			if (parsedMessage.type === "session.create") {
				worker.cleanup(); // Cleanup any previous session and it's properties if any
				sessionId = uuidv4(); // Generate a unique session ID for this connection
				console.log(`Assigned sessionId: ${sessionId}`);
				let sessionConfig: SessionConfig = createSessionConfig(
					parsedMessage.config || {}
				);
				worker.setSession({ config: sessionConfig, id: sessionId});
				workers.set(sessionId, worker);
				worker.sendMessage({
					type: "session.created",
					id: sessionId,
					config: sessionConfig,
				} as WebSocketTypes.SessionCreatedMessage);
				worker.handleMessage(message);
			} else {
				worker.handleMessage(message);
			}
		});

		ws.on("close", () => {
			console.log(`Client disconnected, sessionId: ${sessionId}`);
			worker.cleanup();
			workers.delete(sessionId);
		});

		ws.on("error", (error) => {
			console.error(`WebSocket error for sessionId ${sessionId}:`, error);
			worker.cleanup(); // Ensure cleanup on error too
			workers.delete(sessionId); // Might already be handled by close or might need careful handling
		});
	});

	console.log("WebSocket server is listening for connections...");
	return wss;
}
