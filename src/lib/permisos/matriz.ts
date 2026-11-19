/*
 * matriz — la matriz real permiso × medio (PRM1119, 2026-11-19).
 * Contrato: docs/contratos/permisos-por-medio.md (el documento lo explica; aquí vive la regla).
 *
 * MÓDULO PURO: dice, para cada medio donde corre StarSeed OS, qué permisos existen, cómo se lee
 * su estado, cómo se piden, si hay pantalla de Ajustes y cómo se distingue «falta» de «denegado
 * a mano». La regla que aplica `planDe`:
 *  · al instalar y al abrir se pide lo que FALTA y es útil en ese momento;
 *  · lo DENEGADO A MANO no se vuelve a pedir solo: se enseña en la lista con «Abrir ajustes»;
 *  · nunca se concede nada por la persona: aquí solo se decide pedir, abrir Ajustes o esperar.
 */

export const MEDIOS = ["macos", "ios", "android", "linux", "windows", "navegador", "terminal"] as const;
export type Medio = (typeof MEDIOS)[number];

export const PERMISOS = [
  "microfono",
  "camara",
  "pantalla",
  "control",
  "entrada-virtual",
  "ubicacion",
  "bluetooth",
  "red-local",
  "notificaciones",
  "segundo-plano",
  "archivos",
  "energia",
] as const;
export type Permiso = (typeof PERMISOS)[number];

/** Cómo se lee su estado en ese medio. */
export type Deteccion = "api-estado" | "api-uso" | "sistema" | "inferida" | "no-se-puede" | "no-hace-falta";

/** Cómo se pide de verdad en ese medio. */
export type Peticion = "aviso" | "panel" | "por-uso" | "declaracion" | "nada";

/** Qué se puede abrir desde la lista. */
export type Enlace = "directo" | "lista" | "ficha" | "aviso" | "sin-enlace" | "no-hace-falta";

export interface Celda {
  permiso: Permiso;
  detecta: Deteccion;
  pide: Peticion;
  enlace: Enlace;
  /** Útil en la instalación (primera vez que la persona abre la app). */
  alInstalar: boolean;
  /** Útil en cada apertura, si el sistema dice que falta. */
  alAbrir: boolean;
  /** Cómo se distingue «falta» de «denegado a mano» aquí, en una línea. */
  distingue: string;
  nota?: string;
}

/** Estado observado. `denegado-a-mano` es distinto de `falta` a propósito. */
export type Observado = "concedido" | "falta" | "denegado-a-mano" | "no-se-puede-saber" | "no-aplica";

/** Lo que devuelve la API del sistema, sin interpretar. */
export interface Senal {
  api?: "granted" | "denied" | "prompt" | "unsupported" | "unknown";
  /** La app ya enseñó su aviso (o la persona ya lo vio) en este aparato. */
  yaPreguntado?: boolean;
}

export type Accion = "pedir" | "abrir-ajustes" | "por-uso" | "nada" | "listo";

export interface Fila extends Celda {
  observado: Observado;
  accion: Accion;
}

export interface Plan {
  pedir: Permiso[];
  abrirAjustes: Permiso[];
  porUso: Permiso[];
}

const c = (
  permiso: Permiso,
  detecta: Deteccion,
  pide: Peticion,
  enlace: Enlace,
  alInstalar: boolean,
  alAbrir: boolean,
  distingue: string,
  nota?: string,
): Celda => ({ permiso, detecta, pide, enlace, alInstalar, alAbrir, distingue, nota });

/* ══════════════════════════ La matriz ══════════════════════════ */

