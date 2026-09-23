import { useEffect, useState } from "react";
import { io } from "socket.io-client";

import api from "@/lib/api";

// Single Socket.io connection shared by the whole app.
//
// The backend attaches `io` to the same HTTP server that serves the REST
// API (see `backend/server.js`) on the default `/socket.io` path, so the
// socket origin is just the origin of the REST base URL. That base URL is
// owned by `lib/api.js` (`VITE_API_URL`, falling back to a localhost
// default), and is read back off the axios instance here rather than
// re-deriving it — one env knob, one place.
//
// The handshake carries the JWT the same way `lib/api.js` sends it on REST
// calls: `localStorage.getItem("token")`, wrapped in try/catch because
// storage access throws in some privacy modes. `server.js#jwtHandshakeAuth`
// rejects a missing or invalid token, so with no token stored we never open
// a connection at all (a rejected handshake is not retried by socket.io —
// it would just fail once per mount).
//
// Every caller of `useSocket()` gets the *same* socket: it is created on
// first use and kept for the life of the page. Call `disconnectSocket()` on
// logout to tear it down; the next `useSocket()` after a fresh login opens a
// new one. A token that changed under us (login as another user without a
// full reload) is detected here too and forces a rebuild, because the
// handshake auth is fixed at connect time.

/**
 * Origin the socket connects to, derived from `lib/api.js`'s base URL.
 * `http://localhost:5050/api` -> `http://localhost:5050`; a relative base
 * such as `/api` -> the page's own origin.
 *
 * @returns {string}
 */
export function getApiOrigin() {
  const base = api.defaults.baseURL || "";
  try {
    return new URL(base, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function readToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

let socket = null;
let socketToken = null;

/**
 * The shared socket, created on first call. Returns `null` when no JWT is
 * stored (logged out) — callers should treat that as "not connected".
 *
 * @returns {import("socket.io-client").Socket | null}
 */
export function getSocket() {
  const token = readToken();

  if (!token) {
    // Logged out: drop any socket opened for the previous session.
    disconnectSocket();
    return null;
  }

  // The handshake auth is read once at connect time, so a different token
  // means a different connection.
  if (socket && socketToken !== token) disconnectSocket();

  if (!socket) {
    socketToken = token;
    socket = io(getApiOrigin(), {
      auth: { token },
      autoConnect: true,
      withCredentials: true,
      // Reconnect forever: nodemon restarts and laptop sleeps both drop the
      // connection mid-generation and the UI has to come back on its own.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  } else if (!socket.connected && !socket.active) {
    // Reconnection gave up (or was stopped); start a fresh attempt.
    socket.connect();
  }

  return socket;
}

/**
 * Closes the shared socket and forgets it. Safe to call when there is none.
 * Call this from the logout path.
 */
export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
}

/**
 * Subscribes the component to the shared socket's connection state.
 *
 * @returns {{socket: import("socket.io-client").Socket | null, connected: boolean}}
 */
export function useSocket() {
  const [socketInstance, setSocketInstance] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const instance = getSocket();
    setSocketInstance(instance);

    if (!instance) {
      setConnected(false);
      return undefined;
    }

    setConnected(instance.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (error) => {
      setConnected(false);
      console.warn("useSocket: connection error", error?.message || error);
    };

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.on("connect_error", onConnectError);

    // Only this component's listeners go away on unmount — the socket itself
    // stays up for whoever else is using it (and for the next mount).
    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.off("connect_error", onConnectError);
    };
  }, []);

  return { socket: socketInstance, connected };
}

export default useSocket;
