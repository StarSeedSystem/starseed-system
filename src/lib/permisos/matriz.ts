/*
 * matriz — el permiso × medio de StarSeed OS, en una sola tabla pura (PRM1119).
 * Contrato y explicación de cada celda: docs/contratos/permisos-por-medio.md.
 * Regla: al instalar y al abrir se pide lo que falte y sea útil; si la persona lo denegó a mano
 * no se vuelve a pedir solo (queda en la lista con «Abrir ajustes»). Nada se concede por la persona.
 */

export type Medio = "macos" | "windows" | "linux" | "android" | "ios" | "navegador" | "terminal";
export type Permiso = "microfono" | "camara" | "pantalla" | "accesibilidad" | "ubicacion" | "bluetooth" | "red-local" | "notificaciones" | "segundo-plano" | "archivos" | "entrada-virtual" | "energia";
/** aviso del sistema, panel de ajustes, al usarlo, declarado en el manifiesto o nada que pedir. */
export type ComoSePide = "aviso" | "aviso-y-panel" | "panel" | "por-uso" | "declaracion" | "nada";
/** ¿Se puede leer su estado? «parcial»: solo de forma indirecta. */
export type Deteccion = "si" | "parcial" | "no";
/** Qué pantalla se puede abrir para que la persona decida (nunca concede sola). */
export type NivelEnlace = "directo" | "lista" | "ficha" | "aviso" | "sin-enlace" | "no-hace-falta";
/** Lo que se sabe de la persona en este medio. */
export type EstadoPermiso = "concedido" | "falta" | "denegado-mano" | "no-disponible";
export type Decision = "listo" | "pedir" | "abrir-ajustes" | "por-uso" | "no-hace-falta" | "no-disponible";

export const MEDIOS: readonly Medio[] = ["macos", "windows", "linux", "android", "ios", "navegador", "terminal"];
export const PERMISOS: readonly Permiso[] = ["microfono", "camara", "pantalla", "accesibilidad", "ubicacion", "bluetooth", "red-local", "notificaciones", "segundo-plano", "archivos", "entrada-virtual", "energia"];

export interface Celda {
  como: ComoSePide;
  deteccion: Deteccion;
  enlace: NivelEnlace;
  /** ¿El medio deja distinguir «falta» de «denegado a mano»? El porqué, en el contrato. */
  distingue: boolean;
}

/** Cada celda se escribe `permiso,como,deteccion,enlace`; un `,0` final marca que no distingue. */
function filas(texto: string): Partial<Record<Permiso, Celda>> {
  const out: Partial<Record<Permiso, Celda>> = {};
  for (const trozo of texto.split(";")) {
    const [permiso, como, deteccion, enlace, marca] = trozo.trim().split(",");
    out[permiso as Permiso] = { como: como as ComoSePide, deteccion: deteccion as Deteccion, enlace: enlace as NivelEnlace, distingue: marca !== "0" };
  }
  return out;
}

const MACOS = filas("microfono,aviso,si,directo; camara,aviso,si,directo; pantalla,aviso-y-panel,si,directo; accesibilidad,aviso-y-panel,si,directo; entrada-virtual,aviso-y-panel,si,directo; ubicacion,por-uso,si,directo; bluetooth,aviso,si,directo; red-local,aviso,parcial,directo,0; notificaciones,aviso,parcial,lista; segundo-plano,panel,si,lista; archivos,por-uso,no,directo; energia,nada,si,no-hace-falta");
const WINDOWS = filas("microfono,por-uso,no,directo; camara,por-uso,no,directo; pantalla,nada,si,no-hace-falta; accesibilidad,nada,si,no-hace-falta; entrada-virtual,nada,si,no-hace-falta; ubicacion,por-uso,no,directo; bluetooth,nada,si,directo; red-local,por-uso,no,sin-enlace; notificaciones,nada,no,directo; segundo-plano,aviso,si,directo; archivos,por-uso,no,sin-enlace; energia,nada,si,no-hace-falta");
const LINUX = filas("microfono,por-uso,no,sin-enlace; camara,por-uso,no,sin-enlace; pantalla,por-uso,no,aviso; accesibilidad,por-uso,no,aviso; entrada-virtual,por-uso,no,aviso; ubicacion,nada,no,no-hace-falta; bluetooth,nada,si,no-hace-falta; red-local,nada,si,no-hace-falta; notificaciones,nada,no,no-hace-falta; segundo-plano,declaracion,si,sin-enlace; archivos,por-uso,no,sin-enlace; energia,nada,si,no-hace-falta");
const ANDROID = filas("microfono,aviso,si,ficha; camara,aviso,si,ficha; pantalla,por-uso,no,aviso; accesibilidad,panel,si,lista; entrada-virtual,panel,si,lista; ubicacion,por-uso,si,ficha; bluetooth,aviso,si,ficha; red-local,aviso,si,ficha; notificaciones,aviso,si,directo; segundo-plano,panel,si,directo; archivos,panel,si,directo; energia,panel,si,directo");
const IOS = filas("microfono,aviso,si,ficha; camara,aviso,si,ficha; pantalla,por-uso,no,aviso; accesibilidad,panel,si,ficha; ubicacion,por-uso,si,ficha; bluetooth,aviso,si,ficha; red-local,aviso,si,ficha; notificaciones,aviso,si,ficha; segundo-plano,declaracion,no,no-hace-falta; archivos,por-uso,no,aviso; energia,nada,si,no-hace-falta");
const NAVEGADOR = filas("microfono,aviso,si,aviso; camara,aviso,si,aviso; pantalla,por-uso,no,aviso; ubicacion,aviso,si,aviso; bluetooth,aviso,si,aviso; red-local,nada,no,no-hace-falta; notificaciones,aviso,si,directo; segundo-plano,declaracion,no,no-hace-falta; archivos,por-uso,no,aviso; energia,nada,no,no-hace-falta");
const TERMINAL = filas("microfono,por-uso,no,sin-enlace; camara,por-uso,no,sin-enlace; pantalla,por-uso,no,sin-enlace; accesibilidad,por-uso,no,sin-enlace; bluetooth,por-uso,no,sin-enlace; red-local,nada,si,no-hace-falta; notificaciones,declaracion,no,no-hace-falta; segundo-plano,declaracion,no,no-hace-falta; archivos,por-uso,no,sin-enlace; energia,nada,si,no-hace-falta");
const TABLA: Record<Medio, Partial<Record<Permiso, Celda>>> = { macos: MACOS, windows: WINDOWS, linux: LINUX, android: ANDROID, ios: IOS, navegador: NAVEGADOR, terminal: TERMINAL };

