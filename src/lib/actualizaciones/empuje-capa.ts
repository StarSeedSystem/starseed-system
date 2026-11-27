/**
 * empuje-capa — un par con otra capa dispara la búsqueda al instante (BAP1127C).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Reglas PURAS (sin red, sin disco, sin reloj propio) para el empuje por la malla
 * y el censo de neurona del contrato `architecture/automejora-pruebas-malla.md` §4.3
 * y §5.2:
 *   · `debeBuscarPorPar`: solo una app de prueba busca cuando un par anuncia otra capa,
 *     con el mismo suelo de 5 min que `servidor_relevo_logica.rs` (`BUSCAR_CAPA_MIN_MS`).
 *   · `lineaCenso`: una línea de registro sin IP ni rutas de usuario.
 *   · `debeAnotarCenso`: con «Diagnóstico de pruebas» encendido, línea inmediata al
 *     cambiar `capaBuild` (sin freno) y latido cada 60 s mientras no cambie.
 * El efecto `alVerCapasDePar` solo pide `servidor_local_buscar`; aplicar la capa
 * sigue dependiendo de la verificación y del momento seguro.
 */

/** Mismo suelo que el relevo nativo: no se martillea el canal mientras el CI arma la capa. */
export const BUSCAR_CAPA_MIN_MS = 5 * 60_000;
/** Latido de censo mientras el diagnóstico está encendido. */
export const CENSO_MIN_MS = 60_000;
/** Ajuste «Diagnóstico de pruebas»; apagado por defecto. */
export const CLAVE_DIAGNOSTICO_PRUEBAS = "starseed.pruebas.diagnostico.v1";

/** Comandos de la app nativa ya existentes. */
const COMANDO_BUSCAR = "servidor_local_buscar";
const COMANDO_REGISTRO_ANEXAR = "ble_registro_anexar";

export interface EstadoCapaPar {
  miCapa?: string | null;
  capaPar?: string | null;
  esAppDePrueba: boolean;
  ultimaBusquedaMs?: number | null;
  ahoraMs: number;
}

/** Los datos medidos que entran en la línea de censo; lo ausente queda en «-». */
export interface DatosCenso {
  rol?: "aparato-de-prueba" | "director";
  medio?: string;
  appVersion?: string;
  capaBuild?: string;
  ramLibreMb?: number;
  discoLibreGb?: number | null;
  capas?: string[];
}

export interface EstadoCenso {
  diagnosticoEncendido: boolean;
  capaAnterior?: string | null;
  capaNueva?: string | null;
  ultimaMs?: number | null;
  ahoraMs: number;
}

/** Un token sin espacios ni controles (conserva letras, cifras, «. _ @ -»). Puro. */
function token(valor: unknown, max = 64): string {
  return String(valor ?? "")
    .replace(/[\s\u0000-\u001f\u007f]+/g, "")
    .replace(/[^\p{L}\p{N}._@-]/gu, "")
    .slice(0, max);
}

const vacio = (s: string | null | undefined): string => String(s ?? "").trim();

/**
 * ¿Toca pedir «buscar ahora» porque el par tiene otra capa? Puro.
 * Sí solo cuando esta app es de prueba, el par anuncia una capa distinta y no vacía,
 * y pasaron ≥5 min desde la última búsqueda (sin memoria previa, sí).
 */
export function debeBuscarPorPar(e: EstadoCapaPar): boolean {
  if (!e.esAppDePrueba) return false;
  const capaPar = vacio(e.capaPar);
  if (!capaPar) return false;
  if (capaPar === vacio(e.miCapa)) return false;
  if (e.ultimaBusquedaMs === null || e.ultimaBusquedaMs === undefined) return true;
  return e.ahoraMs - e.ultimaBusquedaMs >= BUSCAR_CAPA_MIN_MS;
}

/** Entero positivo o «-»; nunca inventa un 0 que signifique «sin medir». Puro. */
function enteroMedido(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? String(Math.round(v)) : "-";
}

/** GB medido (un decimal) o «-»; el 0 medido sí cuenta. Puro. */
function gbMedido(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return "-";
  return String(Math.round(v * 10) / 10);
}

