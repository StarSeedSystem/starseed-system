"use client";

/**
 * transporte-universal — UNA puerta para mensajes, archivos y flujos por el enlace más directo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/transporte-universal-sin-internet.md` (§B.2.1 de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`).
 *
 * Enlaces REALES que conoce (nada simulado):
 *   · local  → canal de datos emparejado SIN internet (`emparejar-sin-internet.ts`, por código/QR, o
 *              abierto solo entre dos apps nativas vinculadas por su canal local: `local:nativo-…`);
 *   · nativo → canal TCP de la app nativa con una neurona VINCULADA de esta red (`nativo:<ip>`,
 *              `red-local-nativa-motor.ts`, MLT1107A): mensajes con el acuse de la otra app y archivos
 *              a su ritmo; sin flujos (van por el enlace local que se abre solo);
 *   · ble    → Bluetooth directo entre dos apps nativas, SIN router ni internet (`ble:<id>`,
 *              `bluetooth-directo-motor.ts`, BLE1108A): mensajes con acuse y archivos ≤ 20 MB a lo
 *              que dé el aire; sin flujos ni llamadas;
 *   · cuenta → canal WebRTC de la malla de la cuenta (`lan-sync`/`webrtc-mesh`);
 *   · par    → canal WebRTC de un vínculo entre cuentas aceptado (`vinculos-entre-cuentas`);
 *   · rele   → relé cifrado del servidor del OS (`server-relay.uploadRelay`, solo mensajes);
 *   · lora   → radio Meshtastic conectada (`sendOverMesh`, solo mensajes cortos).
 * El orden y los descartes los decide `eleccion-enlace.ts` (puro). Cada envío devuelve QUÉ enlace
 * usó, si el otro lado lo CONFIRMÓ (acuse por los canales P2P) y por qué se descartó cada uno.
 *
 * Archivos: el motor de siempre (`archivos-malla.ts`) sobre un canal; si hay más de un enlace P2P
 * abierto al MISMO aparato, sobre un canal multitrayecto que reparte los trozos por capacidad.
 * Flujos (audio/vídeo): solo por el enlace local (renegocia sobre su propia conexión); con
 * internet las llamadas siguen por el sistema de llamadas del chat.
 *
 * Proximidad y consentimiento: un enlace local existe porque las dos personas se pasaron el código
 * en persona (ese gesto es el consentimiento para ESE enlace). Lo que llega por él NUNCA se acepta
 * solo: los archivos siempre preguntan. Este módulo no anuncia a nadie quién está cerca.
 *
 * Pesado → perezoso: vínculos entre cuentas, relé y radio se importan solo al usarlos.
 */

import { capaMeshCompartiendo, getSharedMesh } from "@/lib/network/lan-sync";
import { snapshotMallaNeuronas } from "@/lib/network/malla-neuronas";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import {
  TAM_TROZO_ENLACE_DIRECTO,
  canalDesdeMesh,
  motorArchivosCompartido,
  type CanalArchivos,
  type DestinoArchivo,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";
import {
  elegirEnlaces,
  enlacesParaReparto,
  LORA_MAX_BYTES,
  type DestinoTransporte,
  type EnlaceDisponible,
  type Eleccion,
  type TipoEnlace,
} from "@/lib/malla/eleccion-enlace";
import { crearCanalMultitrayecto, type CanalMultitrayecto } from "@/lib/malla/canal-multitrayecto";
import {
  alRegistrarEnlaceLocal,
  enlaceLocal,
  enlacesLocalesVivos,
  type EnlaceLocalVivo,
} from "@/lib/malla/registro-enlaces-locales";
import { meshDeEnlaceLocal } from "@/lib/malla/mesh-de-enlace-local";
import { esAppNativa } from "@/lib/nativa/puente";
import { ipDeEnlaceNativo } from "@/lib/malla/red-local-nativa";

export type { DestinoTransporte, EnlaceDisponible, TipoEnlace } from "@/lib/malla/eleccion-enlace";

/* ══════════════════════════ Sobre de mensaje (puro) ══════════════════════════ */

export interface SobreMensaje {
  t: "tu.msg";
  v: 1;
  id: string;
  /** Canal de aplicación: «nota», «chat», «estacion», «astraura»… */
  c: string;
  b: unknown;
  /** Quién lo manda (id de sincronización y nombre del aparato). */
  de?: { s?: string; n?: string };
}

export interface SobreAcuse {
  t: "tu.ack";
  id: string;
}

export function esSobreMensaje(x: unknown): x is SobreMensaje {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.t === "tu.msg" && typeof o.id === "string" && o.id.length <= 80 && typeof o.c === "string" && o.c.length <= 40;
}

export function esSobreAcuse(x: unknown): x is SobreAcuse {
  return !!x && typeof x === "object" && (x as Record<string, unknown>).t === "tu.ack" && typeof (x as Record<string, unknown>).id === "string";
}

/**
 * ¿Es un mensaje de esta capa? (filtro barato antes de parsear). Devuelve boolean, no un predicado
 * de tipo: un «no» no significa «no es texto» (puede ser texto de otra capa, como `archivo.*`).
 */
export function esTextoTransporte(data: unknown): boolean {
  return typeof data === "string" && data.startsWith('{"t":"tu.');
}

/** Forma corta para relé y LoRa: los campos que la radio deja pasar (`to`, `txt`, `cv`). */
export function formaCorta(sobre: SobreMensaje, uidDestino?: string): { to: string; txt: string; cv: string } {
  let txt = "";
  try {
    txt = JSON.stringify(sobre.b ?? null);
  } catch {
    txt = "null";
  }
  return { to: uidDestino ?? "", txt, cv: `tu:${sobre.c}:${sobre.id}` };
}

/** Lee la forma corta recibida por relé o LoRa. Null si no es de esta capa. */
export function leerFormaCorta(body: unknown): { id: string; canal: string; cuerpo: unknown; to: string } | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.cv !== "string" || !o.cv.startsWith("tu:")) return null;
  const partes = o.cv.split(":");
  if (partes.length < 3) return null;
  const canal = partes[1];
  const id = partes.slice(2).join(":");
  if (!canal || !id) return null;
  let cuerpo: unknown = null;
  try {
    cuerpo = typeof o.txt === "string" ? JSON.parse(o.txt) : null;
  } catch {
    cuerpo = o.txt;
  }
  return { id, canal, cuerpo, to: typeof o.to === "string" ? o.to : "" };
}

