/*
 * nas — cada neurona sirve sus carpetas y su cerebro a las DEMÁS neuronas de su cuenta (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §5.
 *
 * Viaja por el transporte universal (src/lib/malla/transporte-universal.ts), canal «nas».
 * Permisos en dos capas: aquí (`autorizarPeticionNas`, pura) y en Rust (`nas_listar`/`nas_leer`
 * canonicalizan la ruta contra el registro real). Quién pide lo dice el ENLACE (uid verificado
 * por la malla de la cuenta), nunca el mensaje. Nunca se escribe en remoto (queda para una ola
 * con confirmación en el aparato que sirve). Puro: el puente y el cerebro se inyectan.
 */

import type { TipoEnlace } from "@/lib/malla/eleccion-enlace";
import type { CarpetaConcedida, EntradaNas, Resultado } from "./tipos";

export const CANAL_NAS = "nas";
export const NAS_TROZO_MAX = 256 * 1024;
const RUTA_MAX = 4096;
const TEXTO_CEREBRO_MAX = 8000;

export type PeticionNas =
  | { t: "nas.estado"; id: string }
  | { t: "nas.listar"; id: string; ruta: string }
  | { t: "nas.leer"; id: string; ruta: string; desde: number; largo: number }
  | { t: "cerebro.preguntar"; id: string; texto: string };

export type RespuestaNas = { t: "nas.ok"; id: string; datos: unknown } | { t: "nas.error"; id: string; motivo: string };

export interface OrigenNas {
  tipo: TipoEnlace;
  /** Cuenta del otro extremo según el ENLACE (no según el mensaje). */
  uid?: string;
}

export interface ContextoServidorNas {
  miUid: string;
  carpetas: CarpetaConcedida[];
  sirveCerebro: boolean;
}

export type Autorizacion = { ok: true; carpeta?: CarpetaConcedida } | { ok: false; motivo: string };

const entero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
const texto = (x: unknown, max: number): x is string => typeof x === "string" && x.length > 0 && x.length <= max;

/** Valida la forma de una petición que llega por la malla (null si no es una petición NAS). */
export function leerPeticionNas(x: unknown): PeticionNas | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!texto(o.id, 80)) return null;
  const id = o.id;
  switch (o.t) {
    case "nas.estado":
      return { t: "nas.estado", id };
    case "nas.listar":
      return texto(o.ruta, RUTA_MAX) ? { t: "nas.listar", id, ruta: o.ruta } : null;
    case "nas.leer":
      return texto(o.ruta, RUTA_MAX) && entero(o.desde) && entero(o.largo) && o.largo > 0
        ? { t: "nas.leer", id, ruta: o.ruta, desde: o.desde, largo: o.largo }
        : null;
    case "cerebro.preguntar":
      return texto(o.texto, TEXTO_CEREBRO_MAX) ? { t: "cerebro.preguntar", id, texto: o.texto } : null;
    default:
      return null;
  }
}

/** Ruta absoluta normalizada con «/» (Windows: «C:/x»). null si es relativa, sube con «..» o trae NUL. */
export function normalizarRuta(ruta: string): string | null {
  if (!ruta || ruta.includes("\0")) return null;
  const r = ruta.replace(/\\/g, "/");
  const abs = r.startsWith("/") || /^[A-Za-z]:\//.test(r);
  if (!abs) return null;
  const partes = r.split("/");
  if (partes.some((p) => p === "..")) return null;
  const limpia = partes.filter((p, i) => i === 0 || (p !== "" && p !== ".")).join("/");
  return limpia.length > 1 && limpia.endsWith("/") ? limpia.slice(0, -1) : limpia || "/";
}

/** ¿`ruta` está dentro de `raiz`? Por componentes: /datos/fotos NO contiene /datos/fotos2. */
export function dentroDe(raiz: string, ruta: string): boolean {
  const a = normalizarRuta(raiz);
  const b = normalizarRuta(ruta);
  if (!a || !b) return false;
  if (a === "/") return true;
  return b === a || b.startsWith(a + "/");
}

/** Qué medios valen para cada petición (LoRa lleva ≤ 200 B: solo el estado). */
const ENLACES: Record<PeticionNas["t"], TipoEnlace[]> = {
  "nas.estado": ["local", "cuenta", "rele", "lora"],
  "nas.listar": ["local", "cuenta", "rele"],
  "nas.leer": ["local", "cuenta"],
  "cerebro.preguntar": ["local", "cuenta", "rele"],
};

