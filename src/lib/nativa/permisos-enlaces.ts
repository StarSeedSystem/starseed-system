/**
 * ════════════════════════════════════════════════════════════════════════════
 * (FAC1116 · 2026-11-16) Enlaces DIRECTOS a la pantalla de Ajustes de cada permiso, en cada sistema, y las palabras que
 * dicen EXACTAMENTE qué pulsar allí. Es la misma tabla que el documento `architecture/permisos-enlaces-directos.md`
 * (una prueba vigila que no se separen) y la que lee la lista «Permisos de tu neurona» y la banda del control remoto.
 *
 * Niveles (lo que el sistema PERMITE, no lo que nos gustaría):
 *   · directo     → se abre la pantalla de ESE permiso (la de StarSeed o la lista donde está su interruptor).
 *   · lista       → se abre la pantalla de la categoría: hay que localizar StarSeed en la lista que sale.
 *   · ficha       → el sistema no tiene pantalla propia: se abre la ficha de la app y se entra en «Permisos».
 *   · aviso       → no hay pantalla previa: el propio sistema pregunta al usarlo.
 *   · sin-enlace  → este sistema no deja abrir una pantalla fiable. Se DICE; no se abre otra distinta.
 *   · no-hace-falta → este sistema no lo pide.
 * NINGÚN camino concede nada solo: abrir una pantalla deja el interruptor en manos de la persona (contrato §1).
 * Módulo puro (sin Tauri): lo importan la ventana, la banda y las pruebas.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { IdPermiso, SistemaPermisos } from "./permisos-registro";

export type NivelEnlace = "directo" | "lista" | "ficha" | "aviso" | "sin-enlace" | "no-hace-falta";

export interface Enlace {
  nivel: NivelEnlace;
  /** Cómo se llama la pantalla donde se cae (o dónde se hace a mano si no hay enlace). */
  pantalla: string;
  /** Qué pulsar allí, en palabras de la propia pantalla. */
  pulsa: string;
}

const d = (pantalla: string, pulsa: string): Enlace => ({ nivel: "directo", pantalla, pulsa });
const l = (pantalla: string, pulsa: string): Enlace => ({ nivel: "lista", pantalla, pulsa });
const f = (pulsa: string): Enlace => ({ nivel: "ficha", pantalla: "Información de la app StarSeed OS", pulsa });
const av = (pulsa: string): Enlace => ({ nivel: "aviso", pantalla: "Aviso del sistema", pulsa });
const sin = (pantalla: string, pulsa: string): Enlace => ({ nivel: "sin-enlace", pantalla, pulsa });
const nada = (pulsa: string): Enlace => ({ nivel: "no-hace-falta", pantalla: "—", pulsa });

const MAC = "Ajustes del Sistema › Privacidad y seguridad › ";
const macPane = (nombre: string, pulsa = "Activa el interruptor de StarSeed OS. Si no está en la lista, pulsa «+» y añádelo.") => d(MAC + nombre, pulsa);

const MACOS: Partial<Record<IdPermiso, Enlace>> = {
  bluetooth: macPane("Bluetooth", "Activa el interruptor de StarSeed OS."),
  "red-local": macPane("Red local", "Activa el interruptor de StarSeed OS. (macOS 15 o posterior; en versiones anteriores no existe este permiso.)"),
  "ubicacion-wifi": macPane("Localización", "Activa «Localización» arriba y el interruptor de StarSeed OS."),
  ubicacion: macPane("Localización", "Activa «Localización» arriba y el interruptor de StarSeed OS."),
  notificaciones: l("Ajustes del Sistema › Notificaciones", "Busca StarSeed OS en la lista y activa «Permitir notificaciones»."),
  microfono: macPane("Micrófono", "Activa el interruptor de StarSeed OS."),
  camara: macPane("Cámara", "Activa el interruptor de StarSeed OS."),
  pantalla: macPane("Grabación de pantalla y audio del sistema", "Activa el interruptor de StarSeed OS y, si macOS lo pide, pulsa «Salir y volver a abrir»."),
  accesibilidad: macPane("Accesibilidad", "Activa el interruptor de StarSeed OS (te pedirá tu contraseña o Touch ID: eso lo haces tú)."),
  "monitor-entrada": macPane("Monitorización de entrada", "Activa el interruptor de StarSeed OS."),
  automatizacion: macPane("Automatización", "Se rellena sola la primera vez que StarSeed OS maneja otra app: allí activa la app que quieras."),
  "disco-completo": macPane("Acceso total al disco", "Activa el interruptor de StarSeed OS y reabre la app."),
  carpetas: macPane("Archivos y carpetas", "Activa las carpetas que quieras compartir bajo StarSeed OS."),
  arranque: l("Ajustes del Sistema › General › Ítems de inicio", "En «Permitir en segundo plano» activa StarSeed OS."),
  capacidades: nada("Leer las capacidades del aparato no pide nada."),
};

