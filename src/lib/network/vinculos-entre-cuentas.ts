"use client";

/*
 * vinculos-entre-cuentas — VÍNCULO ENTRE CUENTAS CON CONSENTIMIENTO (Ola 370).
 * ---------------------------------------------------------------------------
 * El auto-vínculo de `malla-neuronas.ts` (Ola 366) solo conecta neuronas de la
 * MISMA cuenta, sin botón, porque comparten la sesión soberana. Vincular DOS
 * CUENTAS distintas es una decisión humana — este módulo es el MOTOR (capa de
 * datos + gestión de la conexión P2P) de esa decisión:
 *
 *   1. CAPA DE DATOS: `solicitarVinculo`/`aceptarVinculo`/`rechazarVinculo`/
 *      `revocarVinculo` llaman a las 4 funciones SECURITY DEFINER de la
 *      migración `20260926190000_os_mesh_vinculos.sql` — la máquina de
 *      estados vive ahí (mirror puro en `vinculos-transiciones.ts`); este
 *      módulo NUNCA escribe la tabla directamente.
 *   2. MOTOR (`useVinculosEntreCuentas`, montado UNA vez por
 *      `MallaNeuronasMount`, igual que `useMallaNeuronas`): sondea las filas
 *      donde soy `de_owner` o `a_owner`, y para cada una `estado='aceptado'`
 *      con AMBAS claves públicas ya publicadas, deriva el secreto de par
 *      (`par-crypto.ts`) y abre un `MeshHandle` DEDICADO (uno por vínculo,
 *      vía `createMesh` — el mismo núcleo de negociación de
 *      `webrtc-mesh.ts`, con `par-signaling.ts` como transporte en vez de la
 *      cuenta compartida).
 *   3. API PARA OTRAS CAPAS (relé de IA, transferencia de archivos — Ola
 *      370 §4 del encargo): `vinculosActivos()`/`useVinculos()` para leer el
 *      estado, `enviarAPar(vinculoId, data)`/`onMensajeDePar(cb)` para hablar
 *      por el canal YA abierto. Esas capas comprueban ELLAS MISMAS
 *      `permisos.ia`/`permisos.archivos` antes de usarlo — este módulo no
 *      impone el permiso en el transporte (igual que `capaMeshCompartiendo()`
 *      lo impone el LLAMADOR de `setupConcienciaSync`, no `webrtc-mesh.ts`).
 *
 * Protocolo reservado sobre el data channel de CADA vínculo:
 *   `{t:"vinculo:hb", at}` / `{t:"vinculo:hb-ack", at}` — heartbeat de
 *   latencia cada `HEARTBEAT_MS`, MISMO patrón que `malla-neuronas.ts`. Otras
 *   capas que usen `enviarAPar` NO deben mandar un objeto con esa forma
 *   exacta (colisionaría con este heartbeat) — cualquier otro payload (JSON
 *   o texto plano) se reenvía tal cual a `onMensajeDePar`.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import { createMesh, type MeshHandle, type PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { crearTransporteSenalPar } from "@/lib/network/par-signaling";
import { exportPubJwk, derivarClaveParHex, topicDePar } from "@/lib/network/par-crypto";
import { rolEnVinculo, type EstadoVinculo, type RolVinculo } from "@/lib/network/vinculos-transiciones";
// Contrato «consumo» (2026-09-29): id de cuenta sin red + bucle de la pestaña líder.
import { uidActual } from "@/lib/consumo/usuario";
import { esLider, alCambiarLider } from "@/lib/consumo/lider-pestana";
import { crearBucle, falloDe, MINUTO_MS, type FalloConsulta } from "@/lib/network/bucle-fondo";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Lo que un vínculo permite compartir por el canal P2P. Todo `false` por defecto. */
export interface PermisosVinculo {
  ia: boolean;
  archivos: boolean;
  capacidades: boolean;
}

export const PERMISOS_VACIOS: PermisosVinculo = { ia: false, archivos: false, capacidades: false };

function normalizarPermisos(x: unknown): PermisosVinculo {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return { ia: o.ia === true, archivos: o.archivos === true, capacidades: o.capacidades === true };
}

