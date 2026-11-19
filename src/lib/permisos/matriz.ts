import type { AccionPermiso, DefPermiso, EstadoSistema, IdPermiso } from "../nativa/permisos-registro";
import { FASE_ACTUAL, IDS_PERMISO, accionDe, defDe, registroDe } from "../nativa/permisos-registro";
import { enlaceDe, hayBoton } from "../nativa/permisos-enlaces";

export type { AccionPermiso, EstadoSistema, IdPermiso } from "../nativa/permisos-registro";
export type Medio = "macos" | "windows" | "linux-x11" | "linux-wayland" | "android" | "ios" | "web" | "navegador" | "pwa" | "terminal";
type Nativo = "macos" | "windows" | "linux-x11" | "linux-wayland" | "android";
type Extra = Exclude<Medio, Nativo>;
type FichaExtra = { id: IdPermiso; como: DefPermiso["como"]; lectura: DefPermiso["lectura"]; ajustes: string | null; detectar: string; distinguir: string };

export interface FichaPermiso { id: IdPermiso; titulo: string; porQue: string; como: DefPermiso["como"]; lectura: DefPermiso["lectura"]; ajustes: string | null; comoDetectar: string; comoDistinguir: string; util: boolean }
export interface PlanPermisos { momento: "instalar" | "abrir"; pedir: IdPermiso[]; ajustes: IdPermiso[]; esperar: IdPermiso[]; sinCambios: IdPermiso[] }
export interface OpcionesPermiso { yaPedidos?: readonly IdPermiso[]; utiles?: readonly IdPermiso[] }

const TEXTO: Partial<Record<IdPermiso, [string, string]>> = {
  microfono: ["Micrófono", "Solo cuando tú lo pides: llamadas y grabaciones."],
  camara: ["Cámara", "Solo cuando tú lo pides: videollamadas y grabaciones."],
  pantalla: ["Pantalla", "Compartir lo que ves en una llamada o sala."],
  notificaciones: ["Notificaciones", "Avisarte de mensajes y llamadas."],
  ubicacion: ["Ubicación", "Situar este aparato en el mapa de Señales."],
  bluetooth: ["Bluetooth", "Hablar con tus neuronas cercanas sin internet."],
  "red-local": ["Red local", "Encontrar neuronas en esta red."],
  capacidades: ["Capacidades del aparato", "Leer qué puede hacer este aparato sin pedir nada."],
};
const x = (id: IdPermiso, como: FichaExtra["como"], lectura: FichaExtra["lectura"], ajustes: string | null, detectar: string, distinguir: string): FichaExtra => ({ id, como, lectura, ajustes, detectar, distinguir });
const API = "El medio lo dice con su API de permisos.";
const USO = "El sistema pregunta al usar la función; no hay pantalla previa.";
const SIN = "No se puede leer: solo se ve al usarlo.";
const DIST = "«Sin preguntar» es falta; «denegado» significa que la persona dijo que no.";
const WEB: FichaExtra[] = [
  x("microfono", "aviso", "si", null, API, DIST),
  x("camara", "aviso", "si", null, API, DIST),
  x("pantalla", "por-uso", "si", null, USO, DIST),
  x("notificaciones", "aviso", "si", null, API, DIST),
  x("ubicacion", "por-uso", "si", null, USO, DIST),
  x("bluetooth", "aviso", "si", null, API, DIST),
  x("capacidades", "nada", "si", null, "Se lee sin pedir nada.", DIST),
];
const IOS: FichaExtra[] = [
  ...WEB.filter((f) => f.id !== "ubicacion"),
  x("ubicacion", "por-uso", "si", null, USO, DIST),
];
const PWA: FichaExtra[] = WEB.filter((f) => f.id !== "bluetooth" && f.id !== "capacidades");
const TERMINAL: FichaExtra[] = [
  x("microfono", "nada", "no", null, SIN, "No hay pantalla de permisos: lo que valga es el sistema anfitrión."),
  x("camara", "nada", "no", null, SIN, "No hay pantalla de permisos: lo que valga es el sistema anfitrión."),
  x("red-local", "nada", "si", null, "Se comprueba con una conexión de red.", DIST),
  x("capacidades", "nada", "si", null, "Se lee sin pedir nada.", DIST),
];
const EXTRAS: Record<Extra, FichaExtra[]> = { ios: IOS, web: WEB, navegador: WEB, pwa: PWA, terminal: TERMINAL };
const NATIVOS: readonly Nativo[] = ["macos", "windows", "linux-x11", "linux-wayland", "android"];
const EXTRA_MEDIOS: readonly Extra[] = ["ios", "web", "navegador", "pwa", "terminal"];
const esNativo = (medio: Medio): medio is Nativo => (NATIVOS as readonly string[]).includes(medio);

