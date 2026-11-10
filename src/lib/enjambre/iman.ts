/**
 * iman — el enlace magnético del Enjambre (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   starseed:?xt=urn:ss256:<raíz>&dn=<nombre>&xl=<bytes>&am=<ámbito>&fi=<huella>&es=<url>&ra=<pista>&ps=<KiB>
 *
 *  · `xt` obligatorio y único. El resto es opcional. `es` y `ra` pueden repetirse (hasta 4 cada uno).
 *  · Un imán NO LLEVA NUNCA una clave. Cualquier parámetro que no esté en la lista se rechaza (también `k`, `key`…):
 *    así un imán mal hecho no puede colar un secreto ni un campo que otro código interprete.
 *  · Parseo ESTRICTO: sin espacios sobrantes, sin parámetros vacíos o repetidos, sin `%` malformados, sin
 *    controles ni marcas de dirección en el nombre, `es` solo https público (validación sintáctica anti-SSRF),
 *    longitud total ≤ 2048. Devuelve null ante la menor duda. Nunca lanza.
 *  · `ps` (KiB, potencia de dos) es un añadido respecto al diseño inicial: sin él, el tamaño de pieza es el que
 *    sale de `elegirTamanoPieza(xl)`, que todas las neuronas calculan igual.
 */

import { MAX_TAMANO_CONTENIDO, MAX_TAMANO_PIEZA, MIN_TAMANO_PIEZA } from "./arbol";
import { esAmbito, MAX_ESPEJOS, textoSeguro, type Ambito } from "./semilla";
import { validarUrlEspejo } from "./url-segura";
import { hex64, potenciaDeDos } from "./util";

export const PREFIJO_IMAN = "starseed:?";
export const MAX_LONG_IMAN = 2048;

export interface Iman {
  /** Raíz Merkle (hex, 64). */
  raiz: string;
  nombre?: string;
  tamano?: number;
  ambito?: Ambito;
  /** Huella de quien publica. */
  huella?: string;
  espejos: string[];
  /** Pistas de rastreador: identificadores opacos, nunca direcciones que se abran sin pasar por la puerta. */
  rastreadores: string[];
  /** Tamaño de pieza en bytes, si no es el de por defecto. */
  tamanoPieza?: number;
}

const RE_HUELLA = /^[A-Za-z0-9:_.\-]{4,128}$/;
const RE_PISTA = /^[A-Za-z0-9:_.\-/]{1,128}$/;
const PREFIJO_XT = "urn:ss256:";
const CLAVES = new Set(["xt", "dn", "xl", "am", "fi", "es", "ra", "ps"]);

function decodificar(v: string): string | null {
  try {
    return decodeURIComponent(v);
  } catch {
    return null;
  }
}

export function parsearIman(texto: unknown): Iman | null {
  if (typeof texto !== "string" || texto.length > MAX_LONG_IMAN || !texto.startsWith(PREFIJO_IMAN)) return null;
  const cuerpo = texto.slice(PREFIJO_IMAN.length);
  if (!cuerpo || /[\u0000- \u007f-\u009f]/.test(cuerpo)) return null;
  const partes = cuerpo.split("&");
  if (partes.length > 16) return null;
  const vistos = new Set<string>();
  const out: Iman = { raiz: "", espejos: [], rastreadores: [] };
  let tieneXt = false;
  for (const p of partes) {
    const i = p.indexOf("=");
    if (i <= 0 || i === p.length - 1 || p.indexOf("=", i + 1) !== -1) return null;
    const k = p.slice(0, i);
    if (!CLAVES.has(k)) return null;
    const v = decodificar(p.slice(i + 1));
    if (v === null || v === "") return null;
    const repetible = k === "es" || k === "ra";
    if (!repetible && vistos.has(k)) return null;
    vistos.add(k);
    switch (k) {
      case "xt": {
        if (!v.startsWith(PREFIJO_XT)) return null;
        const r = hex64(v.slice(PREFIJO_XT.length));
        if (!r) return null;
        out.raiz = r;
        tieneXt = true;
        break;
      }
      case "dn": {
        const n = textoSeguro(v, 255);
        if (n === null) return null;
        out.nombre = n;
        break;
      }
      case "xl": {
        if (!/^\d{1,16}$/.test(v)) return null;
        const n = Number(v);
        if (!Number.isSafeInteger(n) || n > MAX_TAMANO_CONTENIDO) return null;
        out.tamano = n;
        break;
      }
      case "am": {
        if (!esAmbito(v)) return null;
        out.ambito = v;
        break;
      }
      case "fi": {
        if (!RE_HUELLA.test(v)) return null;
        out.huella = v;
        break;
      }
      case "es": {
        const u = validarUrlEspejo(v);
        if (!u || out.espejos.length >= MAX_ESPEJOS) return null;
        out.espejos.push(u);
        break;
      }
      case "ra": {
        if (!RE_PISTA.test(v) || out.rastreadores.length >= MAX_ESPEJOS) return null;
        out.rastreadores.push(v);
        break;
      }
      case "ps": {
        if (!/^\d{1,5}$/.test(v)) return null;
        const b = Number(v) * 1024;
        if (!potenciaDeDos(b) || b < MIN_TAMANO_PIEZA || b > MAX_TAMANO_PIEZA) return null;
        out.tamanoPieza = b;
        break;
      }
    }
  }
  return tieneXt ? out : null;
}

/**
 * Escribe el imán. El nombre solo se incluye en ámbitos públicos (en los demás sería una fuga: el imán se pega en
 * chats y se ve). Devuelve null si algo no vale o si se pasa de longitud.
 */
export function formatearIman(i: Iman): string | null {
  const r = hex64(i.raiz);
  if (!r) return null;
  const q: string[] = ["xt=" + PREFIJO_XT + r];
  const publico = i.ambito === "publico";
  if (i.nombre !== undefined && publico) {
    if (textoSeguro(i.nombre, 255) === null || i.nombre === "") return null;
    q.push("dn=" + encodeURIComponent(i.nombre));
  }
  if (i.tamano !== undefined) {
    if (!Number.isSafeInteger(i.tamano) || i.tamano < 0 || i.tamano > MAX_TAMANO_CONTENIDO) return null;
    q.push("xl=" + i.tamano);
  }
  if (i.ambito !== undefined) {
    if (!esAmbito(i.ambito)) return null;
    q.push("am=" + i.ambito);
  }
  if (i.huella !== undefined) {
    if (!RE_HUELLA.test(i.huella)) return null;
    q.push("fi=" + encodeURIComponent(i.huella));
  }
  for (const e of i.espejos.slice(0, MAX_ESPEJOS)) {
    const u = validarUrlEspejo(e);
    if (!u) return null;
    q.push("es=" + encodeURIComponent(u));
  }
  for (const t of i.rastreadores.slice(0, MAX_ESPEJOS)) {
    if (!RE_PISTA.test(t)) return null;
    q.push("ra=" + encodeURIComponent(t));
  }
  if (i.tamanoPieza !== undefined) {
    if (!potenciaDeDos(i.tamanoPieza) || i.tamanoPieza < MIN_TAMANO_PIEZA || i.tamanoPieza > MAX_TAMANO_PIEZA) return null;
    q.push("ps=" + i.tamanoPieza / 1024);
  }
  const s = PREFIJO_IMAN + q.join("&");
  return s.length <= MAX_LONG_IMAN ? s : null;
}