/** Una fila de `os_mesh_vinculos`, en camelCase y con MI rol ya resuelto. */
export interface VinculoRow {
  id: string;
  deOwner: string;
  deDevice: string;
  aOwner: string;
  aDevice: string;
  estado: EstadoVinculo;
  mensaje: string | null;
  permisosSolicitados: PermisosVinculo;
  permisos: PermisosVinculo;
  dePub: JsonWebKey | null;
  aPub: JsonWebKey | null;
  sal: string;
  createdAt: number;
  /** Mi rol en ESTE vínculo ('de' = lo solicité yo; 'a' = lo recibí yo). */
  rol: RolVinculo | null;
}

function filaARow(r: Record<string, unknown>, miUid: string | null): VinculoRow {
  const deOwner = String(r.de_owner ?? "");
  const aOwner = String(r.a_owner ?? "");
  return {
    id: String(r.id ?? ""),
    deOwner,
    deDevice: String(r.de_device ?? ""),
    aOwner,
    aDevice: String(r.a_device ?? ""),
    estado: (r.estado as EstadoVinculo) ?? "pendiente",
    mensaje: typeof r.mensaje === "string" ? r.mensaje : null,
    permisosSolicitados: normalizarPermisos(r.permisos_solicitados),
    permisos: normalizarPermisos(r.permisos),
    dePub: (r.de_pub as JsonWebKey | null) ?? null,
    aPub: (r.a_pub as JsonWebKey | null) ?? null,
    sal: String(r.sal ?? ""),
    createdAt: r.created_at ? Date.parse(String(r.created_at)) : 0,
    rol: rolEnVinculo({ deOwner, aOwner }, miUid),
  };
}

async function miOwnerId(): Promise<string | null> {
  // Sin red (antes: `getUser()` = /auth/v1/user en CADA sondeo de 8 s).
  try {
    return await uidActual();
  } catch {
    return null;
  }
}

/**
 * Columnas que el motor necesita. NUNCA `*`: la fila lleva además los buzones de
 * señalización (`buzon_de`/`buzon_a`, hasta 40 sobres firmados cada uno) que aquí no se usan.
 */
const COLUMNAS_VINCULO =
  "id, de_owner, de_device, a_owner, a_device, estado, mensaje, permisos_solicitados, permisos, de_pub, a_pub, sal, created_at";

/* ------------------------------------------------------------------ */
/* Capa de datos: las 4 acciones (delegan TODO en las RPC del servidor) */
/* ------------------------------------------------------------------ */

export interface ResultadoAccionVinculo {
  ok: boolean;
  detail: string;
  id?: string;
}

/**
 * solicitarVinculo — pide vincularse con la neurona cuyo `syncDeviceId` es
 * `aDevice` (el mismo id que ya viaja en `RelayBeacon.syncId` del radar).
 * Publica la clave pública ECDH de ESTE dispositivo (`de_pub`); el servidor
 * resuelve `a_owner` por el faro fresco — nunca lo lee este cliente (ver
 * la migración §cabecera). Nunca lanza.
 */
