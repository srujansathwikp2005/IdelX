const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');
const { startExpiryJob } = require('./jobs/expire-requests');
const registerChatSocket = require('./sockets/chat.socket');
const ensureDefaultAdmin = require('./utils/ensureDefaultAdmin');

async function start() {
  await connectDB();
  await ensureDefaultAdmin().catch((err) => console.error('[admin] failed to seed default admin:', err.message));

  // Requests hold their dates, so an unanswered one has to be released or an
  // owner's calendar silently fills with bookings that will never happen.
  startExpiryJob();

  const server = http.createServer(app);

  // Socket.IO takes the role Django Channels + Redis play in the
  // Django doc — real-time chat over the same HTTP server, no ASGI
  // swap required the way Channels needs Daphne/Uvicorn.
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });
  // Expose the socket server to HTTP handlers so a message sent over REST
  // still reaches anyone watching the thread over the websocket.
  app.set('io', io);
  registerChatSocket(io);

  server.listen(env.port, () => {
    console.log(`[server] IdleX API running on port ${env.port} (${env.nodeEnv})`);
  });
}

start();
