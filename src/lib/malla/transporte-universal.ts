"use client";

/**
 * transporte-universal — UNA puerta para mensajes, archivos y flujos por el enlace más directo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/transporte-universal-sin-internet.md` (§B.2.1 de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`).
 *
 * Enlaces REALES que conoce (nada simulado):
 *   · local  → canal de datos emparejado SIN internet (`emparejar-sin-internet.ts`, por código/QR);
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

import { getSharedMesh } from "@/lib/network/lan-sync";
import { snapshotMallaNeuronas } from "@/lib/network/malla-neuronas";
import { identidadDispositivo } from "@/lib/network/identidad-dispositivo";
import {
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
    const eleccion = elegirEnlaces(lista, destino, "mensaje", tamano(cuerpo));
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

/** Todos los enlaces reales que hay ahora mismo, con lo medido de cada uno. Nunca lanza. */
export async function enlacesDisponibles(): Promise<EnlaceDisponible[]> {
  const out: EnlaceDisponible[] = [];
  for (const e of enlacesLocalesVivos()) out.push(enlaceLocalDisponible(e));

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

function canalDeEnlace(e: EnlaceDisponible): CanalArchivos | null {
  if (e.tipo === "local") {
    const vivo = enlaceLocal(e.id);
    return vivo ? canalLocalEstable(vivo) : null;
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
  const eleccion = elegirEnlaces(await enlacesDisponibles(), destino, "archivo", bytes);
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

/* ══════════════════════════ Flujos (audio/vídeo) ══════════════════════════ */

/** Enlace local que llega a `destino`, si lo hay (las llamadas directas van solo por ahí). */
export function enlaceLocalHacia(destino: DestinoTransporte): EnlaceLocalVivo | null {
  for (const e of enlacesLocalesVivos()) {
    const d = enlaceLocalDisponible(e);
    if (elegirEnlaces([d], destino, "flujo").elegidos.length) return e;
  }
  return null;
}

/** Pone un flujo de audio/vídeo hacia `destino` por el enlace local. Dice con honestidad si no se puede. */
export async function abrirFlujo(destino: DestinoTransporte, stream: MediaStream): Promise<{ ok: boolean; enlaceId?: string; motivo?: string }> {
  const e = enlaceLocalHacia(destino);
  if (!e) {
    return {
      ok: false,
      motivo: "Sin un enlace local con ese aparato no hay llamada directa: vinculad los dos con «Vincular sin internet». Con internet, la llamada va por el sistema de llamadas del chat.",
    };
  }
  const ok = await e.ponerPistas(stream);
  return ok ? { ok, enlaceId: e.id } : { ok, enlaceId: e.id, motivo: "El navegador no dejó añadir el audio o el vídeo." };
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
    const canal = canalLocalEstable(e);
    e.alMensaje((data) => {
      if (esTextoTransporte(data)) {
        despacharTextoTransporte(data as string, { tipo: "local", enlaceId: e.id, etiqueta: e.par.nombre, syncDeviceId: e.par.syncDeviceId }, (t) => {
          e.enviar(t);
        });
        return;
      }
      if (typeof data !== "string" || data.startsWith('{"t":"archivo.')) {
        motorArchivosCompartido().manejarMensaje(canal, data, {
          mismaCuenta: false,
          etiquetaOrigen: `${e.par.nombre || "Aparato vinculado"} (sin internet)`,
          verificarPermiso: () => true,
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
export function iniciarTransporteUniversal(): () => void {
  arrancado += 1;
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
