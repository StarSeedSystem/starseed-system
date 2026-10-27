/**
 * transporte-protomolecula — canal de aplicación «protomolecula» de la sesión P2P (esbozo F3B).
 * Contrato: `architecture/protomolecula.md` §6. Módulo PURO y canal INYECTADO (`enviar`/`recibir`):
 * la malla real lo acopla al canal de `malla/transporte-universal.ts`. Confirmaciones como
 * `ElementoSala` de `elementoDeOperacion` (P1, convergen por LWW); gestos y presencia (P0) solo se
 * avisan y NUNCA se guardan. El `t` sale del reloj común, sin precisión inventada. Latencia
 * ping/pong con p50/p95 solo con suficientes muestras; sin enlace, «solo en este aparato».
 */
import type { Cambio, EstadoValores, Molecula, Operacion, Sesion, ValorParametro } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { RelojComun } from "@/lib/estaciones/reloj-comun";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
export const CANAL_PROTO = "protomolecula";
export const MUESTRAS_MIN_LATENCIA = 5;
type Cuerpo =
  | { k: "confirmacion"; elementos: ElementoSala[] }
  | { k: "gesto"; clave: string; valor: number; t: number; de: string }
  | { k: "presencia"; de: string; mueve: string | null; t: number }
  | { k: "ping"; id: string; t0: number }
  | { k: "pong"; id: string; t0: number };
export interface DepsEnlaceSesion {
  sesion: Sesion;
  enviar: (cuerpo: Cuerpo) => string | void;
  recibir: (cb: (cuerpo: Cuerpo) => void) => () => void;
  reloj: RelojComun;
  /** Molécula de base para `moleculaDesdeElementos`; por defecto, una mínima de la sesión. */
  baseMolecula?: () => Molecula;
}
/** p50/p95 de latencias ida y vuelta (ms); null sin suficientes muestras. */
export function medirLatencia(rtts: number[], min = MUESTRAS_MIN_LATENCIA): { p50Ms: number | null; p95Ms: number | null } {
  if (rtts.length < min) return { p50Ms: null, p95Ms: null };
  const s = [...rtts].sort((a, b) => a - b);
  const p = (q: number): number => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  return { p50Ms: p(0.5), p95Ms: p(0.95) };
}
const esValor = (v: unknown): v is ValorParametro => typeof v === "number" || typeof v === "boolean" || typeof v === "string";
const alta = <X,>(set: Set<X>, cb: X): (() => void) => { set.add(cb); return () => set.delete(cb); };
export function crearEnlaceSesion(d: DepsEnlaceSesion) {
  const id = d.reloj.id;
  const estado: EstadoValores = {};
  const sellos = new Map<string, { t: number; por: string }>();
  const rtts: number[] = [];
  const pendientes = new Map<string, number>();
  const estados = new Set<(m: Molecula) => void>();
  const gestos = new Set<(g: { clave: string; valor: number; t: number; de: string }) => void>();
  const presencias = new Set<(p: { de: string; mueve: string | null; t: number }) => void>();
  let enlaceUsado = "";
  let contador = 0;
  const mandar = (cuerpo: Cuerpo): void => {
    try {
      const uso = d.enviar(cuerpo);
      if (typeof uso === "string" && uso) enlaceUsado = uso;
    } catch {
      /* si el canal falla no tumba la sesión: es sincronía, no el trabajo local */
    }
  };
  /** Confirmaciones: gana la escrita más nueva (LWW de `sincronia-sala`: tiempo → dispositivo). */
  const recibirElementos = (elementos: ElementoSala[]): void => {
    let cambiado = false;
    for (const e of elementos ?? []) {
      const valor = (e.datos as { valor?: unknown }).valor;
      const sello = sellos.get(e.id);
      const gana = !sello || e.actualizadoEn > sello.t || (e.actualizadoEn === sello.t && e.porDispositivo > sello.por);
      if (e.tipo !== "parametro" || e.borrado || !esValor(valor) || !gana) continue;
      sellos.set(e.id, { t: e.actualizadoEn, por: e.porDispositivo });
      estado[e.id] = valor;
      cambiado = true;
    }
    if (!cambiado && !elementos?.length) return;
    const base = d.baseMolecula?.() ?? {
      id: d.sesion.moleculaId, titulo: "", ambito: d.sesion.ambito, capas: [], atomos: [], valores: {},
      version: 0, creadaEn: d.reloj.ahora(), actualizadaEn: d.reloj.ahora(),
    };
    const mol: Molecula = { ...moleculaDesdeElementos(base, elementos), valores: { ...estado } };
    for (const cb of Array.from(estados)) { try { cb(mol); } catch { /* un oyente roto no para la sesión */ } }
  };
  d.recibir((cuerpo) => {
    const c = cuerpo as Cuerpo | null;
    if (!c || typeof c !== "object") return;
    if (c.k === "confirmacion") recibirElementos(c.elementos);
    else if (c.k === "gesto") for (const cb of Array.from(gestos)) cb(c);
    else if (c.k === "presencia") for (const cb of Array.from(presencias)) cb(c);
    else if (c.k === "ping" && !c.id.startsWith(`pi${id}`)) mandar({ k: "pong", id: c.id, t0: c.t0 });
    else if (c.k === "pong" && pendientes.has(c.id)) {
      rtts.push(d.reloj.ahora() - (pendientes.get(c.id) as number));
      pendientes.delete(c.id);
      if (rtts.length > 24) rtts.shift();
    }
  });
  return {
    info: () => {
      const e = d.reloj.estado();
      return { sesionId: d.sesion.id, porEnlace: enlaceUsado || "solo en este aparato", sincronia: e.modo === "referencia" ? "anfitrión" : e.modo === "sincronizado" ? "sincronizado" : "sin referencia" };
    },
    latencia: () => {
      const p = medirLatencia(rtts);
      return { ...p, muestras: rtts.length, texto: p.p50Ms === null ? "sin medir" : `p50 ${Math.round(p.p50Ms)} ms · p95 ${Math.round(p.p95Ms ?? p.p50Ms)} ms` };
    },
    valores: () => ({ ...estado }),
    /** Confirma una `Operacion` cuyo `t` ya salió del reloj común: se guarda y converge. */
    enviarConfirmacion(op: Operacion, cambio: Cambio): void {
      const elementos = [elementoDeOperacion(op, cambio)];
      mandar({ k: "confirmacion", elementos });
      recibirElementos(elementos); // se cuenta su propia escrita: el remitente no diverge
    },
    /** Gesto a 60 Hz: viaja y avisa al panel, no se guarda. */
    enviarGesto(clave: string, valor: number): void { mandar({ k: "gesto", clave, valor, t: d.reloj.ahora(), de: id }); },
    /** Presencia P0: qué aparato mueve qué; `null` suelta. */
    enviarPresencia(mueve: string | null): void { mandar({ k: "presencia", de: id, mueve, t: d.reloj.ahora() }); },
    sondear(): void {
      const idPing = `pi${id}${++contador}`; const t0 = d.reloj.ahora();
      pendientes.set(idPing, t0);
      if (pendientes.size > 64) pendientes.delete(pendientes.keys().next().value as string);
      mandar({ k: "ping", id: idPing, t0 });
    },
    alEstado(cb: (m: Molecula) => void): (() => void) { return alta(estados, cb); },
    alGesto(cb: (g: { clave: string; valor: number; t: number; de: string }) => void): (() => void) { return alta(gestos, cb); },
    alPresencia(cb: (p: { de: string; mueve: string | null; t: number }) => void): (() => void) { return alta(presencias, cb); },
  };
}
