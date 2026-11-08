/*
 * pantalla-completa — pantalla completa SIN congelar la ventana de la app nativa (PER1108A, 2026-11-08).
 * Contrato: architecture/red-sin-dependencias.md §4 «Pantalla completa en la app de escritorio».
 *
 * Qué pasó (08-11, 12:40 CST, build 0.5.1-prueba.26): en el Mac, la web pedía pantalla completa de un
 * ELEMENTO (`documentElement.requestFullscreen()`, en el primer gesto, desde system-chrome.tsx). WKWebView la
 * lleva a otro Space y deja en la ventana principal un marcador borroso («Click to Exit Full Screen»). Tras
 * relanzar la app volvía así; un clic en el marcador dejaba la ventana SIN repintar ni recibir clics (el
 * servidor local seguía contestando; Cmd+Q lo arreglaba y Esc salía bien). Lo que se hace ahora:
 *  · en la app nativa NUNCA se pide pantalla completa de elemento: se usa la de la VENTANA (comando
 *    `ventana_pantalla_completa`, Rust `set_fullscreen`), que es la del sistema y no deja marcador;
 *  · si al abrir hay un elemento a pantalla completa restaurado en la app nativa, se sale;
 *  · al ocultarse o descargarse la página siempre se sale de la pantalla completa de elemento;
 *  · si `document.fullscreenElement` quedó obsoleto (ya no está en el documento), se sale.
 * Lo de decidir es puro; `crearVigilante` toma el documento y el puente inyectados.
 */

export type AccionPantalla = "ventana-entrar" | "ventana-salir" | "elemento-entrar" | "elemento-salir" | "nada";

export interface SituacionPantalla {
  nativa: boolean;
  /** Hay un elemento a pantalla completa (`document.fullscreenElement`). */
  elementoCompleto: boolean;
  /** `true`/`false`: forzar; `undefined`: alternar. */
  activo?: boolean;
  /** Pantalla completa de la ventana (la sabemos nosotros; en la web normal siempre false). */
  ventanaCompleta: boolean;
}

/** Qué hacer ante una petición de pantalla completa. Pura. */
export function decidirPantalla(s: SituacionPantalla): AccionPantalla {
  const completa = s.nativa ? s.ventanaCompleta || s.elementoCompleto : s.elementoCompleto;
  const quiere = s.activo === undefined ? !completa : s.activo;
  if (s.nativa) {
    // Nunca de elemento: si había uno (restaurado, o de otro código), se sale primero.
    if (s.elementoCompleto) return "elemento-salir";
    if (quiere) return s.ventanaCompleta ? "nada" : "ventana-entrar";
    return s.ventanaCompleta ? "ventana-salir" : "nada";
  }
  if (quiere) return s.elementoCompleto ? "nada" : "elemento-entrar";
  return s.elementoCompleto ? "elemento-salir" : "nada";
}

/** ¿El primer gesto del usuario debe pedir pantalla completa? Pura. En la app nativa, nunca. */
export function pedirEnPrimerGesto(p: { nativa: boolean; iframe: boolean; instalada: boolean; yaIntentado: boolean; elementoCompleto: boolean }): boolean {
  if (p.nativa || p.iframe || p.instalada || p.yaIntentado || p.elementoCompleto) return false;
  return true;
}

/** ¿El elemento a pantalla completa es obsoleto (ya no está en el documento)? Pura. */
export function elementoObsoleto(el: { isConnected?: boolean } | null | undefined): boolean {
  return !!el && el.isConnected === false;
}

export interface DocumentoMinimo {
  fullscreenElement: ({ isConnected?: boolean } & object) | null;
  visibilityState?: string;
  exitFullscreen?: () => Promise<void> | void;
  addEventListener(tipo: string, f: () => void): void;
  removeEventListener(tipo: string, f: () => void): void;
}

export interface VentanaMinima {
  addEventListener(tipo: string, f: () => void): void;
  removeEventListener(tipo: string, f: () => void): void;
}

export interface OpcionesVigilante {
  doc: DocumentoMinimo;
  ventana: VentanaMinima;
  nativa: boolean;
  /** Para dejar rastro si hubo que salir de una pantalla completa que no debía estar (console.warn). */
  registrar?: (mensaje: string) => void;
  /** Cada cuánto se revisa en la app nativa (ms). 0: sin revisión periódica. */
  cadaMs?: number;
  temporizador?: { set: (f: () => void, ms: number) => unknown; clear: (id: unknown) => void };
}

/**
 * Vigila la pantalla completa de ELEMENTO. Devuelve la función que lo desmonta.
 * Sale (sin lanzar nunca) cuando: la app nativa abre con un elemento a pantalla completa (estado restaurado);
 * la página se oculta o se descarga; el elemento quedó obsoleto. En la app nativa repasa además cada `cadaMs`
 * (un repaso barato, sin leer nada más que `fullscreenElement`). Un elemento a pantalla completa PUESTO a
 * propósito mientras la página está a la vista (p. ej. el modo presentador) no se toca.
 */
export function crearVigilante(o: OpcionesVigilante): () => void {
  const salir = (motivo: string) => {
    try {
      if (!o.doc.fullscreenElement) return;
      o.registrar?.(`[pantalla-completa] se sale de la pantalla completa de elemento: ${motivo}`);
      void Promise.resolve(o.doc.exitFullscreen?.()).catch(() => {});
    } catch {
      /* nada */
    }
  };
  const alOcultar = () => {
    if (o.doc.visibilityState === "hidden") salir("la página se ocultó");
  };
  const alDescargar = () => salir("la página se descarga");
  const alCambiar = () => {
    if (elementoObsoleto(o.doc.fullscreenElement)) salir("el elemento quedó obsoleto");
    else if (o.doc.visibilityState === "hidden") salir("la página está oculta");
  };
  if (o.nativa) salir("estado restaurado al abrir");
  o.doc.addEventListener("visibilitychange", alOcultar);
  o.doc.addEventListener("fullscreenchange", alCambiar);
  o.doc.addEventListener("webkitfullscreenchange", alCambiar);
  o.ventana.addEventListener("pagehide", alDescargar);
  o.ventana.addEventListener("beforeunload", alDescargar);
  let id: unknown = null;
  const t = o.temporizador;
  if (o.nativa && t && (o.cadaMs ?? 0) > 0) id = t.set(() => alCambiar(), o.cadaMs as number);
  return () => {
    o.doc.removeEventListener("visibilitychange", alOcultar);
    o.doc.removeEventListener("fullscreenchange", alCambiar);
    o.doc.removeEventListener("webkitfullscreenchange", alCambiar);
    o.ventana.removeEventListener("pagehide", alDescargar);
    o.ventana.removeEventListener("beforeunload", alDescargar);
    if (id !== null && t) t.clear(id);
  };
}

export const COMANDO_PANTALLA_VENTANA = "ventana_pantalla_completa";