export function celdaDe(medio: Medio, permiso: Permiso): Celda | null { return TABLA[medio][permiso] ?? null; }
export function soporta(medio: Medio, permiso: Permiso): boolean { return celdaDe(medio, permiso) !== null; }
export function mediosDe(permiso: Permiso): Medio[] { return MEDIOS.filter((m) => soporta(m, permiso)); }

/** La regla: concedido se queda; denegado a mano solo se ofrece en ajustes; lo demás, según su forma de pedir. */
export function queHacer(medio: Medio, permiso: Permiso, estado: EstadoPermiso = "falta", yaPedido = false): Decision {
  const c = celdaDe(medio, permiso);
  if (!c || estado === "no-disponible") return "no-disponible";
  if (estado === "concedido") return "listo";
  if (estado === "denegado-mano") return c.enlace === "no-hace-falta" ? "no-hace-falta" : "abrir-ajustes";
  switch (c.como) {
    case "nada":
    case "declaracion":
      return "no-hace-falta";
    case "por-uso":
      return "por-uso";
    case "panel":
      return "abrir-ajustes";
    case "aviso-y-panel":
      return yaPedido ? "abrir-ajustes" : "pedir";
    case "aviso":
      return "pedir";
  }
}

export interface PlanMedio {
  medio: Medio;
  pedir: Permiso[];
  abrirAjustes: Permiso[];
  porUso: Permiso[];
  listo: Permiso[];
  noAplica: Permiso[];
}

/** Todo lo que la lista enseña en un medio, ya repartido por lo que toca hacer. Puro. */
export function planDe(medio: Medio, estados: Partial<Record<Permiso, EstadoPermiso>> = {}, yaPedidos: readonly Permiso[] = []): PlanMedio {
  const plan: PlanMedio = { medio, pedir: [], abrirAjustes: [], porUso: [], listo: [], noAplica: [] };
  for (const p of PERMISOS) {
    const d = queHacer(medio, p, estados[p] ?? "falta", yaPedidos.includes(p));
    if (d === "pedir") plan.pedir.push(p);
    else if (d === "abrir-ajustes") plan.abrirAjustes.push(p);
    else if (d === "por-uso") plan.porUso.push(p);
    else if (d === "listo") plan.listo.push(p);
    else plan.noAplica.push(p);
  }
  return plan;
}

/** Al instalar: la primera pasada, sin nada visto. */
export function alInstalar(medio: Medio, estados: Partial<Record<Permiso, EstadoPermiso>> = {}): PlanMedio { return planDe(medio, estados, []); }

/** Al abrir: se reintenta lo que sigue faltando; lo ya avisado no se relanza y se ofrece en ajustes. */
export function alAbrir(medio: Medio, estados: Partial<Record<Permiso, EstadoPermiso>> = {}, yaPedidos: readonly Permiso[] = []): PlanMedio { return planDe(medio, estados, yaPedidos); }

export function textoDecision(d: Decision): string {
  switch (d) {
    case "pedir":
      return "Pedir ahora";
    case "abrir-ajustes":
      return "Abrir ajustes";
    case "por-uso":
      return "Se pide al usarlo";
    case "no-hace-falta":
      return "Este medio no lo pide";
    case "no-disponible":
      return "No disponible en este medio";
    case "listo":
      return "Concedido";
  }
}
