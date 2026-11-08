/**
 * puerta-internet — una neurona con internet presta una «puerta» a las demás por la malla (MPT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. PRIMERA REBANADA: un proxy de `GET https://…` para las
 * peticiones de la propia app (manifiestos de actualización, descargas de capas) por una neurona-puerta.
 *
 *  · La puerta es OPT-IN de su dueño (`estado().activa`), con topes de cuota diaria, batería, tamaño por respuesta,
 *    plazo y lista de hosts permitidos (por defecto ninguno). Solo `GET` por `https`; nunca a direcciones locales
 *    ni privadas (anti-SSRF).
 *  · De punta a punta: la petición va cifrada para la puerta (ECDH P-256 → HKDF → AES-GCM, `recipient-crypto`) y la
 *    respuesta, cifrada para quien pidió. Los aparatos intermedios (relés, routers, otras neuronas) solo ven texto
 *    cifrado. La puerta SÍ ve la URL y la respuesta (es quien sale a internet): por eso es opt-in y de confianza.
 *  · Se anuncia en el registro de conectores (`registrarConectorPuerta`) sin sumarse a los caminos de datos.
 *
 * Fuera de esta rebanada (solo tipos y contrato): otros métodos, túneles TCP/UDP, DNS y tráfico general del
 * navegador; router/OpenWrt como puerta. Sin DOM ni red propios: `fetch`, cifrado y transporte se inyectan.
 */

import { encryptEnvelopeFor, myEncryptionPublicKey, type RecipientEnvelope } from "@/ai/astraura/mesh/recipient-crypto";
import { abrirSobrePropio, aB64, deB64, type AbrirSobreFn } from "@/lib/malla/cifrado-archivo";
import { registrarConector } from "@/lib/malla/conectores/registro";
import type { ConectorMedio, FichaCapacidades } from "@/lib/malla/conectores/tipos";

/** Capacidad que anuncia una neurona que presta puerta. */
export const CAPACIDAD_PUERTA_INTERNET = "puerta.http.v1";
export const TIPO_PETICION_PUERTA = "puerta.get";
export const TIPO_RESPUESTA_PUERTA = "puerta.resp";

export interface TopesPuerta {
  /** Bytes máximos de UNA respuesta. Por defecto 8 MiB. */
  maxBytesRespuesta: number;
  /** Bytes máximos servidos por día natural. Por defecto 200 MiB. */
  cuotaBytesDia: number;
  /** Batería mínima (0..1) para servir si no está cargando. Por defecto 0,3. */
  bateriaMin: number;
  /** Plazo de la petición a internet (ms). Por defecto 15 000. */
  plazoMs: number;
}

export const TOPES_PUERTA_POR_DEFECTO: TopesPuerta = {
  maxBytesRespuesta: 8 * 1024 * 1024,
  cuotaBytesDia: 200 * 1024 * 1024,
  bateriaMin: 0.3,
  plazoMs: 15_000,
};

export interface EstadoPuerta {
  /** El dueño la encendió. */
  activa: boolean;
  /** 0..1; null = no se sabe (se da por suficiente). */
  bateria: number | null;
  cargando: boolean;
  /** Hay internet ahora. */
  conInternet: boolean;
}

export type MotivoRechazoPuerta =
  | "apagada"
  | "sin-internet"
  | "bateria"
  | "cuota"
  | "url-no-valida"
  | "host-no-permitido"
  | "tamano"
  | "plazo"
  | "red"
  | "sobre";

export interface PeticionPuerta {
  t: typeof TIPO_PETICION_PUERTA;
  v: 1;
  id: string;
  url: string;
  /** Pública ECDH de quien pide: con ella se cifra la respuesta. */
  respuestaPub: JsonWebKey;
}

export interface RespuestaPuerta {
  t: typeof TIPO_RESPUESTA_PUERTA;
  v: 1;
  id: string;
  ok: boolean;
  estado?: number;
  tipo?: string;
  cuerpoB64?: string;
  motivo?: MotivoRechazoPuerta;
}

export interface DepsPuerta {
  abrir?: AbrirSobreFn;
  /** Cifra para una pública (por defecto, el sobre v:3 de `recipient-crypto`). */
  cifrarPara?: (pub: JsonWebKey, obj: unknown) => Promise<RecipientEnvelope | null>;
  fetchFn?: (url: string, init: { method: "GET"; signal?: AbortSignal; redirect: "error" }) => Promise<Response>;
  estado: () => EstadoPuerta;
  topes?: Partial<TopesPuerta>;
  /** Hosts a los que se sirve (`actualizaciones.starseed.red`, `*.starseed.red`…). Vacío = ninguno. */
  hostsPermitidos: string[];
  ahora?: () => number;
}

/** ¿Es una dirección que NO debe tocarse desde una puerta? (loopback, privada, enlace local, `.local`, IPv6 literal). */
export function hostInterno(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return false;
}

