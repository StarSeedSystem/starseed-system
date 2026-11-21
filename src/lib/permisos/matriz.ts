/**
 * matriz — la matriz permiso × medio de StarSeed OS (PRM1119, parte 2 de 3).
 * Puro: sin red, disco ni procesos. Contrato: docs/contratos/permisos-por-medio.md.
 *
 * Regla: al instalar y al abrir se pide lo que falte y el medio permita pedir; lo que la persona
 * denegó a mano no se vuelve a pedir solo, se muestra en la lista con «Abrir ajustes». Lo que el
 * sistema pregunta por uso espera al gesto. Nunca se concede nada por la persona.
 */

export type Medio = "macos" | "android" | "linux" | "windows" | "ios" | "navegador" | "terminal";
export type Permiso = "microfono" | "camara" | "pantalla" | "accesibilidad" | "ubicacion" | "bluetooth" | "red-local" | "notificaciones" | "segundo-plano" | "archivos" | "entrada-virtual" | "energia";
export type Deteccion = "api" | "indirecta" | "no-legible" | "no-aplica";
export type Solicitud = "al-instalar" | "al-abrir" | "por-uso" | "panel" | "declaracion" | "nada";
export type Estado = "concedido" | "falta" | "denegado-a-mano" | "por-uso" | "no-aplica" | "no-disponible" | "desconocido";
export type Accion = "pedir" | "abrir-ajustes" | "por-uso" | "listo" | "nada";
export type Momento = "instalar" | "abrir" | "uso";

export interface Celda {
  deteccion: Deteccion; // api del sistema, por el uso, o no se puede leer
  solicitud: Solicitud; // cuándo permite el medio pedirlo
  ajustes: boolean; // hay pantalla de Ajustes que abrir
}

/** Lo que devuelve el medio al mirar un permiso (sin prometer lo que no puede saber). */
export interface Lectura {
  soportado: boolean;
  concedido: boolean;
  diceDenegado?: boolean; // el sistema dice literalmente «denegado»
  antesConcedido?: boolean; // constaba concedido y ya no: lo revocó la persona
  ilegible?: boolean; // el sistema no deja leerlo
}

export interface FilaPlan { permiso: Permiso; estado: Estado; accion: Accion }

/** Cómo distingue cada medio «falta» de «denegado a mano». Se enseña junto a la lista. */
export const PISTA_DENEGADO: Record<Medio, string> = {
  macos: "TCC dice «denied» para micrófono, cámara, ubicación y notificaciones; Accesibilidad, red local y disco completo no se leen: solo cuentan como negados si antes constaban concedidos o la persona vio el aviso.",
  android: "checkSelfPermission dice «denied»; sin diálogo posible (rationale en falso y ya pedido) se trata como negado a mano.",
  linux: "No hay registro único: el portal de escritorio pregunta por uso; sin portal no se puede leer y no se finge una negativa.",
  windows: "La app no lee el interruptor de Privacidad; solo hay negativa con constancia previa o aviso visto.",
  ios: "AVFoundation y CoreLocation dicen «denied»; el resto se deduce por uso y no se marca negado por sospecha.",
  navegador: "La Permissions API dice «denied» para micrófono, cámara, ubicación y notificaciones; el resto se deduce por uso.",
  terminal: "No es una app con diálogos: sus permisos son del sistema (TCC, grupos, udev, polkit) y se conceden al binario o al servicio, no a StarSeed.",
};

const NO_APLICA: Celda = { deteccion: "no-aplica", solicitud: "nada", ajustes: false };
const a = (deteccion: Deteccion, solicitud: Solicitud, ajustes = false): Celda => ({ deteccion, solicitud, ajustes });
const api = (solicitud: Solicitud, ajustes = true): Celda => a("api", solicitud, ajustes);

const MATRIZ: Record<Medio, Partial<Record<Permiso, Celda>>> = {
  macos: {
    microfono: api("al-abrir"), camara: api("al-abrir"), pantalla: api("panel"),
    accesibilidad: a("no-legible", "panel", true), ubicacion: api("por-uso"),
    bluetooth: api("al-abrir"), "red-local": a("no-legible", "al-abrir", true),
    notificaciones: api("al-abrir"), "segundo-plano": a("indirecta", "al-abrir", true),
    archivos: a("indirecta", "por-uso", true), "entrada-virtual": a("no-legible", "panel", true),
    energia: a("no-legible", "nada"),
  },
  android: {
    microfono: api("al-abrir"), camara: api("al-abrir"), pantalla: api("por-uso", false),
    accesibilidad: api("panel"), ubicacion: api("por-uso"), bluetooth: api("al-abrir"),
    "red-local": a("indirecta", "por-uso", false), notificaciones: api("al-abrir"),
    "segundo-plano": a("indirecta", "panel", true), archivos: api("panel"),
    energia: a("indirecta", "nada"),
  },
  linux: {
    microfono: a("no-legible", "por-uso"), camara: a("no-legible", "por-uso"),
    pantalla: a("no-legible", "por-uso"), accesibilidad: a("no-legible", "por-uso"),
    ubicacion: a("no-legible", "por-uso"), bluetooth: a("indirecta", "nada"),
    notificaciones: a("no-legible", "nada"), "segundo-plano": a("indirecta", "declaracion"),
    archivos: a("indirecta", "por-uso"), "entrada-virtual": a("no-legible", "por-uso"),
  },
  windows: {
    microfono: a("no-legible", "por-uso", true), camara: a("no-legible", "por-uso", true),
    pantalla: a("no-legible", "nada"), accesibilidad: a("no-legible", "nada"),
    ubicacion: a("no-legible", "por-uso", true), bluetooth: a("indirecta", "nada"),
    "red-local": a("indirecta", "por-uso"), notificaciones: a("indirecta", "nada", true),
    "segundo-plano": a("indirecta", "al-abrir", true), archivos: a("indirecta", "por-uso"),
    "entrada-virtual": a("no-legible", "nada"),
  },
  ios: {
    microfono: api("al-abrir"), camara: api("al-abrir"), pantalla: api("por-uso"),
    accesibilidad: api("panel"), ubicacion: api("por-uso"), bluetooth: api("al-abrir"),
    "red-local": api("por-uso"), notificaciones: api("al-abrir"),
    "segundo-plano": a("indirecta", "declaracion"), archivos: a("indirecta", "por-uso", true),
  },
  navegador: {
    microfono: api("al-abrir"), camara: api("al-abrir"), pantalla: api("por-uso", false),
    ubicacion: api("por-uso"), bluetooth: api("por-uso", false),
    notificaciones: api("al-abrir"), archivos: api("por-uso"),
    "segundo-plano": a("indirecta", "nada"),
  },
  terminal: {},
};