export async function solicitarVinculo(
  aDevice: string,
  mensaje: string,
  permisos: PermisosVinculo,
): Promise<ResultadoAccionVinculo> {
  try {
    if (!aDevice) return { ok: false, detail: "Falta identificar el dispositivo destino." };
    const ids = identidadDispositivo();
    if (!ids.syncDeviceId) {
      return { ok: false, detail: "Este dispositivo aún no tiene identidad de sincronización propia." };
    }
    const dePub = await exportPubJwk();
    if (!dePub) {
      return { ok: false, detail: "No se pudo generar la clave de emparejamiento de este dispositivo (¿WebCrypto no disponible?)." };
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("solicitar_vinculo", {
      p_a_device: aDevice,
      p_de_device: ids.syncDeviceId,
      p_mensaje: mensaje?.trim() ? mensaje.trim().slice(0, 280) : null,
      p_permisos: permisos,
      p_de_pub: dePub,
    });
    if (error) return { ok: false, detail: error.message || "El servidor rechazó la solicitud." };
    const id = (data as { id?: string } | null)?.id;
    return { ok: true, detail: "Solicitud de vínculo enviada.", id };
  } catch {
    return { ok: false, detail: "Error de red al solicitar el vínculo." };
  }
}

/** aceptarVinculo — el RECEPTOR concede permisos y publica su propia clave pública. */
export async function aceptarVinculo(vinculoId: string, permisos: PermisosVinculo): Promise<ResultadoAccionVinculo> {
  try {
    const aPub = await exportPubJwk();
    if (!aPub) {
      return { ok: false, detail: "No se pudo generar la clave de emparejamiento de este dispositivo (¿WebCrypto no disponible?)." };
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("resolver_vinculo", {
      p_vinculo_id: vinculoId,
      p_estado: "aceptado",
      p_permisos: permisos,
      p_a_pub: aPub,
    });
    if (error) return { ok: false, detail: error.message || "El servidor rechazó la aceptación." };
    return { ok: true, detail: "Vínculo aceptado." };
  } catch {
    return { ok: false, detail: "Error de red al aceptar el vínculo." };
  }
}

/** rechazarVinculo — el RECEPTOR descarta la solicitud (sin publicar ninguna clave). */
export async function rechazarVinculo(vinculoId: string): Promise<ResultadoAccionVinculo> {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("resolver_vinculo", { p_vinculo_id: vinculoId, p_estado: "rechazado" });
    if (error) return { ok: false, detail: error.message || "El servidor rechazó el rechazo." };
    return { ok: true, detail: "Solicitud rechazada." };
  } catch {
    return { ok: false, detail: "Error de red al rechazar la solicitud." };
  }
}

/** revocarVinculo — CUALQUIERA de los dos lados corta una solicitud o un vínculo activo. */
export async function revocarVinculo(vinculoId: string): Promise<ResultadoAccionVinculo> {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("revocar_vinculo", { p_vinculo_id: vinculoId });
    if (error) return { ok: false, detail: error.message || "El servidor rechazó la revocación." };
    return { ok: true, detail: "Vínculo revocado." };
  } catch {
    return { ok: false, detail: "Error de red al revocar el vínculo." };
  }
}

/* ------------------------------------------------------------------ */
/* Store de filas (useSyncExternalStore) — leído por la UI            */
/* ------------------------------------------------------------------ */

let filasActuales: VinculoRow[] = [];
const filasListeners = new Set<() => void>();

function publicarFilas(next: VinculoRow[]): void {
  filasActuales = next;
  for (const l of filasListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

/**
 * useVinculos — TODAS mis filas de `os_mesh_vinculos` (como `de` o como
 * `a`), tal como las publica el motor único (`useVinculosEntreCuentas`,
 * montado por `MallaNeuronasMount`). Solo lectura — no arranca sondeo propio.
 */
export function useVinculos(): VinculoRow[] {
  return useSyncExternalStore(
    (cb) => {
      filasListeners.add(cb);
      return () => filasListeners.delete(cb);
    },
    () => filasActuales,
    () => [],
  );
}

/* ------------------------------------------------------------------ */
/* Store de peers P2P activos — para otras capas (relé IA, archivos)  */
/* ------------------------------------------------------------------ */

export type CanalVinculo = "conectado" | "conectando" | "fallido" | "sin-vinculo";

/** Un vínculo YA aceptado, con el estado de su conexión P2P (para otras capas y la UI). */
export interface PeerVinculo {
  vinculoId: string;
  /** `syncDeviceId` del OTRO dispositivo. */
  deviceId: string;
  /** uuid de la OTRA cuenta. */
  ownerOtro: string;
  permisos: PermisosVinculo;
  canal: CanalVinculo;
  latenciaMs?: number;
}

let peersActuales: PeerVinculo[] = [];
const peersListeners = new Set<() => void>();

function publicarPeers(next: PeerVinculo[]): void {
  peersActuales = next;
  for (const l of peersListeners) {
    try {
      l();
    } catch {
      /* noop */
    }
  }
}

/** useVinculosPeers — lectura reactiva de los vínculos activos (para la UI). */
export function useVinculosPeers(): PeerVinculo[] {
  return useSyncExternalStore(
    (cb) => {
      peersListeners.add(cb);
      return () => peersListeners.delete(cb);
    },
    () => peersActuales,
    () => [],
  );
}

/**
 * vinculosActivos — lectura SÍNCRONA (sin hook) del mismo estado, para código
 * no-React (el relé de IA, la transferencia de archivos — Ola 370 §4).
 */
export function vinculosActivos(): PeerVinculo[] {
  return peersActuales;
}

/* ------------------------------------------------------------------ */
/* Bus de mensajes de par (para otras capas)                          */
/* ------------------------------------------------------------------ */

type OyenteMensajePar = (vinculoId: string, data: string) => void;
const mensajeListeners = new Set<OyenteMensajePar>();

/** onMensajeDePar — suscríbete a los mensajes de CUALQUIER vínculo de par. Devuelve unsubscribe. */
export function onMensajeDePar(cb: OyenteMensajePar): () => void {
  mensajeListeners.add(cb);
  return () => mensajeListeners.delete(cb);
}

function emitirMensajePar(vinculoId: string, data: string): void {
  for (const l of mensajeListeners) {
    try {
      l(vinculoId, data);
    } catch {
      /* noop */
    }
  }
}

const meshesPorVinculo = new Map<string, MeshHandle>();

/**
 * enviarAPar — envía `data` (opaco) al peer de `vinculoId` por el canal YA
 * abierto. `false` si el vínculo no existe o el canal no está abierto —
 * NUNCA abre uno nuevo (eso lo hace el motor al ver `estado='aceptado'`).
 */
export function enviarAPar(vinculoId: string, data: string): boolean {
  const mesh = meshesPorVinculo.get(vinculoId);
  if (!mesh) return false;
  const peers = mesh.getPeers();
  const peer = peers[0];
  if (!peer) return false;
  return mesh.sendToPeer(peer.deviceId, data);
}

/* ------------------------------------------------------------------ */
/* Heartbeat de latencia por el canal (mismo patrón que malla-neuronas) */
/* ------------------------------------------------------------------ */

const HEARTBEAT_MS = 30_000;
const MSG_HB = "vinculo:hb";
const MSG_HB_ACK = "vinculo:hb-ack";

function esMensajeHb(x: unknown): x is { t: typeof MSG_HB; at: number } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.t === MSG_HB && typeof o.at === "number";
}
function esMensajeHbAck(x: unknown): x is { t: typeof MSG_HB_ACK; at: number } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.t === MSG_HB_ACK && typeof o.at === "number";
}