export function hostPermitido(host: string, lista: readonly string[]): boolean {
  const h = host.toLowerCase();
  return lista.some((p) => {
    const q = p.toLowerCase();
    return q.startsWith("*.") ? h.endsWith(q.slice(1)) && h.length > q.length - 1 : h === q;
  });
}

/** Valida y normaliza la URL de una petición. Null si no sirve. */
export function urlDePuerta(url: unknown, hosts: readonly string[]): { url: string } | { motivo: MotivoRechazoPuerta } {
  if (typeof url !== "string" || url.length > 2048) return { motivo: "url-no-valida" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { motivo: "url-no-valida" };
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return { motivo: "url-no-valida" };
  if (hostInterno(u.hostname)) return { motivo: "host-no-permitido" };
  if (!hostPermitido(u.hostname, hosts)) return { motivo: "host-no-permitido" };
  return { url: u.toString() };
}

export interface PuertaInternet {
  /** Atiende una petición cifrada y devuelve la respuesta cifrada (o null si el sobre no era para esta puerta). */
  atender(sobre: RecipientEnvelope): Promise<RecipientEnvelope | null>;
  /** Bytes servidos hoy. */
  servidoHoy(): number;
  /** El anuncio que se publica en el registro de conectores. */
  anuncio(): { capacidad: string; activa: boolean; topes: TopesPuerta; hosts: string[] };
}

const diaDe = (t: number): string => new Date(t).toISOString().slice(0, 10);

export function crearPuertaInternet(deps: DepsPuerta): PuertaInternet {
  const topes: TopesPuerta = { ...TOPES_PUERTA_POR_DEFECTO, ...(deps.topes ?? {}) };
  const ahora = deps.ahora ?? (() => Date.now());
  const abrir = deps.abrir ?? abrirSobrePropio;
  const cifrarPara = deps.cifrarPara ?? encryptEnvelopeFor;
  const fetchFn = deps.fetchFn ?? ((u, i) => fetch(u, i));
  let dia = diaDe(ahora());
  let servido = 0;

  const rotar = (): void => {
    const d = diaDe(ahora());
    if (d !== dia) {
      dia = d;
      servido = 0;
    }
  };

  /** Lee el cuerpo con tope; null si lo supera. */
  async function leerConTope(r: Response, tope: number): Promise<Uint8Array | null> {
    const declarado = Number(r.headers.get("content-length") ?? "");
    if (Number.isFinite(declarado) && declarado > tope) return null;
    if (!r.body) {
      const b = new Uint8Array(await r.arrayBuffer());
      return b.length > tope ? null : b;
    }
    const lector = r.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > tope) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      partes.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of partes) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  async function resolver(p: PeticionPuerta): Promise<RespuestaPuerta> {
    const no = (motivo: MotivoRechazoPuerta): RespuestaPuerta => ({ t: TIPO_RESPUESTA_PUERTA, v: 1, id: p.id, ok: false, motivo });
    const est = deps.estado();
    if (!est.activa) return no("apagada");
    if (!est.conInternet) return no("sin-internet");
    if (!est.cargando && est.bateria !== null && est.bateria < topes.bateriaMin) return no("bateria");
    rotar();
    if (servido >= topes.cuotaBytesDia) return no("cuota");
    const v = urlDePuerta(p.url, deps.hostsPermitidos);
    if (!("url" in v)) return no(v.motivo);
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const temporizador = ctl ? setTimeout(() => ctl.abort(), topes.plazoMs) : null;
    try {
      // `redirect: "error"`: una redirección podría llevar a un host que no está en la lista.
      const r = await fetchFn(v.url, { method: "GET", redirect: "error", ...(ctl ? { signal: ctl.signal } : {}) });
      const restante = Math.max(0, topes.cuotaBytesDia - servido);
      const cuerpo = await leerConTope(r, Math.min(topes.maxBytesRespuesta, restante));
      if (!cuerpo) return no(restante < topes.maxBytesRespuesta ? "cuota" : "tamano");
      servido += cuerpo.length;
      return { t: TIPO_RESPUESTA_PUERTA, v: 1, id: p.id, ok: true, estado: r.status, tipo: r.headers.get("content-type") ?? "", cuerpoB64: aB64(cuerpo) };
    } catch {
      return no(ctl?.signal.aborted ? "plazo" : "red");
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  }

  return {
    async atender(sobre) {
      const p = (await abrir(sobre)) as PeticionPuerta | null;
      if (!p || p.t !== TIPO_PETICION_PUERTA || p.v !== 1 || typeof p.id !== "string" || !p.respuestaPub) return null;
      const resp = await resolver(p);
      return cifrarPara(p.respuestaPub, resp);
    },
    servidoHoy: () => (rotar(), servido),
    anuncio: () => ({ capacidad: CAPACIDAD_PUERTA_INTERNET, activa: deps.estado().activa, topes, hosts: [...deps.hostsPermitidos] }),
  };
}

/* ───────────────────────── Cliente ───────────────────────── */

export interface PuertaConocida {
  /** Id de la neurona-puerta. */
  id: string;
  /** Su pública ECDH de cifrado. */
  pub: JsonWebKey;
}

export interface ResultadoPuerta {
  ok: boolean;
  estado?: number;
  tipo?: string;
  cuerpo?: Uint8Array;
  puerta?: string;
  motivo?: MotivoRechazoPuerta | "sin-puertas" | "sin-respuesta";
}

export interface DepsCliente {
  puertas: PuertaConocida[];
  /** Manda el sobre a la puerta por la malla y devuelve su sobre de respuesta (o null si no hubo). */
  transporte: (puerta: PuertaConocida, sobre: RecipientEnvelope) => Promise<RecipientEnvelope | null>;
  /** Pública de cifrado de ESTA neurona (por defecto, la persistida) y cómo abrir su respuesta. */
  miPub?: () => Promise<JsonWebKey | null>;
  abrir?: AbrirSobreFn;
  cifrarPara?: DepsPuerta["cifrarPara"];
  nuevoId?: () => string;
}

/** Pide `url` por la primera puerta que responda; las demás de reserva. Nunca lanza. */
export async function pedirPorPuerta(url: string, deps: DepsCliente): Promise<ResultadoPuerta> {
  if (!deps.puertas.length) return { ok: false, motivo: "sin-puertas" };
  const miPub = await (deps.miPub ?? myEncryptionPublicKey)();
  if (!miPub) return { ok: false, motivo: "sin-respuesta" };
  const abrir = deps.abrir ?? abrirSobrePropio;
  const cifrarPara = deps.cifrarPara ?? encryptEnvelopeFor;
  let ultimo: ResultadoPuerta = { ok: false, motivo: "sin-respuesta" };
  for (const puerta of deps.puertas) {
    try {
      const id = (deps.nuevoId ?? (() => globalThis.crypto.randomUUID()))();
      const peticion: PeticionPuerta = { t: TIPO_PETICION_PUERTA, v: 1, id, url, respuestaPub: miPub };
      const sobre = await cifrarPara(puerta.pub, peticion);
      if (!sobre) continue;
      const rs = await deps.transporte(puerta, sobre);
      if (!rs) continue;
      const r = (await abrir(rs)) as RespuestaPuerta | null;
      if (!r || r.t !== TIPO_RESPUESTA_PUERTA || r.id !== id) continue; // no es la respuesta a ESTA petición
      if (!r.ok) {
        ultimo = { ok: false, motivo: r.motivo ?? "red", puerta: puerta.id };
        continue;
      }
      return { ok: true, estado: r.estado, tipo: r.tipo, cuerpo: r.cuerpoB64 ? (deB64(r.cuerpoB64) ?? new Uint8Array()) : new Uint8Array(), puerta: puerta.id };
    } catch {
      /* siguiente puerta */
    }
  }
  return ultimo;
}

/* ───────────────────────── Anuncio en el registro de conectores ───────────────────────── */

const FICHA_PUERTA: FichaCapacidades = {
  anchoKbps: null,
  latenciaMs: null,
  mtu: null,
  alcanceM: null,
  energia: "media",
  tiempoAire: "libre",
  coste: "datos",
  privacidad: "servidor",
  llevaFlujos: false,
  cifrado: "cifrado",
  permisos: [],
  medida: false,
};

/**
 * Anuncia la puerta en el registro de conectores (`tipo: "puerta-internet"`). NO aporta enlaces de datos
 * (`descubrir()` devuelve []): el planificador de vías no la usa como camino, solo la consultan quienes necesitan
 * salir a internet (`puertasAnunciadas`). Devuelve la función que la retira.
 */
export function registrarConectorPuerta(puerta: PuertaInternet): () => void {
  const c: ConectorMedio = {
    id: "puerta-internet",
    tipo: "puerta-internet",
    etiqueta: "Puerta de internet de esta neurona",
    async descubrir() {
      return [];
    },
    async enlazar() {
      return false;
    },
    async enviar() {
      return false;
    },
    alRecibir: () => () => undefined,
    cerrar: () => undefined,
    ficha: () => FICHA_PUERTA,
  };
  (c as ConectorMedio & { anuncio: PuertaInternet["anuncio"] }).anuncio = puerta.anuncio;
  return registrarConector(c);
}

/** El anuncio de la puerta registrada en ESTA neurona, si la hay. */
export function anuncioDePuertaLocal(conectores: ConectorMedio[]): ReturnType<PuertaInternet["anuncio"]> | null {
  const c = conectores.find((x) => x.id === "puerta-internet") as (ConectorMedio & { anuncio?: PuertaInternet["anuncio"] }) | undefined;
  return c?.anuncio ? c.anuncio() : null;
}