export function medios(): readonly Medio[] { return [...NATIVOS, ...EXTRA_MEDIOS]; }
export function permisos(): readonly IdPermiso[] { return IDS_PERMISO; }

export function ficha(medio: Medio, id: IdPermiso): FichaPermiso | null {
  const extra = EXTRAS[medio as Extra]?.find((f) => f.id === id);
  if (extra) {
    const [titulo, porQue] = TEXTO[id] ?? [id, id];
    return { id, titulo, porQue, como: extra.como, lectura: extra.lectura, ajustes: extra.ajustes, comoDetectar: extra.detectar, comoDistinguir: extra.distinguir, util: true };
  }
  if (!esNativo(medio)) return null;
  const def = defDe(medio, id);
  if (!def) return null;
  const enlace = enlaceDe(medio, id);
  const comoDetectar = def.lectura === "si" ? "El sistema lo dice con su API." : def.lectura === "parcial" ? "Se deduce de un efecto indirecto." : "No se puede leer: solo se ve al usarlo.";
  const comoDistinguir = def.como === "aviso-y-panel" ? "El sistema no separa negado de nunca preguntado: si el aviso ya salió, solo Ajustes." : def.como === "por-uso" ? "El sistema pregunta al usarse: un «no» no se guarda como denegado." : "«Sin preguntar» es falta; «denegado» significa que la persona dijo que no.";
  return { id, titulo: def.titulo, porQue: def.nota ?? def.porQue, como: def.como, lectura: def.lectura, ajustes: enlace && hayBoton(enlace) ? enlace.pantalla : null, comoDetectar, comoDistinguir, util: def.fase <= FASE_ACTUAL };
}

export function fichasDe(medio: Medio): FichaPermiso[] {
  const ids = esNativo(medio) ? registroDe(medio).map((d) => d.id) : EXTRAS[medio as Extra].map((f) => f.id);
  return ids.flatMap((id) => { const f = ficha(medio, id); return f ? [f] : []; });
}

export function clasificarEstado(raw: string | null | undefined): EstadoSistema {
  switch ((raw ?? "").toLowerCase()) {
    case "granted": case "concedido": return "concedido";
    case "denied": case "denegado": return "denegado";
    case "prompt": case "sin-preguntar": case "falta": return "sin-preguntar";
    case "no-concedido": return "no-concedido";
    case "no-aplica": return "no-aplica";
    default: return "desconocido";
  }
}

export function accionPara(medio: Medio, id: IdPermiso, estado: EstadoSistema, opciones: OpcionesPermiso = {}): AccionPermiso {
  const f = ficha(medio, id);
  if (!f || !f.util || (opciones.utiles && !opciones.utiles.includes(id))) return "nada";
  const def: DefPermiso = { id, grupo: "sistema", titulo: f.titulo, porQue: f.porQue, como: f.como, lectura: f.lectura, fase: 1, desde: 1, funciones: [] };
  const accion = accionDe(def, estado, !!opciones.yaPedidos?.includes(id));
  return accion === "abrir-ajustes" && !f.ajustes ? "nada" : accion;
}

export function planDePermisos(medio: Medio, estados: Partial<Record<IdPermiso, EstadoSistema>>, momento: "instalar" | "abrir", opciones: OpcionesPermiso = {}): PlanPermisos {
  const plan: PlanPermisos = { momento, pedir: [], ajustes: [], esperar: [], sinCambios: [] };
  for (const f of fichasDe(medio)) {
    const accion = accionPara(medio, f.id, estados[f.id] ?? "desconocido", { yaPedidos: opciones.yaPedidos, utiles: opciones.utiles });
    if (accion === "pedir") plan.pedir.push(f.id);
    else if (accion === "abrir-ajustes") plan.ajustes.push(f.id);
    else if (accion === "por-uso" || accion === "mas-adelante") plan.esperar.push(f.id);
    else plan.sinCambios.push(f.id);
  }
  return plan;
}

export function textoAccion(accion: AccionPermiso): string {
  switch (accion) {
    case "pedir": return "Pedir permiso";
    case "abrir-ajustes": return "Abrir ajustes";
    case "por-uso": return "Se pedirá al usarlo";
    case "mas-adelante": return "Llega más adelante";
    case "listo": return "Listo";
    default: return "Sin acción";
  }
}
