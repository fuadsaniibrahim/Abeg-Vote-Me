import { io, type Socket } from 'socket.io-client';

type Factory = () => Socket;

let factory: Factory = () => io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
let socket: Socket | null = null;

/** Tests swap in a factory that connects to an in-process server with a cookie header. */
export function setSocketFactory(f: Factory) {
  factory = f;
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket {
  if (!socket) socket = factory();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export type Ack<T = unknown> = { ok: true } & T | { ok: false; error: string; message: string };

export function emitAck<T>(event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => getSocket().emit(event, payload, (res: Ack<T>) => resolve(res)));
}