/**
 * Línea de censo con el formato exacto del contrato §5.2, sin IP ni rutas:
 * `censo neurona=<nombre sin espacios> rol=<…> plataforma=<p> app=<v|-> capa=<b|-> mem=<MB|-> disco=<GB|-> ia=<ids|->`.
 */
export function lineaCenso(nombre: string, caps: DatosCenso): string {
  const rol = caps.rol === "aparato-de-prueba" || caps.rol === "director" ? caps.rol : "-";
  const plataforma = token(caps.medio) || "-";
  const app = token(caps.appVersion) || "-";
  const capa = token(caps.capaBuild) || "-";
  const ia = (Array.isArray(caps.capas) ? caps.capas : [])
    .map((c) => token(c))
    .filter((c) => c !== "")
    .join(",");
  return [
    `censo neurona=${token(nombre) || "-"}`,
    `rol=${rol}`,
    `plataforma=${plataforma}`,
    `app=${app}`,
    `capa=${capa}`,
    `mem=${enteroMedido(caps.ramLibreMb)}`,
    `disco=${gbMedido(caps.discoLibreGb)}`,
    `ia=${ia || "-"}`,
  ].join(" ");
}

/**
 * ¿Toca escribir la línea de censo propia? Puro.
 * Con el diagnóstico apagado, nunca. Encendido: inmediata al cambiar `capaBuild`
 * (sin freno de 5 min) y, si no cambió, al pasar ≥60 s desde la última.
 */
export function debeAnotarCenso(e: EstadoCenso): boolean {
  if (!e.diagnosticoEncendido) return false;
  if (vacio(e.capaAnterior) !== vacio(e.capaNueva)) return true;
  if (e.ultimaMs === null || e.ultimaMs === undefined) return true;
  return e.ahoraMs - e.ultimaMs >= CENSO_MIN_MS;
}

/** Lee «Diagnóstico de pruebas» (localStorage inyectable); apagado por defecto. Puro. */
export function leerDiagnosticoPruebas(almacen?: Pick<Storage, "getItem"> | null): boolean {
  try {
    const a = almacen === undefined ? (typeof window !== "undefined" ? window.localStorage : null) : almacen;
    return a?.getItem(CLAVE_DIAGNOSTICO_PRUEBAS) === "1";
  } catch {
    return false;
  }
}

/** Anexa una línea al registro de la app nativa; nunca lanza y no tumba la malla. */
export function registrarLineaCapa(linea: string): void {
  const limpia = vacio(linea).slice(0, 400);
  if (!limpia) return;
  try {
    void import("@/lib/nativa/puente")
      .then((m) => m.puenteNativo().llamar(COMANDO_REGISTRO_ANEXAR, { lineas: [limpia] }))
      .catch(() => undefined);
  } catch {
    /* el registro no tumba al enlace */
  }
}

export interface OpcionesVerCapasDePar {
  /** Nombre del par que anunció otra capa (solo para la línea del registro). */
  par: string;
  miCapa?: string | null;
  capaPar?: string | null;
  esAppDePrueba: boolean;
  ultimaBusquedaMs?: number | null;
  ahoraMs?: number;
  /** Inyectable en pruebas; por defecto, el puente nativo. */
  invocar?: (comando: string) => Promise<unknown>;
  /** Inyectable en pruebas; por defecto, el registro de la app. */
  registrar?: (linea: string) => void;
}

/**
 * Efecto pequeño: si `debeBuscarPorPar` lo dice, pide `servidor_local_buscar` y anota
 * `[capas] empuje desde <par>`. Devuelve si disparó la búsqueda.
 */
export function alVerCapasDePar(o: OpcionesVerCapasDePar): boolean {
  const ahoraMs = o.ahoraMs ?? Date.now();
  if (!debeBuscarPorPar({ miCapa: o.miCapa, capaPar: o.capaPar, esAppDePrueba: o.esAppDePrueba, ultimaBusquedaMs: o.ultimaBusquedaMs, ahoraMs })) {
    return false;
  }
  try {
    const invocar =
      o.invocar ??
      ((comando: string) => import("@/lib/nativa/puente").then((m) => m.puenteNativo().llamar(comando)));
    void Promise.resolve(invocar(COMANDO_BUSCAR)).catch(() => undefined);
    (o.registrar ?? registrarLineaCapa)(`[capas] empuje desde ${token(o.par) || "par"}`);
    return true;
  } catch {
    return false;
  }
}