/* ══════════════════════════ Envío con conmutación (inyectable) ══════════════════════════ */

export interface IntentoEnvio {
  enlaceId: string;
  tipo: TipoEnlace;
  ok: boolean;
  detalle: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** El otro lado acusó recibo (solo canales P2P; relé y LoRa no confirman). */
  confirmado: boolean;
  enlace: { id: string; tipo: TipoEnlace; etiqueta: string } | null;
  intentos: IntentoEnvio[];
  descartados: Eleccion["descartados"];
  motivo?: string;
}

export interface DepsEnvio {
  listar(): Promise<EnlaceDisponible[]>;
  enviarP2P(enlace: EnlaceDisponible, texto: string): boolean;
  enviarRele(destino: DestinoTransporte, sobre: SobreMensaje): Promise<{ ok: boolean; detalle: string }>;
  enviarLora(destino: DestinoTransporte, sobre: SobreMensaje): Promise<{ ok: boolean; detalle: string }>;
  esperarAcuse(id: string, ms: number): Promise<boolean>;
  nuevoId(): string;
  origen(): { s?: string; n?: string };
  /**
   * Canal TCP de la app nativa (`nativo:<ip>`): se resuelve con el ACUSE de la otra app (lo guardó),
   * así que un «ok» ya es entrega confirmada. Sin él, el enlace nativo se da por fallido.
   */
  enviarNativo?(enlace: EnlaceDisponible, texto: string): Promise<{ ok: boolean; detalle: string }>;
  /** (BLE1108A) Bluetooth directo (`ble:<id>`): como el nativo, un «ok» es el ACUSE de la otra app. */
  enviarBle?(enlace: EnlaceDisponible, texto: string): Promise<{ ok: boolean; detalle: string }>;
}

export interface OpcionesEnvio {
  /** Cuánto esperar el acuse de un canal P2P antes de probar el siguiente (ms). */
  esperarAcuseMs?: number;
}

const ESPERA_ACUSE_MS = 2500;

