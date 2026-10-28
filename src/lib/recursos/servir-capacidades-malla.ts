"use client";

/**
 * servir-capacidades-malla — conecta el lado ANFITRIÓN del relé `capacidad.*`
 * (servir-capacidades.ts) al mesh COMPARTIDO: admite `capacidad.pedir` y
 * `capacidad.cancelar` que llegan de un par, le contesta por el mismo par
 * (trozo/fin/error) y expone `prestamos()` para «Procesos activos». Hermano de
 * los relés `ia.*` y `astraura.*`: misma malla, nunca una segunda. Oferta (los
 * topes que fijan el cupo), sesiones y manejadores se INYECTAN: por defecto el
 * anfitrión vive desde el arranque pero no presta nada (429/403 con honestidad).
 * El cupo se lee UNA vez al crear el anfitrión; las sesiones, en cada petición.
 */
import { crearServidor, type ManejadoresCapacidad, type ServidorCapacidades } from "./servir-capacidades";
import { parseCapacidadMallaMensaje, type Msg } from "@/lib/network/capacidad-por-malla";
import { getSharedMesh } from "@/lib/network/lan-sync";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import type { OfertaNeurona } from "./oferta";
import type { Sesion } from "./sesion-prestamo";

/** Por defecto esta neurona no presta cómputo (topes a cero): responde 429 con honestidad. */
function ofertaPorDefecto(): OfertaNeurona {
  let id = "";
  try { id = identidadDispositivo().syncDeviceId; } catch { id = ""; }
  return {
    nodoId: id, cuentaId: "", medio: "navegador", t: Date.now(),
    computo: { nucleos: 0, ramLibreMb: 0, gpu: false, motores: [] },
    almacen: { prestaMb: 0, volumenes: [] }, apps: [], enlaces: {}, energia: { enUso: false },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 0, ramMb: 0, discoMb: 0, soloCargando: false } },
  };
}

const sesionesProduccion: Sesion[] = [];

export interface DepsServirCapacidadesMalla {
  /** Manejadores: lo que esta neurona sabe servir hoy (por defecto, nada: 404 tras la admisión). */
  manejadores?: ManejadoresCapacidad;
  /** Oferta con los topes de préstamo (el cupo se lee UNA vez al crear el anfitrión). */
  oferta?: () => OfertaNeurona;
  /** Sesiones vigentes, leídas frescas en cada petición (revocables). */
  sesiones?: () => Sesion[];
  ahora?: () => number;
}

/** Anfitrión con sesiones VIVAS: el módulo puro guarda el array, así que se refresca en sitio. */
export function servidorCapacidadesMalla(deps: DepsServirCapacidadesMalla = {}): ServidorCapacidades {
  const vivas = deps.sesiones ?? (() => sesionesProduccion);
  const enSitio: Sesion[] = [];
  const base = crearServidor({
    manejadores: deps.manejadores ?? {},
    oferta: (deps.oferta ?? ofertaPorDefecto)(),
    sesiones: enSitio,
    ahora: deps.ahora ?? (() => Date.now()),
  });
  return {
    atender: async (mensaje, enviar) => {
      enSitio.splice(0, enSitio.length, ...vivas());
      await base.atender(mensaje, enviar);
    },
    prestamos: base.prestamos, cola: base.cola,
  };
}

/** Escucha `capacidad.pedir`/`capacidad.cancelar`; si el par se pierde, cancela lo suyo. */
export function adjuntarServidorCapacidadesMalla(
  mesh: MeshHandle,
  deps: DepsServirCapacidadesMalla = {},
  yaCreado?: ServidorCapacidades,
): () => void {
  const servidor = yaCreado ?? servidorCapacidadesMalla(deps);
  const parDe = new Map<string, string>(); // id de préstamo → par que lo pidió
  const enviarA = (peerId: string) => (salida: Msg): boolean => {
    try { return mesh.sendToPeer(peerId, JSON.stringify(salida)); } catch { return false; }
  };
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseCapacidadMallaMensaje(data);
    if (!msg) return;
    if (msg.t !== "capacidad.pedir" && msg.t !== "capacidad.cancelar") return; // trozo/fin/error: del cliente
    if (msg.t === "capacidad.pedir") parDe.set(msg.id, peerId);
    else parDe.delete(msg.id);
    void servidor.atender(msg, enviarA(peerId));
  };
  const onState: PeerEvents["onState"] = (snap: PeerSnapshot) => {
    if (snap.state === "connected") return;
    for (const p of servidor.prestamos()) {
      if (parDe.get(p.id) !== snap.deviceId || (p.estado !== "enCola" && p.estado !== "vivo")) continue;
      parDe.delete(p.id);
      void servidor.atender({ t: "capacidad.cancelar", id: p.id }, enviarA(snap.deviceId));
    }
  };
  return mesh.onPeer({ onMessage, onState });
}

let servidorTimer: ReturnType<typeof setInterval> | null = null;
let servidorUnsub: (() => void) | null = null;
let servidorActivo: ServidorCapacidades | null = null;

/** El anfitrión en marcha, si lo hay: `prestamos()` y `cola()` para Procesos activos. */
export function servidorCapacidadesMallaActivo(): ServidorCapacidades | null {
  return servidorActivo;
}

/** Arranca (o reintenta hasta que exista) el anfitrión sobre el mesh COMPARTIDO. Idempotente. */
export function iniciarServidorCapacidadesMalla(deps: DepsServirCapacidadesMalla = {}): () => void {
  let cancelado = false;
  const intentar = () => {
    if (cancelado || servidorUnsub) return;
    const mesh = getSharedMesh();
    if (!mesh) return;
    servidorActivo = servidorCapacidadesMalla(deps);
    servidorUnsub = adjuntarServidorCapacidadesMalla(mesh, deps, servidorActivo);
  };
  intentar();
  if (!servidorUnsub) servidorTimer = setInterval(intentar, 2000);
  return () => {
    cancelado = true;
    if (servidorTimer) { clearInterval(servidorTimer); servidorTimer = null; }
    servidorUnsub?.(); servidorUnsub = null; servidorActivo = null;
  };
}
