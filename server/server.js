import "dotenv/config";
import { createServer } from "http";
import { randomUUID } from "crypto";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Demo users - log in as either to test chat in two windows.
const USERS = [
  { userId: 1, name: "Ada", email: "ada@threadbase.dev", password: "password" },
  { userId: 2, name: "Linus", email: "linus@threadbase.dev", password: "password" },
];

// POST /auth/login -> { accessToken, user }
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const found = USERS.find((u) => u.email === email && u.password === password);
  if (!found) return res.status(401).json({ error: "Invalid credentials" });

  const accessToken = jwt.sign(
    { userId: found.userId, name: found.name },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ accessToken, user: { userId: found.userId, name: found.name } });
});

// A normal protected route (unchanged, uses the HTTP verifyToken).
app.get("/api/me", verifyToken, (req, res) => res.json({ user: req.user }));

const PORT = process.env.PORT ?? 3001;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// Authenticate each socket once during its handshake.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) {
    return next(new Error("No token provided"));
  }

  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  socket.on("room:join", async (roomId, acknowledge) => {
    const validRoom =
      typeof roomId === "string" && roomId.trim() && roomId.length <= 100;
    if (!validRoom) {
      if (typeof acknowledge === "function") acknowledge({ ok: false });
      return;
    }

    await socket.join(roomId);
    if (typeof acknowledge === "function") acknowledge({ ok: true });
  });

  socket.on("chat:message", ({ roomId, text } = {}) => {
    if (
      typeof roomId !== "string" ||
      !socket.rooms.has(roomId) ||
      typeof text !== "string" ||
      !text.trim()
    ) {
      return;
    }

    const message = {
      id: randomUUID(),
      text: text.trim(),
      user: socket.data.user.name,
      at: Date.now(),
    };
    // io.to includes the sender, so both chat participants see the message.
    io.to(roomId).emit("chat:message", message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log("  POST /auth/login");
  console.log("  Socket.io: ready");
});