export const MATRIZ: Record<Medio, Celda[]> = {
  macos: [
    c("microfono", "api-estado", "aviso", "directo", true, true, "TCC: `notDetermined` es falta; apagado por la persona es denegado a mano."),
    c("camara", "api-estado", "aviso", "directo", true, true, "TCC: `notDetermined` es falta; apagado por la persona es denegado a mano."),
    c("pantalla", "api-estado", "panel", "directo", false, false, "TCC: sin fila es falta; interruptor apagado es denegado a mano.", "Tras concederlo, macOS puede pedir reabrir la app."),
    c("control", "api-estado", "panel", "directo", false, false, "`AXIsProcessTrusted`: false sin fila es falta; interruptor apagado es denegado a mano.", "Accesibilidad; te pedirá contraseña o Touch ID."),
    c("entrada-virtual", "api-estado", "panel", "directo", false, false, "Es el mismo permiso de Accesibilidad: false sin fila es falta; apagado es denegado a mano."),
    c("ubicacion", "api-estado", "por-uso", "directo", false, false, "`notDetermined` es falta; `denied`/`restricted` es denegado a mano."),
    c("bluetooth", "api-estado", "aviso", "directo", true, false, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("red-local", "inferida", "aviso", "directo", true, false, "macOS no deja leerlo: si la malla local responde está; si no, no se sabe si falta o se negó."),
    c("notificaciones", "api-estado", "aviso", "lista", true, false, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("segundo-plano", "sistema", "aviso", "lista", true, false, "Sin registrar es falta; retirado en Ítems de inicio es denegado a mano."),
    c("archivos", "api-uso", "por-uso", "directo", false, false, "TCC por carpeta: sin lectura; el aviso al elegirla es falta y el silencio tras negar es denegado a mano."),
    c("energia", "no-hace-falta", "nada", "no-hace-falta", false, false, "`IOPMAssertion` no pide permiso."),
  ],
  ios: [
    c("microfono", "api-estado", "aviso", "ficha", true, true, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("camara", "api-estado", "aviso", "ficha", true, true, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("pantalla", "api-uso", "por-uso", "aviso", false, false, "ReplayKit pregunta en cada emisión: no hay estado previo que leer."),
    c("control", "no-hace-falta", "nada", "no-hace-falta", false, false, "iOS no permite que una app controle otras apps."),
    c("entrada-virtual", "no-hace-falta", "nada", "no-hace-falta", false, false, "iOS no permite inyectar teclas ni clics fuera de la app."),
    c("ubicacion", "api-estado", "por-uso", "ficha", false, false, "`notDetermined` es falta; `denied`/`restricted` es denegado a mano."),
    c("bluetooth", "api-estado", "aviso", "ficha", true, false, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("red-local", "inferida", "aviso", "ficha", true, false, "El aviso sale en el primer acceso Bonjour; sin API de estado, después no se sabe si falta o se negó."),
    c("notificaciones", "api-estado", "aviso", "ficha", true, false, "`notDetermined` es falta; `denied` es denegado a mano."),
    c("segundo-plano", "no-hace-falta", "nada", "no-hace-falta", false, false, "Se declara en el manifiesto; iOS decide y no pregunta."),
    c("archivos", "api-uso", "por-uso", "no-hace-falta", false, false, "El selector de documentos no da acceso permanente: cada archivo se elige."),
    c("energia", "no-hace-falta", "nada", "no-hace-falta", false, false, "La energía la gobierna el sistema; la app no pide nada."),
  ],
  android: [
    c("microfono", "api-estado", "aviso", "ficha", true, true, "`checkSelfPermission` da DENIED también sin preguntar: DENIED sin aviso previo es falta; con aviso previo es denegado a mano o «no volver a preguntar»."),
    c("camara", "api-estado", "aviso", "ficha", true, true, "DENIED sin aviso previo es falta; DENIED con aviso previo es denegado a mano."),
    c("pantalla", "api-uso", "por-uso", "aviso", false, false, "MediaProjection pregunta cada vez; no se guarda ni se puede leer antes."),
    c("control", "sistema", "panel", "lista", false, false, "El servicio de accesibilidad se lee de los ajustes: ausente es falta; desactivado tras activarlo es denegado a mano."),
    c("entrada-virtual", "sistema", "panel", "lista", false, false, "Misma accesibilidad: ausente es falta; desactivada tras activarla es denegado a mano."),
    c("ubicacion", "api-estado", "aviso", "ficha", true, false, "DENIED sin preguntar es falta; DENIED con «no volver a preguntar» es denegado a mano."),
    c("bluetooth", "api-estado", "aviso", "ficha", true, false, "Dispositivos cercanos: DENIED sin preguntar es falta; con «no volver a preguntar» es denegado a mano."),
    c("red-local", "no-hace-falta", "nada", "no-hace-falta", false, false, "Android no pide permiso para la red local."),
    c("notificaciones", "api-estado", "aviso", "ficha", true, false, "Android 13+: desactivadas sin haber preguntado es falta; tras denegar es denegado a mano."),
    c("segundo-plano", "sistema", "panel", "directo", true, false, "Sin optimización ignorada es falta; si ya se pidió y sigue igual, es denegado a mano."),
    c("archivos", "sistema", "panel", "directo", false, false, "Acceso a todos los archivos: false es falta; tras pedirlo y seguir false es denegado a mano. El selector SAF no pide nada."),
    c("energia", "sistema", "panel", "directo", true, false, "Ignorar optimizaciones de batería: false es falta; tras pedirlo y seguir false es denegado a mano."),
  ],
  linux: [
    c("microfono", "api-uso", "por-uso", "sin-enlace", false, false, "X11 no pide; Wayland/PipeWire pregunta al usarlo. No hay estado que leer."),
    c("camara", "api-uso", "por-uso", "sin-enlace", false, false, "X11 no pide; Wayland pregunta al usarla. No hay estado que leer."),
    c("pantalla", "api-uso", "por-uso", "aviso", false, false, "X11 no pide; Wayland pregunta con su selector cada vez."),
    c("control", "api-uso", "por-uso", "aviso", false, false, "X11 es libre; Wayland solo por el portal de Escritorio remoto, que pregunta en cada sesión."),
    c("entrada-virtual", "api-uso", "por-uso", "aviso", false, false, "X11 es libre; Wayland pregunta en cada sesión por el portal de Escritorio remoto."),
    c("ubicacion", "api-uso", "por-uso", "sin-enlace", false, false, "GeoClue no expone un estado por app: se pregunta al usarlo."),
    c("bluetooth", "no-hace-falta", "nada", "no-hace-falta", false, false, "BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido."),
    c("red-local", "no-hace-falta", "nada", "no-hace-falta", false, false, "Linux no pide permiso para la red local."),
    c("notificaciones", "no-hace-falta", "nada", "no-hace-falta", false, false, "El escritorio no pide permiso para notificar."),
    c("segundo-plano", "sistema", "nada", "sin-enlace", true, false, "La entrada de ~/.config/autostart existe o no: quitarla es denegado a mano."),
    c("archivos", "no-hace-falta", "nada", "no-hace-falta", false, false, "Permisos POSIX normales; solo Flatpak o Snap piden por el portal."),
    c("energia", "no-hace-falta", "nada", "no-hace-falta", false, false, "La app no cambia la energía del sistema."),
  ],
  windows: [
    c("microfono", "inferida", "por-uso", "directo", true, false, "Windows no expone el estado por app de escritorio: si pregunta al usarlo es falta; si ya no pregunta y no hay audio, se negó a mano."),
    c("camara", "inferida", "por-uso", "directo", true, false, "Si pregunta al usarla es falta; si ya no pregunta y no hay imagen, se negó a mano."),
    c("pantalla", "no-hace-falta", "nada", "no-hace-falta", false, false, "Windows no pide permiso para capturar; marca con un borde la ventana compartida."),
    c("control", "no-hace-falta", "nada", "no-hace-falta", false, false, "No pide permiso, pero no llega a ventanas de administrador."),
    c("entrada-virtual", "no-hace-falta", "nada", "no-hace-falta", false, false, "`SendInput` no pide permiso."),
    c("ubicacion", "inferida", "por-uso", "directo", false, false, "Si pregunta al usarla es falta; si ya no pregunta, se negó a mano."),
    c("bluetooth", "no-hace-falta", "nada", "no-hace-falta", false, false, "Windows no pide permiso a las apps de escritorio para el Bluetooth."),
    c("red-local", "inferida", "por-uso", "sin-enlace", false, false, "El Firewall pregunta la primera vez que se escucha; si ya no pregunta y no conecta, se negó a mano."),
    c("notificaciones", "sistema", "nada", "directo", false, false, "Activadas por defecto; se apagan en Configuración › Notificaciones."),
    c("segundo-plano", "sistema", "aviso", "directo", true, false, "En Aplicaciones › Inicio: sin la entrada es falta; quitada por la persona es denegado a mano."),
    c("archivos", "no-hace-falta", "nada", "no-hace-falta", false, false, "Las carpetas del usuario se leen sin pedir (salvo Acceso controlado a carpetas)."),
    c("energia", "no-hace-falta", "nada", "no-hace-falta", false, false, "La energía la gobierna el sistema; la app no pide nada."),
  ],
  navegador: [
    c("microfono", "api-estado", "aviso", "directo", true, true, "Permissions API: `prompt` es falta; `denied` es denegado a mano."),
    c("camara", "api-estado", "aviso", "directo", true, true, "Permissions API: `prompt` es falta; `denied` es denegado a mano."),
    c("pantalla", "api-uso", "por-uso", "aviso", false, false, "`getDisplayMedia` exige gesto y pregunta cada vez; no hay estado persistente."),
    c("control", "no-hace-falta", "nada", "no-hace-falta", false, false, "Una página no controla otras apps ni el aparato."),
    c("entrada-virtual", "no-hace-falta", "nada", "no-hace-falta", false, false, "Una página no inyecta teclas ni clics fuera de su pestaña."),
    c("ubicacion", "api-estado", "aviso", "directo", true, false, "Permissions API: `prompt` es falta; `denied` es denegado a mano."),
    c("bluetooth", "api-uso", "por-uso", "ficha", false, false, "Web Bluetooth elige dispositivo cada vez y el permiso es por origen: no persiste."),
    c("red-local", "no-hace-falta", "nada", "no-hace-falta", false, false, "El navegador aplica CORS y contenido mixto; no hay permiso de red local."),
    c("notificaciones", "api-estado", "aviso", "directo", true, true, "`Notification.permission`: `default` es falta; `denied` es denegado a mano."),
    c("segundo-plano", "no-hace-falta", "nada", "no-hace-falta", false, false, "Service Worker y sincronización no piden permiso."),
    c("archivos", "api-uso", "por-uso", "sin-enlace", false, false, "El selector pregunta cada vez; el permiso por archivo se relee con `queryPermission`."),
    c("energia", "api-uso", "por-uso", "no-hace-falta", false, false, "Wake Lock exige página visible y gesto; no hay permiso persistente."),
  ],
  terminal: [
    c("microfono", "no-se-puede", "nada", "sin-enlace", false, false, "Hereda los permisos de la app de terminal: StarSeed no puede pedirlos ni saber si faltan."),
    c("camara", "no-se-puede", "nada", "sin-enlace", false, false, "Hereda los permisos de la app de terminal: no hay aviso propio."),
    c("pantalla", "no-se-puede", "nada", "sin-enlace", false, false, "Hereda los permisos de la app de terminal: no hay aviso propio."),
    c("control", "no-se-puede", "nada", "sin-enlace", false, false, "Depende de la sesión y de la terminal; no hay estado por app."),
    c("entrada-virtual", "no-se-puede", "nada", "sin-enlace", false, false, "Depende de la sesión gráfica; StarSeed no puede pedirlo desde la terminal."),
    c("ubicacion", "no-se-puede", "nada", "sin-enlace", false, false, "Depende del sistema; no hay aviso propio del binario."),
    c("bluetooth", "no-hace-falta", "nada", "no-hace-falta", false, false, "No hay permiso de Bluetooth para un proceso de consola."),
    c("red-local", "inferida", "por-uso", "sin-enlace", false, false, "El firewall pregunta la primera vez que el binario escucha; si ya no pregunta y no conecta, se negó a mano."),
    c("notificaciones", "no-hace-falta", "nada", "no-hace-falta", false, false, "La terminal no pide permiso para avisar."),
    c("segundo-plano", "sistema", "nada", "sin-enlace", true, false, "El servicio de usuario (launchd/systemd) está instalado o no: quitarlo es denegado a mano."),
    c("archivos", "no-hace-falta", "nada", "no-hace-falta", false, false, "Permisos POSIX del usuario; solo la jaula del sistema puede limitarlos."),
    c("energia", "no-hace-falta", "nada", "no-hace-falta", false, false, "La terminal no cambia la energía del sistema."),
  ],
};

export function celdasDe(medio: Medio): Celda[] {
  return MATRIZ[medio];
}

export function celdaDe(medio: Medio, permiso: Permiso): Celda | null {
  return MATRIZ[medio].find((x) => x.permiso === permiso) ?? null;
}

/* ══════════════════════════ La regla ══════════════════════════ */

/** Medios donde `denied` de la API es SIEMPRE una decisión de la persona (no «aún no preguntado»). */
const DENEGACION_EXPLICITA: Record<Medio, boolean> = {
  macos: true,
  ios: true,
  windows: false,
  android: false,
  linux: false,
  navegador: true,
  terminal: false,
};

/**
 * Traduce la señal cruda del sistema a un estado. Pura.
 * En Android (y otros sistemas sin estado «sin preguntar») `denied` es el valor por defecto: solo es
 * «denegado a mano» si la app ya enseñó su aviso; si no, es «falta».
 */
export function clasificar(medio: Medio, senal: Senal): Observado {
  switch (senal.api) {
    case "granted":
      return "concedido";
    case "denied":
      return DENEGACION_EXPLICITA[medio] || senal.yaPreguntado ? "denegado-a-mano" : "falta";
    case "prompt":
      return "falta";
    case "unsupported":
      return "no-aplica";
    default:
      return "no-se-puede-saber";
  }
}

/**
 * Qué hace la lista con una celda y su estado. Pura.
 * Nunca devuelve «conceder»: pedir es enseñar el aviso del sistema; abrir Ajustes deja el
 * interruptor en manos de la persona.
 */
export function decidir(celda: Celda, observado: Observado): Accion {
  if (observado === "concedido") return "listo";
  if (observado === "no-aplica") return "nada";
  // Si en este medio no existe el permiso, no hay nada que abrir ni que pedir.
  if (celda.pide === "nada" || celda.pide === "declaracion") return "nada";
  // Denegado a mano: no se vuelve a pedir solo; la lista lo enseña con «Abrir ajustes».
  if (observado === "denegado-a-mano") return "abrir-ajustes";
  switch (celda.pide) {
    case "panel":
      return "abrir-ajustes";
    case "por-uso":
      return "por-uso";
    case "aviso":
      return "pedir";
  }
}

/** Todos los permisos del medio con lo que la lista debe enseñar (incluidos los denegados). Pura. */
export function listaDe(medio: Medio, observados: Partial<Record<Permiso, Observado>> = {}): Fila[] {
  return celdasDe(medio).map((celda) => {
    const observado = observados[celda.permiso] ?? "no-se-puede-saber";
    return { ...celda, observado, accion: decidir(celda, observado) };
  });
}

/**
 * Lo que se pide SOLO, sin que la persona toque nada: al instalar (primera apertura) o al abrir.
 * Lo denegado a mano no entra: no se insiste. `pedir` enseña el aviso; `abrirAjustes` es solo para
 * permisos que únicamente se dan en una pantalla del sistema (`panel`) y aún no se han pedido.
 */
export function planDe(
  medio: Medio,
  observados: Partial<Record<Permiso, Observado>> = {},
  momento: "instalar" | "abrir" = "abrir",
): Plan {
  const plan: Plan = { pedir: [], abrirAjustes: [], porUso: [] };
  for (const celda of celdasDe(medio)) {
    const util = momento === "instalar" ? celda.alInstalar : celda.alAbrir;
    if (!util) continue;
    const observado = observados[celda.permiso] ?? "falta";
    if (observado === "denegado-a-mano" || observado === "concedido" || observado === "no-aplica") continue;
    const accion = decidir(celda, observado);
    if (accion === "pedir" && !plan.pedir.includes(celda.permiso)) plan.pedir.push(celda.permiso);
    if (accion === "abrir-ajustes" && !plan.abrirAjustes.includes(celda.permiso)) plan.abrirAjustes.push(celda.permiso);
    if (accion === "por-uso" && !plan.porUso.includes(celda.permiso)) plan.porUso.push(celda.permiso);
  }
  return plan;
}