function canalDe(snap: PeerSnapshot | undefined): CanalVinculo {
  if (!snap) return "sin-vinculo";
  if (snap.state === "connected") return "conectado";
  if (snap.state === "connecting") return "conectando";
  if (snap.state === "failed") return "fallido";
  return "sin-vinculo";
}

/* ------------------------------------------------------------------ */
/* Refresco manual (para que la UI no espere el próximo sondeo)       */
/* ------------------------------------------------------------------ */

let forzarSondeoAhora: (() => void) | null = null;

/**
 * refrescarVinculosAhora — la UI la llama justo después de una acción propia
 * (solicitar/aceptar/rechazar/revocar) para que `useVinculos()`/
 * `useVinculosPeers()` reflejen el cambio SIN esperar el próximo sondeo
 * (`POLL_MS`). No-op si el motor no está montado. Nunca lanza.
 */
export function refrescarVinculosAhora(): void {
  try {
    forzarSondeoAhora?.();
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Motor — useVinculosEntreCuentas (montado UNA vez)                  */
/* ------------------------------------------------------------------ */

/**
 * (2026-09-29 · contrato «consumo») Antes: cada 8 s en cada pestaña, oculta o no, con un
 * `getUser()` en cada vuelta (≈ 900 peticiones/h por pestaña). Ahora: pestaña líder,
 * dispositivo visible, cada 10 min (30 min si la cuenta no tiene ningún vínculo); las acciones
 * propias refrescan al momento (`refrescarVinculosAhora`) y el resultado se difunde a las
 * demás pestañas. Los mesh de par dedicados se abren SOLO en la pestaña líder (un dispositivo,
 * una conexión por vínculo).
 */
export const POLL_MS = 10 * MINUTO_MS;
export const POLL_SIN_VINCULOS_MS = 30 * MINUTO_MS;

function liderSeguro(): boolean {
  try {
    return esLider();
  } catch {
    return true;
  }
}

/**
 * useVinculosEntreCuentas — EL MOTOR. Se monta UNA sola vez (ver
 * `MallaNeuronasMount`, junto a `useMallaNeuronas`). Sondea mis filas de
 * `os_mesh_vinculos`, publica el estado para `useVinculos()`, y por cada
 * vínculo `estado='aceptado'` con ambas claves públicas abre (o reutiliza)
 * un `MeshHandle` DEDICADO — nunca toca el mesh compartido intra-cuenta.
 *
 * `deps` inyecta lo que toca red para poder probar el resto sin ella (mismo
 * patrón que `useMallaNeuronas`); en producción se usan los valores reales.
 */
export function useVinculosEntreCuentas(deps?: {
  listarPropias?: () => Promise<Record<string, unknown>[]>;
  ownerId?: () => Promise<string | null>;
}): void {
  const meshesRef = useRef(meshesPorVinculo);
  const hbSentAtRef = useRef<Map<string, number>>(new Map());
  const latenciasRef = useRef<Map<string, number>>(new Map());
  /** Metadatos de cada mesh de par que `MeshHandle` no lleva (owner/permisos del OTRO lado). */
  const metaRef = useRef<Map<string, { ownerOtro: string; permisos: PermisosVinculo }>>(new Map());

  useEffect(() => {
    let cancelado = false;
    /** Lo último leído (propio o difundido): para reabrir los mesh al heredar el liderazgo. */
    let ultimasFilas: { filas: Record<string, unknown>[]; uid: string | null } | null = null;

    const cerrarMesh = (vinculoId: string) => {
      const mesh = meshesRef.current.get(vinculoId);
      if (!mesh) return;
      try {
        mesh.closeMesh();
      } catch {
        /* noop */
      }
      meshesRef.current.delete(vinculoId);
      hbSentAtRef.current.delete(vinculoId);
      latenciasRef.current.delete(vinculoId);
      metaRef.current.delete(vinculoId);
    };

    const refrescarPeers = () => {
      const out: PeerVinculo[] = [];
      for (const [vinculoId, mesh] of meshesRef.current) {
        const snap = mesh.getPeers()[0];
        const meta = metaRef.current.get(vinculoId);
        out.push({
          vinculoId,
          deviceId: snap?.deviceId ?? mesh.myDeviceId,
          ownerOtro: meta?.ownerOtro ?? "",
          permisos: meta?.permisos ?? PERMISOS_VACIOS,
          canal: canalDe(snap),
          latenciaMs: latenciasRef.current.get(vinculoId),
        });
      }
      publicarPeers(out);
    };

    const abrirMeshDeVinculo = async (row: VinculoRow) => {
      if (meshesRef.current.has(row.id)) return;
      if (row.estado !== "aceptado" || !row.rol) return;
      const peerPub = row.rol === "de" ? row.aPub : row.dePub;
      const targetDevice = row.rol === "de" ? row.aDevice : row.deDevice;
      const ownerOtro = row.rol === "de" ? row.aOwner : row.deOwner;
      if (!peerPub || !targetDevice) return;

      const claveParHex = await derivarClaveParHex(peerPub, row.sal);
      if (cancelado || !claveParHex) return;
      const topic = await topicDePar(claveParHex);
      if (cancelado || !topic) return;

      const ids = identidadDispositivo();
      if (!ids.syncDeviceId) return;

      const transport = crearTransporteSenalPar({
        vinculoId: row.id,
        topic,
        claveParHex,
        soyDe: row.rol === "de",
      });
      const mesh = createMesh(ids.syncDeviceId, row.id, transport);
      if (!mesh || cancelado) return;

      metaRef.current.set(row.id, { ownerOtro, permisos: row.permisos });

      mesh.onPeer({
        onState: () => refrescarPeers(),
        onMessage: (deviceId, data) => {
          let msg: unknown;
          try {
            msg = JSON.parse(data);
          } catch {
            msg = undefined;
          }
          if (esMensajeHb(msg)) {
            mesh.sendToPeer(deviceId, JSON.stringify({ t: MSG_HB_ACK, at: msg.at }));
            return;
          }
          if (esMensajeHbAck(msg)) {
            const sentAt = hbSentAtRef.current.get(row.id);
            if (sentAt === msg.at) {
              latenciasRef.current.set(row.id, Math.max(0, Date.now() - sentAt));
              refrescarPeers();
            }
            return;
          }
          // Cualquier otro payload (JSON con otra forma, o texto plano) es de
          // OTRA capa (relé de IA, transferencia de archivos) — se reenvía
          // sin interpretar.
          emitirMensajePar(row.id, data);
        },
      });

      meshesRef.current.set(row.id, mesh);
      refrescarPeers();
      void mesh.connectToDevice(targetDevice);
    };

    /** Publica las filas para la UI y, SOLO en la pestaña líder, abre/cierra los mesh de par. */
    const aplicarFilas = (filas: Record<string, unknown>[], uid: string | null) => {
      if (cancelado) return;
      ultimasFilas = { filas, uid };
      if (!uid) {
        publicarFilas([]);
        return;
      }
      const rows = filas.map((r) => filaARow(r, uid));
      publicarFilas(rows);
      if (!liderSeguro()) return;
      const idsVigentes = new Set(rows.filter((r) => r.estado === "aceptado").map((r) => r.id));
      for (const row of rows) void abrirMeshDeVinculo(row);
      for (const vinculoId of Array.from(meshesRef.current.keys())) {
        if (!idsVigentes.has(vinculoId)) cerrarMesh(vinculoId);
      }
      refrescarPeers();
    };

    const leer = async (): Promise<{ fallo?: FalloConsulta | null; datos?: Record<string, unknown>[]; siguienteMs?: number }> => {
      const uid = (await (deps?.ownerId?.() ?? miOwnerId())) ?? null;
      if (!uid) {
        aplicarFilas([], null);
        return {};
      }
      let filas: Record<string, unknown>[];
      if (deps?.listarPropias) {
        filas = await deps.listarPropias();
      } else {
        const supabase = createClient();
        const res = await supabase
          .from("os_mesh_vinculos")
          .select(COLUMNAS_VINCULO)
          .or(`de_owner.eq.${uid},a_owner.eq.${uid}`)
          .order("created_at", { ascending: false });
        const fallo = falloDe(res as { error?: unknown; status?: number });
        if (fallo || !Array.isArray(res.data)) return { fallo };
        filas = res.data as Record<string, unknown>[];
      }
      aplicarFilas(filas, uid);
      return { datos: filas, siguienteMs: filas.length ? POLL_MS : POLL_SIN_VINCULOS_MS };
    };

    const bucle = crearBucle<Record<string, unknown>[]>({
      nombre: "vínculos entre cuentas",
      consulta: "select os_mesh_vinculos (de_owner|a_owner = yo)",
      intervaloMs: POLL_MS,
      tarea: leer,
      difundir: true,
      // Lo que leyó otra pestaña (la líder, o una que refrescó tras su propia acción).
      alRecibirDatos: (filas) => {
        void (async () => {
          const uid = (await (deps?.ownerId?.() ?? miOwnerId())) ?? null;
          aplicarFilas(Array.isArray(filas) ? filas : [], uid);
        })();
      },
    });
    bucle.iniciar();

    // Heredar el liderazgo abre los mesh; perderlo los cierra (una conexión por dispositivo).
    let liderOff: (() => void) | null = null;
    try {
      liderOff = alCambiarLider((lider) => {
        if (cancelado) return;
        if (lider && ultimasFilas) aplicarFilas(ultimasFilas.filas, ultimasFilas.uid);
        if (!lider) {
          for (const vinculoId of Array.from(meshesRef.current.keys())) cerrarMesh(vinculoId);
          refrescarPeers();
        }
      });
    } catch {
      liderOff = null;
    }

    // Permite a la UI pedir un sondeo INMEDIATO tras su propia acción
    // (solicitar/aceptar/rechazar/revocar) en vez de esperar `POLL_MS`.
    forzarSondeoAhora = () => {
      if (cancelado) return;
      void bucle.ahora();
    };

    return () => {
      cancelado = true;
      bucle.detener();
      liderOff?.();
      if (forzarSondeoAhora) forzarSondeoAhora = null;
      for (const vinculoId of Array.from(meshesRef.current.keys())) cerrarMesh(vinculoId);
      publicarPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Late (heartbeat) por cada canal conectado. */
  useEffect(() => {
    const timer = setInterval(() => {
      for (const [vinculoId, mesh] of meshesRef.current) {
        const peer = mesh.getPeers()[0];
        if (!peer || peer.state !== "connected" || !peer.channelOpen) continue;
        const at = Date.now();
        hbSentAtRef.current.set(vinculoId, at);
        mesh.sendToPeer(peer.deviceId, JSON.stringify({ t: MSG_HB, at }));
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);
}
