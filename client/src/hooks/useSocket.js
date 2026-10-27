import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../auth/AuthContext.jsx";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3001";

export function useSocket(roomId) {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);
  const roomReadyRef = useRef(false);
  const pendingMessagesRef = useRef([]);

  useEffect(() => {
    setMessages([]);
    roomReadyRef.current = false;
    pendingMessagesRef.current = [];
    if (!token || !roomId) {
      socketRef.current = null;
      return undefined;
    }

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    const onMessage = (message) => {
      setMessages((current) => [...current, message]);
    };
    const joinRoom = () => {
      roomReadyRef.current = false;
      socket.emit("room:join", roomId, (result) => {
        if (socketRef.current !== socket || !result?.ok) return;
        roomReadyRef.current = true;
        const queuedMessages = pendingMessagesRef.current;
        pendingMessagesRef.current = [];
        queuedMessages.forEach((text) => {
          socket.emit("chat:message", { roomId, text });
        });
      });
    };
    const onDisconnect = () => {
      roomReadyRef.current = false;
    };

    socket.on("chat:message", onMessage);
    socket.on("connect", joinRoom);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) joinRoom();

    return () => {
      socket.off("chat:message", onMessage);
      socket.off("connect", joinRoom);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      roomReadyRef.current = false;
      pendingMessagesRef.current = [];
    };
  }, [token, roomId]);

  const sendMessage = useCallback((text) => {
    if (typeof text !== "string" || !text.trim()) return;

    const cleanText = text.trim();
    const socket = socketRef.current;
    if (!socket || !roomReadyRef.current) {
      pendingMessagesRef.current.push(cleanText);
      return;
    }
    socket.emit("chat:message", { roomId, text: cleanText });
  }, [roomId]);

  return { messages, sendMessage };
}