const WIN_PRIV = "Configuración › Privacidad y seguridad › ";
const WINDOWS: Partial<Record<IdPermiso, Enlace>> = {
  bluetooth: d("Configuración › Bluetooth y dispositivos", "Activa «Bluetooth»."),
  "red-local": sin("Firewall de Windows (lo abre el propio Windows)", "No hay pantalla de Configuración para esto: Windows pregunta solo la primera vez que StarSeed OS escucha en la red. Elige «Redes privadas»."),
  "ubicacion-wifi": d(WIN_PRIV + "Ubicación", "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»."),
  ubicacion: d(WIN_PRIV + "Ubicación", "Activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación»."),
  notificaciones: d("Configuración › Sistema › Notificaciones", "Activa «Notificaciones» y, en la lista, StarSeed OS."),
  microfono: d(WIN_PRIV + "Micrófono", "Activa «Permitir que las aplicaciones de escritorio accedan al micrófono»."),
  camara: d(WIN_PRIV + "Cámara", "Activa «Permitir que las aplicaciones de escritorio accedan a la cámara»."),
  pantalla: nada("Windows no pide permiso para compartir pantalla; marca con un borde la ventana que se comparte."),
  accesibilidad: nada("Windows no pide permiso para mandar teclas y clics (no llega a ventanas de administrador)."),
  arranque: d("Configuración › Aplicaciones › Inicio", "Activa StarSeed OS en la lista."),
  capacidades: nada("Leer las capacidades del aparato no pide nada."),
};

const AND_APP = "Ajustes › Aplicaciones › StarSeed OS";
const ANDROID: Partial<Record<IdPermiso, Enlace>> = {
  cercanos: f("Pulsa «Permisos» › «Dispositivos cercanos» › «Permitir»."),
  ubicacion: f("Pulsa «Permisos» › «Ubicación» › «Permitir solo mientras la app está en uso» (y «Usar ubicación precisa» si quieres el punto exacto)."),
  nfc: nada("NFC no pide permiso: basta con que esté encendido en el aparato."),
  notificaciones: d(AND_APP + " › Notificaciones", "Activa «Permitir notificaciones»."),
  microfono: f("Pulsa «Permisos» › «Micrófono» › «Permitir solo mientras la app está en uso»."),
  camara: f("Pulsa «Permisos» › «Cámara» › «Permitir solo mientras la app está en uso»."),
  llamadas: d("Ajustes › Aplicaciones › Acceso especial › Notificaciones a pantalla completa (Android 14 o posterior)", "Activa «Permitir notificaciones a pantalla completa». En Android 13 o anterior no hace falta."),
  pantalla: av("Android pregunta cada vez que empieza a compartirse la pantalla: elige «Pantalla completa» o «Una sola app» y pulsa «Empezar ahora»."),
  accesibilidad: l(
    "Ajustes › Accesibilidad › Aplicaciones instaladas",
    "Pulsa «StarSeed OS», activa el interruptor y confirma con «Permitir». Si sale en gris, antes pulsa ⋮ en la ficha de la app › «Permitir ajustes restringidos».",
  ),
  superposicion: d("Ajustes › Aplicaciones › Acceso especial › Mostrar sobre otras apps › StarSeed OS", "Activa «Permitir mostrar sobre otras apps»."),
  bateria: d("Diálogo del sistema «¿Permitir que StarSeed OS ignore las optimizaciones de batería?»", "Pulsa «Permitir»."),
  "todos-archivos": d("Ajustes › Aplicaciones › Acceso especial › Acceso a todos los archivos › StarSeed OS", "Activa «Permitir acceso para administrar todos los archivos»."),
  instalar: d("Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas › StarSeed OS", "Activa «Permitir desde esta fuente»."),
  "no-molestar": l("Ajustes › Notificaciones › Acceso a No molestar", "Pulsa StarSeed OS y activa «Permitir acceso a No molestar»."),
  "escribir-ajustes": d("Ajustes › Aplicaciones › Acceso especial › Modificar ajustes del sistema › StarSeed OS", "Activa «Permitir modificar los ajustes del sistema»."),
  capacidades: nada("Leer las capacidades del aparato no pide nada."),
};