export function autorizarPeticionNas(p: PeticionNas, origen: OrigenNas, ctx: ContextoServidorNas): Autorizacion {
  if (!origen.uid || origen.uid !== ctx.miUid) {
    return { ok: false, motivo: "Solo tus propias neuronas pueden usar tu NAS y tu cerebro." };
  }
  if (!ENLACES[p.t].includes(origen.tipo)) {
    return { ok: false, motivo: `Por ${origen.tipo} no se atiende «${p.t}».` };
  }
  if (p.t === "nas.estado") return { ok: true };
  if (p.t === "cerebro.preguntar") {
    return ctx.sirveCerebro ? { ok: true } : { ok: false, motivo: "Esta neurona no comparte su cerebro." };
  }
  if (p.t === "nas.leer" && p.largo > NAS_TROZO_MAX) {
    return { ok: false, motivo: `Trozo demasiado grande (máx. ${NAS_TROZO_MAX} bytes).` };
  }
  if (!normalizarRuta(p.ruta)) return { ok: false, motivo: "Ruta no válida (absoluta y sin «..»)." };
  const carpeta = ctx.carpetas
    .filter((c) => c.nas && dentroDe(c.ruta, p.ruta))
    .sort((x, y) => y.ruta.length - x.ruta.length)[0];
  return carpeta ? { ok: true, carpeta } : { ok: false, motivo: "Esa ruta no está en ninguna carpeta compartida." };
}

/** Bytes → base64 sin Node (trozos para no reventar la pila con archivos de 256 KiB). */
export function aBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(t: string): Uint8Array {
  const s = atob(t);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Trozos para leer un archivo entero: [{desde, largo}, …]. */
export function planTrozos(bytes: number, trozo = NAS_TROZO_MAX): Array<{ desde: number; largo: number }> {
  const t = Math.max(1, Math.min(trozo, NAS_TROZO_MAX));
  const v: Array<{ desde: number; largo: number }> = [];
  for (let d = 0; d < bytes; d += t) v.push({ desde: d, largo: Math.min(t, bytes - d) });
  return v;
}

export interface DepsServidorNas {
  nasListar(ruta: string): Promise<Resultado<EntradaNas[]>>;
  nasLeer(ruta: string, desde: number, largo: number): Promise<Resultado<Uint8Array>>;
  preguntarCerebro?(texto: string): Promise<Resultado<string>>;
}

/** Atiende una petición ya leída: autoriza aquí y deja que Rust vuelva a comprobar. Nunca lanza. */
export async function atenderPeticionNas(
  p: PeticionNas,
  origen: OrigenNas,
  ctx: ContextoServidorNas,
  deps: DepsServidorNas,
): Promise<RespuestaNas> {
  const no = (motivo: string): RespuestaNas => ({ t: "nas.error", id: p.id, motivo });
  const aut = autorizarPeticionNas(p, origen, ctx);
  if (!aut.ok) return no(aut.motivo);
  try {
    switch (p.t) {
      case "nas.estado":
        return {
          t: "nas.ok",
          id: p.id,
          datos: {
            carpetas: ctx.carpetas.filter((c) => c.nas).map((c) => ({ ruta: c.ruta, modo: c.modo })),
            cerebro: ctx.sirveCerebro,
          },
        };
      case "nas.listar": {
        const r = await deps.nasListar(p.ruta);
        return r.ok ? { t: "nas.ok", id: p.id, datos: r.valor } : no(r.motivo);
      }
      case "nas.leer": {
        const r = await deps.nasLeer(p.ruta, p.desde, p.largo);
        return r.ok ? { t: "nas.ok", id: p.id, datos: { desde: p.desde, b64: aBase64(r.valor) } } : no(r.motivo);
      }
      case "cerebro.preguntar": {
        if (!deps.preguntarCerebro) return no("El cerebro local no está disponible ahora.");
        const r = await deps.preguntarCerebro(p.texto);
        return r.ok ? { t: "nas.ok", id: p.id, datos: { respuesta: r.valor } } : no(r.motivo);
      }
    }
  } catch (e) {
    return no(e instanceof Error ? e.message : "Fallo al atender la petición.");
  }
}