function tamano(x: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(x ?? null)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * crearEnviador — la lógica de envío con dependencias inyectadas (para probarla sin red).
 * Prueba los enlaces en el orden de `elegirEnlaces`; por un canal P2P espera el acuse y, si no
 * llega, sigue con el siguiente (el receptor descarta los duplicados por id).
 */
export function crearEnviador(deps: DepsEnvio) {
  return async function enviarMensaje(
    destino: DestinoTransporte,
    canal: string,
    cuerpo: unknown,
    opts: OpcionesEnvio = {},
  ): Promise<ResultadoEnvio> {
    const espera = opts.esperarAcuseMs ?? ESPERA_ACUSE_MS;
    let lista: EnlaceDisponible[] = [];
    try {
      lista = await deps.listar();
    } catch {
      lista = [];
    }
    const eleccion = elegirEnlaces(lista, destino, "mensaje", tamano(cuerpo), {});
    const intentos: IntentoEnvio[] = [];
    const base = { intentos, descartados: eleccion.descartados };
    if (!eleccion.elegidos.length) {
      return {
        ...base,
        ok: false,
        confirmado: false,
        enlace: null,
        motivo: lista.length ? "Ningún enlace abierto llega a ese destino." : "No hay ningún enlace abierto ahora mismo.",
      };
    }
    const sobre: SobreMensaje = { t: "tu.msg", v: 1, id: deps.nuevoId(), c: canal, b: cuerpo, de: deps.origen() };
    const texto = JSON.stringify(sobre);
    let enviadoSinAcuse: EnlaceDisponible | null = null;
    for (const { enlace } of eleccion.elegidos) {
      const ref = { id: enlace.id, tipo: enlace.tipo, etiqueta: enlace.etiqueta };
      if (enlace.tipo === "rele" || enlace.tipo === "lora") {
        let r: { ok: boolean; detalle: string };
        try {
          r = enlace.tipo === "rele" ? await deps.enviarRele(destino, sobre) : await deps.enviarLora(destino, sobre);
        } catch {
          r = { ok: false, detalle: "fallo al enviar" };
        }
        intentos.push({ enlaceId: enlace.id, tipo: enlace.tipo, ok: r.ok, detalle: r.detalle });
        if (r.ok) return { ...base, ok: true, confirmado: false, enlace: ref };
        continue;
      }
      if (enlace.tipo === "nativo" || enlace.tipo === "ble") {
        const via = enlace.tipo === "ble" ? deps.enviarBle : deps.enviarNativo;
        let r: { ok: boolean; detalle: string } = {
          ok: false,
          detalle: enlace.tipo === "ble" ? "el Bluetooth directo de la app nativa no está activo" : "el canal local de la app nativa no está activo",
        };
        if (via) {
          try {
            r = await via(enlace, texto);
          } catch {
            r = { ok: false, detalle: "fallo al enviar" };
          }
        }
        intentos.push({ enlaceId: enlace.id, tipo: enlace.tipo, ok: r.ok, detalle: r.detalle });
        if (r.ok) return { ...base, ok: true, confirmado: true, enlace: ref };
        continue;
      }
      let enviado = false;
      try {
        enviado = deps.enviarP2P(enlace, texto);
      } catch {
        enviado = false;
      }
      if (!enviado) {
        intentos.push({ enlaceId: enlace.id, tipo: enlace.tipo, ok: false, detalle: "el canal no aceptó el envío" });
        continue;
      }
      const acuse = espera > 0 ? await deps.esperarAcuse(sobre.id, espera) : false;
      if (acuse) {
        intentos.push({ enlaceId: enlace.id, tipo: enlace.tipo, ok: true, detalle: "entregado y confirmado" });
        return { ...base, ok: true, confirmado: true, enlace: ref };
      }
      intentos.push({ enlaceId: enlace.id, tipo: enlace.tipo, ok: true, detalle: `enviado sin acuse en ${Math.round(espera / 100) / 10} s` });
      enviadoSinAcuse ??= enlace;
    }
    if (enviadoSinAcuse) {
      return {
        ...base,
        ok: true,
        confirmado: false,
        enlace: { id: enviadoSinAcuse.id, tipo: enviadoSinAcuse.tipo, etiqueta: enviadoSinAcuse.etiqueta },
        motivo: "Enviado, pero el otro aparato no confirmó la llegada.",
      };
    }
    return { ...base, ok: false, confirmado: false, enlace: null, motivo: "Todos los enlaces fallaron." };
  };
}

/* ══════════════════════════ Enlaces reales ══════════════════════════ */

type ModVinculos = typeof import("@/lib/network/vinculos-entre-cuentas");
let modVinculos: ModVinculos | null = null;
let uidCache: string | null = null;

async function cargarVinculos(): Promise<ModVinculos | null> {
  if (modVinculos) return modVinculos;
  try {
    modVinculos = await import("@/lib/network/vinculos-entre-cuentas");
  } catch {
    modVinculos = null;
  }
  return modVinculos;
}

async function miUid(): Promise<string | null> {
  try {
    const m = await import("@/lib/consumo/usuario");
    uidCache = (await m.uidActual()) ?? null;
  } catch {
    /* sin sesión local: se queda el último conocido */
  }
  return uidCache;
}

function enlaceLocalDisponible(e: EnlaceLocalVivo): EnlaceDisponible {
  return {
    id: e.id,
    tipo: "local",
    etiqueta: e.par.nombre || "Aparato vinculado",
    alcanza: { syncDeviceId: e.par.syncDeviceId, neuronDeviceId: e.par.neuronDeviceId, uid: e.par.uid },
    abierto: e.abierto(),
    sinInternet: true,
    ruta: e.ruta(),
    rttMs: e.rttMs(),
    capacidadKbps: e.capacidadKbps(),
    admite: { mensaje: true, archivo: true, flujo: true },
  };
}

type ModNativo = typeof import("@/lib/malla/red-local-nativa-motor");
let modNativo: ModNativo | null = null;

/** El enlace `nativo:<ip>` solo existe en la app nativa (en el navegador ni se carga). */
async function cargarNativo(): Promise<ModNativo | null> {
  if (modNativo) return modNativo;
  if (!esAppNativa()) return null;
  try {
    modNativo = await import("@/lib/malla/red-local-nativa-motor");
  } catch {
    modNativo = null;
  }
  return modNativo;
}

type ModBle = typeof import("@/lib/malla/bluetooth-directo-motor");
let modBle: ModBle | null = null;

/** (BLE1108A) El enlace `ble:<id>` solo existe en la app nativa (en el navegador ni se carga). */
async function cargarBle(): Promise<ModBle | null> {
  if (modBle) return modBle;
  if (!esAppNativa()) return null;
  try {
    modBle = await import("@/lib/malla/bluetooth-directo-motor");
  } catch {
    modBle = null;
  }
  return modBle;
}

/** «ble:b3» → «b3» (sin importar el módulo puro: el transporte no carga el radar). */
function enlaceBleDe(id: string): string | null {
  return /^ble:b\d{1,9}$/.test(id) ? id.slice(4) : null;
}

/**
 * (MLL1107A) Antes de elegir el medio de un mensaje a UNA neurona: si es la app nativa y el faro oye esa
 * neurona sin enlace `nativo:<ip>`, la saluda ya y espera un momento (`asegurarLigadura`). Devuelve qué
 * pasó con el canal local (para decir por qué no se usó), o null fuera de la app nativa. Nunca lanza.
 */
export async function prepararEnlaceNativo(
  neurona: string,
  esperaMs?: number,
): Promise<{ estado: string; ip?: string; motivo: string; esperadoMs: number } | null> {
  try {
    const red = (await cargarNativo())?.redLocalNativaActiva();
    if (!red) return null;
    return await red.asegurarLigadura(neurona, esperaMs);
  } catch {
    return null;
  }
}

/** Todos los enlaces reales que hay ahora mismo, con lo medido de cada uno. Nunca lanza. */
export async function enlacesDisponibles(): Promise<EnlaceDisponible[]> {
  const out: EnlaceDisponible[] = [];
  for (const e of enlacesLocalesVivos()) out.push(enlaceLocalDisponible(e));
  try {
    out.push(...((await cargarNativo())?.redLocalNativaActiva()?.enlaces() ?? []));
  } catch {
    /* sin canal local nativo */
  }
  try {
    // (BLE1108A) Bluetooth directo entre las apps nativas (sin router).
    out.push(...((await cargarBle())?.bluetoothDirectoActivo()?.enlaces() ?? []));
  } catch {
    /* sin Bluetooth directo */
  }

  const uid = await miUid();
  try {
    const mesh = getSharedMesh();
    const filas = new Map(snapshotMallaNeuronas().misDispositivos.filter((f) => f.syncDeviceId).map((f) => [f.syncDeviceId as string, f]));
    for (const p of mesh?.getPeers() ?? []) {
      if (p.state !== "connected" || !p.channelOpen) continue;
      const fila = filas.get(p.deviceId);
      const ruta = fila?.enlace.ruta?.clase ?? null;
      out.push({
        id: `cuenta:${p.deviceId}`,
        tipo: "cuenta",
        etiqueta: fila?.nombre ?? "Aparato de tu cuenta",
        alcanza: { syncDeviceId: p.deviceId, neuronDeviceId: fila?.neuronId, uid: uid ?? undefined },
        abierto: true,
        sinInternet: ruta === "misma-red-local",
        ruta,
        rttMs: fila?.enlace.latenciaMs ?? fila?.enlace.ruta?.rttMs ?? null,
        capacidadKbps: null,
        admite: { mensaje: true, archivo: true, flujo: false },
      });
    }
  } catch {
    /* sin malla de la cuenta */
  }

  const vinc = await cargarVinculos();
  try {
    for (const v of vinc?.vinculosActivos() ?? []) {
      if (v.canal !== "conectado") continue;
      out.push({
        id: `par:${v.vinculoId}`,
        tipo: "par",
        etiqueta: "Vínculo entre cuentas",
        alcanza: { syncDeviceId: v.deviceId, uid: v.ownerOtro },
        abierto: true,
        sinInternet: false,
        ruta: null,
        rttMs: v.latenciaMs ?? null,
        capacidadKbps: null,
        admite: { mensaje: true, archivo: !!v.permisos?.archivos, flujo: false },
      });
    }
  } catch {
    /* sin vínculos */
  }

  const enLinea = typeof navigator === "undefined" ? false : navigator.onLine !== false;
  out.push({
    id: "rele",
    tipo: "rele",
    etiqueta: "Relé cifrado del servidor",
    alcanza: { difusion: true },
    abierto: enLinea && !!uid,
    sinInternet: false,
    admite: { mensaje: true, archivo: false, flujo: false },
  });

  try {
    const { getMeshState } = await import("@/ai/astraura/mesh/store");
    const s = getMeshState();
    out.push({
      id: "lora",
      tipo: "lora",
      etiqueta: "Radio LoRa",
      alcanza: { difusion: true },
      abierto: s.status === "ready" || s.status === "degraded",
      sinInternet: true,
      maxBytes: LORA_MAX_BYTES,
      admite: { mensaje: true, archivo: false, flujo: false },
    });
  } catch {
    /* sin módulo de radio */
  }
  return out;
}

function enviarP2PReal(enlace: EnlaceDisponible, texto: string): boolean {
  if (enlace.tipo === "local") return !!enlaceLocal(enlace.id)?.enviar(texto);
  if (enlace.tipo === "cuenta") {
    const mesh = getSharedMesh();
    return !!mesh && !!enlace.alcanza.syncDeviceId && mesh.sendToPeer(enlace.alcanza.syncDeviceId, texto);
  }
  if (enlace.tipo === "par") return !!modVinculos?.enviarAPar(enlace.id.slice(4), texto);
  return false;
}

const esperasAcuse = new Map<string, (ok: boolean) => void>();

function esperarAcuseReal(id: string, ms: number): Promise<boolean> {
  return new Promise((resolver) => {
    const t = setTimeout(() => {
      esperasAcuse.delete(id);
      resolver(false);
    }, ms);
    esperasAcuse.set(id, (ok) => {
      clearTimeout(t);
      esperasAcuse.delete(id);
      resolver(ok);
    });
  });
}

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Envía un mensaje por el enlace más directo disponible. Nunca lanza. */
export const enviarMensaje = crearEnviador({
  listar: enlacesDisponibles,
  enviarP2P: enviarP2PReal,
  async enviarRele(destino, sobre) {
    if (!destino.identidadRele) return { ok: false, detalle: "sin identidad del destinatario para el relé" };
    const { uploadRelay } = await import("@/ai/astraura/mesh/server-relay");
    const r = await uploadRelay({ cls: "P1", ptype: "message", body: formaCorta(sobre, destino.uid), recipient: destino.identidadRele, oid: sobre.id });
    return { ok: r.ok, detalle: r.detail };
  },
  async enviarLora(destino, sobre) {
    const corta = formaCorta(sobre, destino.uid);
    if (tamano(corta) > LORA_MAX_BYTES) return { ok: false, detalle: `no cabe en un paquete LoRa (${LORA_MAX_BYTES} B)` };
    const { sendOverMesh } = await import("@/ai/astraura/mesh");
    const r = sendOverMesh({ type: "message", cls: "P1", body: corta, dest: destino.nodoLora });
    const porRadio = r.decision.route === "mesh" || r.decision.route === "dual" || r.decision.route === "queued-mesh";
    return { ok: porRadio, detalle: porRadio ? `en cola de la radio (${r.decision.route})` : "la radio no lo admite ahora" };
  },
  esperarAcuse: esperarAcuseReal,
  nuevoId,
  origen: () => {
    try {
      return { s: identidadDispositivo().syncDeviceId };
    } catch {
      return {};
    }
  },
  async enviarNativo(enlace, texto) {
    const ip = ipDeEnlaceNativo(enlace.id);
    const red = (await cargarNativo())?.redLocalNativaActiva();
    if (!ip || !red) return { ok: false, detalle: "el canal local de la app nativa no está activo" };
    const r = await red.enviarTexto(ip, texto);
    return r.ok
      ? { ok: true, detalle: `entregado: la app del otro aparato acusó recibo${typeof r.ms === "number" ? ` (${r.ms} ms)` : ""}` }
      : { ok: false, detalle: r.motivo ?? "no salió por la red local" };
  },
  async enviarBle(enlace, texto) {
    const b = enlaceBleDe(enlace.id);
    const red = (await cargarBle())?.bluetoothDirectoActivo();
    if (!b || !red) return { ok: false, detalle: "el Bluetooth directo de la app nativa no está activo" };
    const r = await red.enviarTexto(b, texto);
    return r.ok
      ? { ok: true, detalle: `entregado por Bluetooth directo: la app del otro aparato acusó recibo${typeof r.ms === "number" ? ` (${r.ms} ms)` : ""}` }
      : { ok: false, detalle: r.motivo ?? "no salió por Bluetooth" };
  },
});

/* ══════════════════════════ Recepción ══════════════════════════ */

export interface MensajeEntrante {
  id: string;
  canal: string;
  cuerpo: unknown;
  origen: { tipo: TipoEnlace; enlaceId: string; etiqueta: string; syncDeviceId?: string };
  at: number;
}

const oyentesCanal = new Map<string, Set<(m: MensajeEntrante) => void>>();
const vistos: string[] = [];
const vistosSet = new Set<string>();

/** Escucha los mensajes de un canal de aplicación, lleguen por el enlace que lleguen. */
export function alRecibirMensaje(canal: string, cb: (m: MensajeEntrante) => void): () => void {
  let set = oyentesCanal.get(canal);
  if (!set) {
    set = new Set();
    oyentesCanal.set(canal, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

function entregar(m: MensajeEntrante): void {
  if (vistosSet.has(m.id)) return; // llegó por dos caminos: una sola vez
  vistosSet.add(m.id);
  vistos.push(m.id);
  if (vistos.length > 1000) vistosSet.delete(vistos.shift() as string);
  for (const cb of Array.from(oyentesCanal.get(m.canal) ?? [])) {
    try {
      cb(m);
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
}

/** Despacha un texto `tu.*` llegado por un canal P2P; responde el acuse por el mismo canal. */
export function despacharTextoTransporte(
  data: string,
  origen: MensajeEntrante["origen"],
  responder: (texto: string) => void,
): void {
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  if (esSobreAcuse(msg)) {
    esperasAcuse.get(msg.id)?.(true);
    return;
  }
  if (!esSobreMensaje(msg)) return;
  try {
    responder(JSON.stringify({ t: "tu.ack", id: msg.id } satisfies SobreAcuse));
  } catch {
    /* sin acuse: el otro lado probará otro camino */
  }
  entregar({ id: msg.id, canal: msg.c, cuerpo: msg.b, origen: { ...origen, syncDeviceId: msg.de?.s ?? origen.syncDeviceId }, at: Date.now() });
}

/* ══════════════════════════ Archivos ══════════════════════════ */

function canalDeEnlaceLocal(e: EnlaceLocalVivo): CanalArchivos {
  return {
    enviar: (t) => e.enviar(t),
    enviarBinario: (b) => e.enviarBinario(b),
    bufferedAmount: () => e.bufferedAmount(),
    // (ARC1108B) Data channel propio y binario: trozos de 63 KiB (4 veces menos escrituras en el otro).
    tamanoTrozo: () => TAM_TROZO_ENLACE_DIRECTO,
    // (BLE1108B) La ruta medida del data channel (par de candidatos), no la que dice el origen del enlace.
    rutaMedida: () => e.ruta(),
    alMensaje: (cb) => e.alMensaje(cb),
  };
}

const canalesLocales = new Map<string, CanalArchivos>();
function canalLocalEstable(e: EnlaceLocalVivo): CanalArchivos {
  let c = canalesLocales.get(e.id);
  if (!c) {
    c = canalDeEnlaceLocal(e);
    canalesLocales.set(e.id, c);
  }
  return c;
}

/** (BLE1108B) A todo canal se le añade la ruta que mide este aparato de SU enlace. */
function canalDeEnlace(e: EnlaceDisponible): CanalArchivos | null {
  const c = canalDeEnlaceBase(e);
  if (!c || c.rutaMedida) return c;
  const ruta = e.tipo === "ble" ? "bluetooth-directo" : e.tipo === "nativo" ? "misma-red-local" : e.ruta ?? null;
  return { ...c, rutaMedida: () => ruta };
}

function canalDeEnlaceBase(e: EnlaceDisponible): CanalArchivos | null {
  if (e.tipo === "local") {
    const vivo = enlaceLocal(e.id);
    return vivo ? canalLocalEstable(vivo) : null;
  }
  if (e.tipo === "nativo") {
    const ip = ipDeEnlaceNativo(e.id);
    const red = modNativo?.redLocalNativaActiva();
    return ip && red ? red.canalArchivos(ip) : null;
  }
  if (e.tipo === "ble") {
    // (BLE1108A) Trozos de 10 KiB (en base64 caben en una trama Bluetooth de 16 KiB).
    const b = enlaceBleDe(e.id);
    const red = modBle?.bluetoothDirectoActivo();
    return b && red ? red.canalArchivos(b) : null;
  }
  if (e.tipo === "cuenta") {
    const mesh = getSharedMesh();
    return mesh && e.alcanza.syncDeviceId ? canalDesdeMesh(mesh, e.alcanza.syncDeviceId) : null;
  }
  if (e.tipo === "par" && modVinculos) {
    const vinculoId = e.id.slice(4);
    const m = modVinculos;
    return {
      enviar: (t) => m.enviarAPar(vinculoId, t),
      alMensaje: (cb) => m.onMensajeDePar((v, d) => (v === vinculoId ? cb(d) : undefined)),
    };
  }
  return null;
}

export interface CanalArchivoElegido {
  canal: CanalArchivos | null;
  /** Enlaces que usará, el principal primero. */
  enlaces: EnlaceDisponible[];
  /** Presente si reparte por varios enlaces: dice cuántos trozos fueron por cada uno. */
  multi: CanalMultitrayecto | null;
  descartados: Eleccion["descartados"];
  motivo?: string;
}

/** Elige el canal para un archivo hacia `destino` (multitrayecto si hay varios enlaces al mismo aparato). */
export async function canalParaArchivo(destino: DestinoTransporte, bytes = 0): Promise<CanalArchivoElegido> {
  const eleccion = elegirEnlaces(await enlacesDisponibles(), destino, "archivo", bytes, {});
  const enlaces = enlacesParaReparto(eleccion);
  const subs = enlaces
    .map((e) => ({ e, canal: canalDeEnlace(e) }))
    .filter((x): x is { e: EnlaceDisponible; canal: CanalArchivos } => !!x.canal);
  if (!subs.length) {
    return { canal: null, enlaces: [], multi: null, descartados: eleccion.descartados, motivo: "No hay ningún enlace P2P abierto hacia ese aparato." };
  }
  if (subs.length === 1) return { canal: subs[0].canal, enlaces: [subs[0].e], multi: null, descartados: eleccion.descartados };
  const multi = crearCanalMultitrayecto(subs.map((x) => ({ id: x.e.id, canal: x.canal, capacidadKbps: x.e.capacidadKbps })));
  return { canal: multi, enlaces: subs.map((x) => x.e), multi, descartados: eleccion.descartados };
}

export interface ResultadoArchivo {
  ok: boolean;
  id?: string;
  enlaces: Array<{ id: string; tipo: TipoEnlace; etiqueta: string }>;
  multi: CanalMultitrayecto | null;
  motivo?: string;
  aviso?: string;
}

/** Envía un archivo por el/los enlaces más directos. Nunca lanza. */
export async function enviarArchivo(
  destino: DestinoTransporte,
  archivo: Blob,
  nombre: string,
  destinoArchivo?: DestinoArchivo,
  motor: MotorArchivos = motorArchivosCompartido(),
): Promise<ResultadoArchivo> {
  const elegido = await canalParaArchivo(destino, archivo.size);
  // (WFD1108A) Un archivo grande a una neurona vecina puede abrir (o proponer) el enlace Wi-Fi directo.
  avisarAnchoWifi({ destino, clase: "archivo", bytes: archivo.size, enlace: elegido.enlaces[0] ?? null });
  const enlaces = elegido.enlaces.map((e) => ({ id: e.id, tipo: e.tipo, etiqueta: e.etiqueta }));
  if (!elegido.canal) return { ok: false, enlaces, multi: null, motivo: elegido.motivo };
  const dest: DestinoArchivo = destinoArchivo ?? { tipo: "dispositivo", id: destino.syncDeviceId ?? destino.enlaceId ?? enlaces[0]?.id };
  try {
    const r = await motor.enviarArchivo(elegido.canal, archivo, nombre, dest);
    return { ok: r.ok, id: r.id, enlaces, multi: elegido.multi, motivo: r.error, aviso: r.aviso };
  } catch {
    return { ok: false, enlaces, multi: elegido.multi, motivo: "No se pudo empezar el envío." };
  }
}

/* ══════════════════════════ Canal de datos en vivo (NEU1107A) ══════════════════════════ */

export interface CanalDatosAbierto {
  enlace: { id: string; tipo: TipoEnlace; etiqueta: string; ruta: string | null; rttMs: number | null };
  /** Manda un cuerpo por ese enlace SIN esperar acuse (tiempo real). false si el canal no lo aceptó. */
  enviar(cuerpo: unknown): boolean;
  /** Bytes en cola del enlace (si lo da), para que quien emite frene. */
  enCola(): number | null;
}

/**
 * abrirCanalDatos — canal de datos EN VIVO hacia `destino` por UN enlace P2P (local, malla de la
 * cuenta o vínculo entre cuentas; respeta `destino.enlaceId` si se da). Cada envío es un sobre
 * `tu.msg` del canal de aplicación `canal`, sin esperar el acuse de cada uno: el receptor lo recibe
 * con `alRecibirMensaje(canal)` y descarta duplicados por id. Relé y LoRa no llevan flujos (se dice
 * en `descartados`). Nunca lanza.
 */
export async function abrirCanalDatos(
  destino: DestinoTransporte,
  canal: string,
): Promise<{ ok: true; canal: CanalDatosAbierto } | { ok: false; motivo: string; descartados: Eleccion["descartados"] }> {
  let lista: EnlaceDisponible[] = [];
  try {
    lista = await enlacesDisponibles();
  } catch {
    lista = [];
  }
  const eleccion = elegirEnlaces(lista, destino, "mensaje", 0, {});
  const descartados = [...eleccion.descartados];
  let elegido: EnlaceDisponible | null = null;
  for (const { enlace } of eleccion.elegidos) {
    if (enlace.tipo === "rele" || enlace.tipo === "lora") {
      descartados.push({ id: enlace.id, tipo: enlace.tipo, motivo: enlace.tipo === "lora" ? "LoRa no lleva transmisiones en vivo" : "el relé del servidor no lleva transmisiones en vivo" });
      continue;
    }
    if (enlace.tipo === "nativo") {
      descartados.push({ id: enlace.id, tipo: enlace.tipo, motivo: "el canal TCP de la app nativa no lleva transmisiones en vivo: van por el enlace directo que abren solas las dos apps" });
      continue;
    }
    if (enlace.tipo === "ble") {
      descartados.push({ id: enlace.id, tipo: enlace.tipo, motivo: "el Bluetooth directo no lleva transmisiones en vivo (decenas de KB/s, con acuse por trama)" });
      continue;
    }
    elegido ??= enlace;
  }
  if (!elegido) return { ok: false, motivo: "No hay ningún enlace P2P abierto hacia ese aparato.", descartados };
  const e = elegido;
  const origen = (() => {
    try {
      return { s: identidadDispositivo().syncDeviceId };
    } catch {
      return {};
    }
  })();
  return {
    ok: true,
    canal: {
      enlace: { id: e.id, tipo: e.tipo, etiqueta: e.etiqueta, ruta: e.ruta ?? null, rttMs: typeof e.rttMs === "number" ? e.rttMs : null },
      enviar(cuerpo) {
        const sobre: SobreMensaje = { t: "tu.msg", v: 1, id: nuevoId(), c: canal, b: cuerpo, de: origen };
        try {
          return enviarP2PReal(e, JSON.stringify(sobre));
        } catch {
          return false;
        }
      },
      enCola() {
        try {
          if (e.tipo === "local") return enlaceLocal(e.id)?.bufferedAmount() ?? null;
          if (e.tipo === "cuenta" && e.alcanza.syncDeviceId) {
            const mesh = getSharedMesh();
            return mesh?.bufferedAmount ? (mesh.bufferedAmount as (d: string) => number)(e.alcanza.syncDeviceId) : null;
          }
        } catch {
          /* sin medida */
        }
        return null;
      },
    },
  };
}

/* ══════════════════════════ Flujos (audio/vídeo) ══════════════════════════ */

/**
 * Enlace local que llega a `destino`, si lo hay (las llamadas directas van solo por ahí). (LLA1108A) Con
 * varios, el más NUEVO: el viejo pudo quedar medio abierto (el otro aparato pasó a segundo plano) y se
 * tragaba el timbre; antes ganaba el primero que se registró.
 */
export function enlaceLocalHacia(destino: DestinoTransporte): EnlaceLocalVivo | null {
  let mejor: EnlaceLocalVivo | null = null;
  for (const e of enlacesLocalesVivos()) {
    const d = enlaceLocalDisponible(e);
    if (!elegirEnlaces([d], destino, "flujo", 0, {}).elegidos.length) continue;
    if (!mejor || e.desde > mejor.desde) mejor = e;
  }
  return mejor;
}

/** Pone un flujo de audio/vídeo hacia `destino` por el enlace local. Dice con honestidad si no se puede. */
export async function abrirFlujo(destino: DestinoTransporte, stream: MediaStream): Promise<{ ok: boolean; enlaceId?: string; motivo?: string }> {
  const e = enlaceLocalHacia(destino);
  // (WFD1108A) Una llamada, la pantalla o una transmisión: el enlace Wi-Fi directo se retiene mientras viva
  // el flujo y, si el enlace de ahora no basta, se abre (o se propone).
  avisarAnchoWifi({ destino, clase: stream.getVideoTracks().length ? "flujo" : "llamada", enlace: e ? enlaceLocalDisponible(e) : null, flujo: stream });
  if (!e) {
    return {
      ok: false,
      motivo:
        "Sin un enlace local con ese aparato no hay llamada directa: vinculad los dos con «Vincular sin internet» (entre dos apps nativas vinculadas en la misma red se abre solo en unos segundos). Con internet, la llamada va por el sistema de llamadas del chat.",
    };
  }
  const ok = await e.ponerPistas(stream);
  return ok ? { ok, enlaceId: e.id } : { ok, enlaceId: e.id, motivo: "El navegador no dejó añadir el audio o el vídeo." };
}

/* ══════════════════════════ Enlace Wi-Fi directo (WFD1108A) ══════════════════════════ */

/**
 * Avisa al motor del enlace Wi-Fi directo de que un envío pesado va hacia `destino` (perezoso: no carga
 * nada si el motor no arrancó, es decir, fuera de la app nativa). Nunca lanza ni espera.
 */
function avisarAnchoWifi(p: {
  destino: DestinoTransporte;
  clase: "archivo" | "llamada" | "flujo";
  bytes?: number;
  enlace: EnlaceDisponible | null;
  flujo?: MediaStream;
}): void {
  void import("./enlace-wifi-motor")
    .then((m) =>
      m.alNecesitarAncho({
        destino: { neuronDeviceId: p.destino.neuronDeviceId, syncDeviceId: p.destino.syncDeviceId },
        clase: p.clase,
        bytes: p.bytes,
        enlace: p.enlace,
        flujo: p.flujo ?? null,
      }),
    )
    .catch(() => undefined);
}

/* ══════════════════════════ Arranque global ══════════════════════════ */

let arrancado = 0;
let recepcionLocal = false;

/**
 * asegurarRecepcionLocal — atiende lo que llega por los enlaces LOCALES: mensajes `tu.*` (con
 * acuse) y archivos, que SIEMPRE preguntan (el gesto de pasarse el código da permiso a preguntar,
 * nunca a aceptar solo). Idempotente y sin parada: un enlace local vive en esta pestaña y su
 * escucha muere con él. La llaman el arranque global y la interfaz de emparejado (que también se
 * abre en rutas donde el arranque global no corre).
 */
export function asegurarRecepcionLocal(): void {
  if (recepcionLocal) return;
  recepcionLocal = true;
  alRegistrarEnlaceLocal((e) => {
    // Relés de Astraura e IA también por el enlace local: mismo contrato que la malla
    // de la cuenta, solo si esta neurona está compartiendo capa mesh (pesado → perezoso).
    if (capaMeshCompartiendo()) {
      void import("@/lib/network/astraura-por-malla")
        .then((m) => m.adjuntarServidorAstrauraMalla(meshDeEnlaceLocal(e)))
        .catch(() => undefined);
      void import("@/lib/network/ia-por-malla")
        .then((m) => m.adjuntarServidorIaMalla(meshDeEnlaceLocal(e)))
        .catch(() => undefined);
    }
    const canal = canalLocalEstable(e);
    e.alMensaje((data) => {
      if (esTextoTransporte(data)) {
        despacharTextoTransporte(data as string, { tipo: "local", enlaceId: e.id, etiqueta: e.par.nombre, syncDeviceId: e.par.syncDeviceId }, (t) => {
          e.enviar(t);
        });
        return;
      }
      if (typeof data !== "string" || data.startsWith('{"t":"archivo.')) {
        const nativa = e.par.origen === "red-local-nativa";
        motorArchivosCompartido().manejarMensaje(canal, data, {
          mismaCuenta: false,
          etiquetaOrigen: `${e.par.nombre || "Aparato vinculado"} (${nativa ? "red local · app nativa" : "sin internet"})`,
          verificarPermiso: () => true,
          // (ARC1108A) Para la ventana del envío: por dónde llegó y cómo se sabe quién es.
          // (BLE1108B) Y con la ruta MEDIDA del canal: un enlace abierto en la red local que luego sigue por internet no dice «red local».
          via: etiquetaViaLocal(nativa, e.ruta()),
          verificacion: nativa
            ? { tipo: "firma", texto: "Enlace abierto con señales firmadas por su identidad de malla (neurona vinculada)" }
            : { tipo: "codigo", texto: "Emparejado en persona con un código" },
        });
      }
    });
  });
}

/**
 * iniciarTransporteUniversal — engancha la RECEPCIÓN: mensajes `tu.*` de la malla de la cuenta,
 * de los vínculos entre cuentas, de los enlaces locales y de la bandeja de red (relé y LoRa), y los
 * archivos que llegan por enlaces locales y vínculos (los de la malla de la cuenta ya los atiende
 * `iniciarMotorArchivosPorMalla`). Una vez por sesión; devuelve la parada.
 */
/**
 * (BLE1108B) La etiqueta de por dónde llegó algo por un enlace local (WebRTC), con la ruta MEDIDA del canal. Sin medir o
 * en la misma red, la de siempre; por internet o por TURN, lo dice (antes: «red local» fijo según quién abrió el enlace).
 */
export function etiquetaViaLocal(nativa: boolean, ruta: string | null | undefined): string {
  const base = nativa ? "Red local (app nativa) · enlace directo WebRTC" : "Enlace local sin internet (WebRTC)";
  if (ruta === "internet-directo") return `${nativa ? "Enlace directo (app nativa)" : "Enlace emparejado"} · WebRTC · internet directo (NAT atravesado)`;
  if (ruta === "reenviado-turn") return `${nativa ? "Enlace directo (app nativa)" : "Enlace emparejado"} · WebRTC · relé TURN`;
  return base;
}

export function iniciarTransporteUniversal(): () => void {
  arrancado += 1;
  // (BLE1108B) El receptor de la malla de la cuenta mide la ruta con el mismo clasificador que el remitente.
  void import("@/lib/network/archivos-malla").then((am) =>
    am.fijarFuenteRutaPeer((deviceId) => {
      try {
        return snapshotMallaNeuronas().misDispositivos.find((f) => f.syncDeviceId === deviceId)?.enlace.ruta?.clase ?? null;
      } catch {
        return null;
      }
    }),
  ).catch(() => undefined);
  let activo = true;
  const bajas: Array<() => void> = [];
  let reintento: ReturnType<typeof setTimeout> | null = null;

  // 1) Malla de la cuenta (el mismo mesh compartido de siempre).
  const conectarMesh = () => {
    if (!activo) return;
    const mesh = getSharedMesh();
    if (!mesh) {
      reintento = setTimeout(conectarMesh, 3000);
      return;
    }
    bajas.push(
      mesh.onPeer({
        onMessage: (peerId, data) => {
          if (!esTextoTransporte(data)) return;
          const fila = snapshotMallaNeuronas().misDispositivos.find((f) => f.syncDeviceId === peerId);
          despacharTextoTransporte(data as string, { tipo: "cuenta", enlaceId: `cuenta:${peerId}`, etiqueta: fila?.nombre ?? "Aparato de tu cuenta", syncDeviceId: peerId }, (t) =>
            mesh.sendToPeer(peerId, t),
          );
        },
      }),
    );
  };
  conectarMesh();

  // 2) Enlaces locales (también se engancha sola desde la interfaz de emparejado).
  asegurarRecepcionLocal();
  const motorPerezoso = () => motorArchivosCompartido();

  // 3) Vínculos entre cuentas: mensajes y, si el vínculo lo permite, archivos.
  void cargarVinculos().then((m) => {
    if (!m || !activo) return;
    const canales = new Map<string, CanalArchivos>();
    bajas.push(
      m.onMensajeDePar((vinculoId, data) => {
        const v = m.vinculosActivos().find((x) => x.vinculoId === vinculoId);
        if (esTextoTransporte(data)) {
          despacharTextoTransporte(data as string, { tipo: "par", enlaceId: `par:${vinculoId}`, etiqueta: "Vínculo entre cuentas", syncDeviceId: v?.deviceId }, (t) => {
            m.enviarAPar(vinculoId, t);
          });
          return;
        }
        if (typeof data === "string" && data.startsWith('{"t":"archivo.')) {
          let canal = canales.get(vinculoId);
          if (!canal) {
            canal = { enviar: (t) => m.enviarAPar(vinculoId, t), alMensaje: () => () => undefined };
            canales.set(vinculoId, canal);
          }
          motorPerezoso().manejarMensaje(canal, data, {
            mismaCuenta: false,
            etiquetaOrigen: "Vínculo entre cuentas",
            verificarPermiso: () => !!m.vinculosActivos().find((x) => x.vinculoId === vinculoId)?.permisos?.archivos,
            via: "Vínculo entre cuentas (P2P)",
            verificacion: { tipo: "vinculo", texto: "Vínculo entre cuentas aceptado por las dos personas" },
          });
        }
      }),
    );
  });

  // 4) Relé y LoRa: llegan a la bandeja de red; aquí se recogen los de esta capa.
  if (typeof window !== "undefined") {
    const alEntrar = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { type?: string; body?: unknown; antena?: string } | undefined;
      if (!d || d.type !== "message") return;
      const corta = leerFormaCorta(d.body);
      if (!corta) return;
      if (corta.to && uidCache && corta.to !== uidCache) return; // no es para esta cuenta
      const tipo: TipoEnlace = d.antena === "wifi" ? "rele" : "lora";
      entregar({ id: corta.id, canal: corta.canal, cuerpo: corta.cuerpo, origen: { tipo, enlaceId: tipo, etiqueta: tipo === "rele" ? "Relé del servidor" : "Radio LoRa" }, at: Date.now() });
    };
    window.addEventListener("starseed:mesh-inbound", alEntrar);
    bajas.push(() => window.removeEventListener("starseed:mesh-inbound", alEntrar));
    void miUid();
  }

  return () => {
    activo = false;
    arrancado = Math.max(0, arrancado - 1);
    if (reintento) clearTimeout(reintento);
    for (const b of bajas.splice(0)) {
      try {
        b();
      } catch {
        /* noop */
      }
    }
  };
}

/** ¿Está escuchando la recepción global? (para que la interfaz lo diga). */
export function transporteEscuchando(): boolean {
  return arrancado > 0;
}
