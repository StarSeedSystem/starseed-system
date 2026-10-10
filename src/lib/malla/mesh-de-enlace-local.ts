"use client";

import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";

export function meshDeEnlaceLocal(e: EnlaceLocalVivo): MeshHandle {
  const { syncDeviceId } = identidadDispositivo();
  const parId = e.par.syncDeviceId ?? e.id;
  let unsubscribe: (() => void) | null = null;

  const handle: MeshHandle = {
    myDeviceId: syncDeviceId,
    userId: '',
    supported: true,
    get signalingTransport() {
      return 'none' as const;
    },
    connectToDevice: async () => {
      const peers = handle.getPeers();
      return peers[0];
    },
    onPeer: (events) => {
      if (unsubscribe) unsubscribe();
      const unsub = e.alMensaje((data) => {
        if (typeof data === 'string') {
          events.onMessage?.(parId, data);
        }
      });
      unsubscribe = unsub;
      return unsub;
    },
    sendToPeer: (id, data) => {
      if (id === parId) return e.enviar(data);
      return false;
    },
    broadcast: (data) => {
      return e.enviar(data) ? 1 : 0;
    },
    bufferedAmount: () => e.bufferedAmount(),
    getPeers: () => [{
      deviceId: parId,
      state: e.abierto() ? 'connected' : 'closed',
      channelOpen: e.abierto(),
      lastUpdate: Date.now()
    }],
    getStats: async () => null,
    closeMesh: () => {
      // no-op; enlace se cierra desde su interfaz
    },
  };

  return handle;
}