const LINUX_COMUN = "Linux no tiene una pantalla de permisos única: cada escritorio (GNOME, KDE…) pone la suya y la app no puede saber cuál es, así que no abre ninguna. ";
const LINUX_X11: Partial<Record<IdPermiso, Enlace>> = {
  bluetooth: nada("BlueZ no pide permiso a la app; solo hace falta que el Bluetooth esté encendido."),
  "red-local": nada("Linux no pide permiso para la red local."),
  notificaciones: nada("Linux no pide permiso para las notificaciones."),
  microfono: sin("Los ajustes de sonido de tu escritorio", LINUX_COMUN + "Si la app no oye, mira Sonido › Entrada y que el micrófono no esté silenciado."),
  camara: sin("Los ajustes de privacidad de tu escritorio", LINUX_COMUN + "Si la cámara no sale, comprueba que no la use otra app."),
  pantalla: nada("En X11 cualquier app puede ver la pantalla: no hay nada que pedir."),
  accesibilidad: nada("En X11 cualquier app puede mandar teclas y clics: no hay nada que pedir."),
  arranque: sin("Aplicaciones al inicio de tu escritorio", LINUX_COMUN + "StarSeed OS crea su entrada en ~/.config/autostart; para quitarla, bórrala desde el gestor de inicio de tu escritorio."),
  capacidades: nada("Leer las capacidades del aparato no pide nada."),
};
const LINUX_WAYLAND: Partial<Record<IdPermiso, Enlace>> = {
  ...LINUX_X11,
  pantalla: av("Wayland pregunta con su propio selector cada vez que se comparte la pantalla: elige la pantalla o ventana y pulsa «Compartir»."),
  accesibilidad: av("Wayland solo deja mandar teclas y clics por el portal de Escritorio remoto, que pregunta en cada sesión: pulsa «Permitir»."),
};

const TABLA: Record<SistemaPermisos, Partial<Record<IdPermiso, Enlace>>> = {
  macos: MACOS,
  windows: WINDOWS,
  android: ANDROID,
  "linux-x11": LINUX_X11,
  "linux-wayland": LINUX_WAYLAND,
};

/** El enlace (o la razón de que no lo haya) de un permiso en un sistema. null si el permiso no existe allí. Pura. */
export function enlaceDe(sistema: SistemaPermisos | null | undefined, id: IdPermiso): Enlace | null {
  return (sistema && TABLA[sistema][id]) || null;
}

/** Todas las filas de un sistema (para el documento y las pruebas). Pura. */
export function filasDe(sistema: SistemaPermisos): [IdPermiso, Enlace][] {
  return Object.entries(TABLA[sistema]) as [IdPermiso, Enlace][];
}

/** ¿Tiene sentido un botón «Abrir Ajustes»? Solo si el sistema deja abrir algo. Pura. */
export function hayBoton(e: Enlace | null): boolean {
  return !!e && (e.nivel === "directo" || e.nivel === "lista" || e.nivel === "ficha");
}

/** La línea que la ventana enseña bajo el permiso: qué pantalla y qué pulsar, o la verdad de que no hay enlace. Pura. */
export function textoEnlace(e: Enlace | null): string {
  if (!e) return "";
  switch (e.nivel) {
    case "directo":
      return `Se abre «${e.pantalla}». ${e.pulsa}`;
    case "lista":
      return `Se abre «${e.pantalla}» (la lista, no el interruptor). ${e.pulsa}`;
    case "ficha":
      return `Android no tiene una pantalla propia para esto: se abre «${e.pantalla}». ${e.pulsa}`;
    case "aviso":
      return e.pulsa;
    case "sin-enlace":
      return `No hay enlace directo en este sistema. ${e.pulsa}`;
    default:
      return e.pulsa;
  }
}

/* ───────────── Lo que le falta al control remoto de una tableta (`control_capacidades().falta`) ───────────── */

export const ENLACES_CONTROL: Record<"servicio-accesibilidad" | "ajustes-restringidos" | "escribir-ajustes" | "consentimiento-pantalla" | "grabacion-pantalla" | "accesibilidad-mac", Enlace> = {
  "servicio-accesibilidad": ANDROID.accesibilidad!,
  "ajustes-restringidos": f(
    "Pulsa ⋮ (arriba a la derecha) › «Permitir ajustes restringidos» y confirma con tu huella o PIN. Si ⋮ no sale, vuelve a «Accesibilidad», intenta activar StarSeed OS una vez (saldrá en gris) y regresa aquí: Android lo muestra después del primer intento.",
  ),
  "escribir-ajustes": ANDROID["escribir-ajustes"]!,
  "consentimiento-pantalla": { nivel: "aviso", pantalla: "Diálogo de StarSeed OS en este aparato", pulsa: "Lee el aviso y pulsa «Sí» solo si quieres que tus otras neuronas vean la pantalla sin preguntar." },  // CTL1117M: lo que le falta a un Mac controlado; los dos los concede la persona en Ajustes del Sistema.
  "grabacion-pantalla": MACOS.pantalla!,
  "accesibilidad-mac": MACOS.accesibilidad!,
};