/** La celda de un permiso en un medio; lo que el medio no pide es `no-aplica`. Pura. */
export function celdaDe(medio: Medio, permiso: Permiso): Celda {
  return MATRIZ[medio][permiso] ?? NO_APLICA;
}

/** Los permisos que ese medio sí contempla (en el orden de la matriz). Pura. */
export function permisosDe(medio: Medio): Permiso[] {
  return Object.keys(MATRIZ[medio]) as Permiso[];
}

/** Los medios que contemplan ese permiso. Pura. */
export function mediosDe(permiso: Permiso): Medio[] {
  return (Object.keys(MATRIZ) as Medio[]).filter((m) => !!MATRIZ[m][permiso]);
}

/** Estado antes de leer nada del sistema. Lo ilegible es `desconocido`, nunca `denegado-a-mano`. Pura. */
export function estadoInicial(celda: Celda): Estado {
  if (celda.deteccion === "no-aplica") return "no-aplica";
  if (celda.solicitud === "nada") return "no-disponible";
  if (celda.solicitud === "por-uso") return "por-uso";
  if (celda.deteccion === "no-legible") return "desconocido";
  return "falta";
}

/**
 * Clasifica lo que devolvió el medio. Regla de oro: `desconocido` no se convierte en
 * `denegado-a-mano` por sospecha; hace falta que el sistema lo diga o que antes constara concedido. Pura.
 */
export function estadoDesdeLectura(medio: Medio, permiso: Permiso, l: Lectura): Estado {
  const celda = celdaDe(medio, permiso);
  if (celda.deteccion === "no-aplica") return "no-aplica";
  if (!l.soportado) return "no-disponible";
  if (l.concedido) return "concedido";
  if (l.diceDenegado || l.antesConcedido) return "denegado-a-mano";
  if (celda.solicitud === "por-uso") return "por-uso";
  if (l.ilegible || celda.deteccion === "no-legible") return "desconocido";
  return "falta";
}

/** Qué hacer con un permiso en su estado actual. Lo denegado a mano jamás vuelve a `pedir`. Pura. */
export function decidir(celda: Celda, estado: Estado, momento: Momento = "abrir"): Accion {
  if (estado === "no-aplica" || estado === "no-disponible") return "nada";
  if (estado === "concedido") return "listo";
  if (estado === "denegado-a-mano") return celda.ajustes ? "abrir-ajustes" : "nada";
  if (estado === "por-uso" || celda.solicitud === "por-uso") return momento === "uso" ? "pedir" : "por-uso";
  if (celda.solicitud === "nada" || celda.solicitud === "declaracion") return "nada";
  if (celda.solicitud === "panel") return celda.ajustes ? "abrir-ajustes" : "nada";
  return "pedir";
}

/** El plan completo de un medio al instalar o al abrir: estado y qué hacer con cada permiso. Pura. */
export function planDeApertura(
  medio: Medio,
  estados: Partial<Record<Permiso, Estado>> = {},
  momento: Momento = "abrir",
): FilaPlan[] {
  return permisosDe(medio).map((permiso) => {
    const celda = celdaDe(medio, permiso);
    const estado = estados[permiso] ?? estadoInicial(celda);
    return { permiso, estado, accion: decidir(celda, estado, momento) };
  });
}

/** Los permisos que toca pedir ahora (faltan y el medio permite preguntar). Pura. */
export function aPedir(filas: readonly FilaPlan[]): Permiso[] {
  return filas.filter((f) => f.accion === "pedir").map((f) => f.permiso);
}

/** Los que se muestran con «Abrir ajustes» (negados a mano o solo concedibles en panel). Pura. */
export function aAjustes(filas: readonly FilaPlan[]): Permiso[] {
  return filas.filter((f) => f.accion === "abrir-ajustes").map((f) => f.permiso);
}
