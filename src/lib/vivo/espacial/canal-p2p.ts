"use client";

import { createMesh, type MeshHandle, type PeerEvents, type SignalTransport, type PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { type ErrorEscena, MENSAJES_ERROR } from "./persistencia";
import { NUNCA_EN_REGISTROS } from "@/lib/xr/privacidad";
import { EventoEscena, EVENTOS_ESCENA, FilaCambiada, ConexionEscena } from "./canal";

interface OpcionesP2P {
    miId: string;
    señal: SignalTransport;
    ice?: RTCIceServer[];
    maxPares?: number;
    // respaldo is not implemented in this version
}

export function abrirCanalEscenaP2P(
    tema: string,
    o: OpcionesP2P
): ConexionEscena | null {
    if (typeof window === "undefined" || !tema || !o.miId || !o.señal) {
        return null;
    }

    const maxPares = o.maxPares ?? 7;
    const iceServers = o.ice ?? [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google2.com:19302" },
    ];

    let mesh = createMesh(o.miId, tema, o.señal, iceServers);
    if (!mesh) {
        return null;
    }
    // From here on, mesh is definitely not null.

    let closed = false;

    // Presence state: we will maintain a map of deviceId to meta for peers
    const presenceMap = new Map<string, Record<string, unknown>>();
    // Our own presence meta
    let ownMeta: Record<string, unknown> | null = null;

    // Listeners
    const presenciaListeners = new Set<(estado: Record<string, unknown>) => void>();
    const mensajeListeners = new Set<(evento: EventoEscena, payload: unknown) => void>();
    const filaListeners = new Set<(fila: FilaCambiada) => void>();
    const suscritoListeners = new Set<(ok: boolean) => void>();

    // Helper to check if payload contains forbidden keys
    function payloadValido(payload: Record<string, unknown>): boolean {
        if (typeof payload !== "object" || payload === null) {
            return false;
        }
        for (const key of NUNCA_EN_REGISTROS) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                return false;
            }
        }
        return true;
    }

    // Helper to get the full presence state as a record (object)
    function getPresenciaEstado(): Record<string, unknown> {
        const estado = {} as Record<string, unknown>;
        // Add peers from presenceMap
        for (const [deviceId, meta] of presenceMap.entries()) {
            estado[deviceId] = meta;
        }
        // Add own presence if we have one
        if (ownMeta !== null) {
            estado[o.miId] = ownMeta;
        }
        return estado;
    }

    // Mesh event handlers
    const manejadorEstado = (peer: PeerSnapshot) => {
        if (closed) {
            return;
        }
        if (peer.state === "connected" || peer.state === "connecting") {
            // We don't have presence from the peer yet, but we will when they send a presence message.
            // We can add a placeholder? Or wait for the presence message.
            // For now, we do nothing on connect.
        } else {
            // Peer disconnected or failed: remove from presence map
            presenceMap.delete(peer.deviceId);
            // Announce the updated presence (without this peer) to all listeners
            const estado = getPresenciaEstado();
            emitirPresencia(estado);
        }
    };

    const manejadorMensaje = (deviceId: string, data: string) => {
        if (closed) {
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(data);
        } catch {
            return; // invalid JSON
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return;
        }
        const mensaje = parsed as Record<string, unknown>;

        // Check for presence message
        if ((mensaje as { t?: string }).t === "presence") {
            const presenceMsg = mensaje as { t: "presence"; de: string; meta: Record<string, unknown>; n: number };
            if (presenceMsg.de && typeof presenceMsg.meta === "object" && presenceMsg.meta !== null) {
                // Update the presence map for the sender
                presenceMap.set(presenceMsg.de, presenceMsg.meta);
                // Announce the updated presence
                const estado = getPresenciaEstado();
                emitirPresencia(estado);
            }
            return;
        }

        // Check for regular event message
        const evento = mensaje.e;
        const payload = mensaje.p;
        if (
            typeof evento === "string" &&
            EVENTOS_ESCENA.includes(evento as EventoEscena) &&
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload)
        ) {
            // Validate payload size
            const payloadStr = JSON.stringify(payload);
            if (payloadStr.length > 64 * 1024) {
                return; // too large
            }
            // At this point, payload is a non-null object and not an array
            const recordPayload = payload as Record<string, unknown>;
            // Validate payload does not contain forbidden keys
            if (!payloadValido(recordPayload)) {
                return;
            }
            // Call message listeners
            emitirMensaje(evento as EventoEscena, recordPayload);
        }
        // Otherwise, ignore the message
    };

    const unsuscribeMesh = mesh.onPeer({
        onState: manejadorEstado,
        onMessage: manejadorMensaje,
    });

    // Emitter helper functions
    function emitirPresencia(estado: Record<string, unknown>) {
        for (const cb of presenciaListeners) {
            try {
                cb(estado);
            } catch {
                /* un listener roto no tumba a los demás */
            }
        }
    }

    function emitirMensaje(evento: EventoEscena, payload: unknown) {
        for (const cb of mensajeListeners) {
            try {
                cb(evento, payload);
            } catch {
                /* un listener roto no tumba a los demás */
            }
        }
    }

    function emitirFila(fila: FilaCambiada) {
        for (const cb of filaListeners) {
            try {
                cb(fila);
            } catch {
                /* un listener roto no tumba a los demás */
            }
        }
    }

    function emitirSuscrito(ok: boolean) {
        for (const cb of suscritoListeners) {
            try {
                cb(ok);
            } catch {
                /* un listener roto no tumba a los demás */
            }
        }
    }

    // Public API
    const conexion: ConexionEscena = {
        get tema() {
            return tema;
        },
        suscrito() {
            // Check if we have at least one peer connected
            const peers = mesh.getPeers();
            return peers.some(p => p.state === "connected");
        },
        enviar(evento, payload) {
            if (closed) {
                return;
            }
            // Check evento type
            if (!EVENTOS_ESCENA.includes(evento)) {
                return;
            }
            // Validate payload
            if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
                return;
            }
            if (!payloadValido(payload)) {
                return;
            }
            // Check size
            const payloadStr = JSON.stringify(payload);
            if (payloadStr.length > 64 * 1024) {
                return;
            }
            // Broadcast the message
            const mensaje = {
                e: evento,
                p: payload,
                de: o.miId,
                n: Date.now(),
            };
            try {
                void mesh.broadcast(JSON.stringify(mensaje));
            } catch {
                /* best-effort */
            }
        },
        publicarPresencia(meta) {
            if (closed) {
                return;
            }
            ownMeta = meta;
            // Announce our own presence
            if (ownMeta !== null) {
                const mensaje = {
                    t: "presence",
                    de: o.miId,
                    meta: ownMeta,
                    n: Date.now(),
                };
                try {
                    void mesh.broadcast(JSON.stringify(mensaje));
                } catch {
                    /* best-effort */
                }
            }
        },
        onPresencia(cb) {
            presenciaListeners.add(cb);
            return () => presenciaListeners.delete(cb);
        },
        onMensaje(cb) {
            mensajeListeners.add(cb);
            return () => mensajeListeners.delete(cb);
        },
        onFila(cb) {
            filaListeners.add(cb);
            return () => filaListeners.delete(cb);
        },
        onSuscrito(cb) {
            suscritoListeners.add(cb);
            return () => suscritoListeners.delete(cb);
        },
        cerrar() {
            if (closed) {
                return;
            }
            closed = true;
            // Unsubscribe from mesh
            unsuscribeMesh();
            // Close mesh
            mesh.closeMesh();
            // Clear listeners
            presenciaListeners.clear();
            mensajeListeners.clear();
            filaListeners.clear();
            suscritoListeners.clear();
            // Clear our own presence
            ownMeta = null;
        },
    };

    return conexion;
}