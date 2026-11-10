/**
 * puerta/plataformas — qué puede hacer cada sistema con la puerta (PTA1110B · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3 «Matriz de plataformas». Puro y con pruebas por tabla.
 *
 * Dos preguntas por sistema, contestadas desde el código (no desde la esperanza):
 *  · COMPARTIR (ser la puerta): hace falta el lado de Node (`puerta.cjs`: sockets TCP crudos y DNS), la página viva
 *    (el gestor de túneles vive en la página) y seguir despierta cuando la persona no mira.
 *  · USAR la de otra: la app (Supabase, `/api`), el webview entero (páginas externas, imágenes, iframes) y las descargas de Rust.
 *
 * Lo que no se ha probado en aparatos está marcado `probado: false` en la prueba y en el contrato.
 */

export type Plataforma = "macos" | "android" | "windows" | "linux" | "ios" | "web";

export interface EntornoPuerta {
  plataforma: Plataforma;
  /** Hay lado de Node (app nativa con `puerta.cjs`). La web/PWA nunca. */
  nativo: boolean;
  /** Versión mayor de macOS (solo macOS). */
  macosMayor?: number | null;
  /** Nivel de API de Android (solo Android). */
  androidSdk?: number | null;
  /** Android: el WebView admite `PROXY_OVERRIDE` (lo confirma Kotlin). Windows: la pasarela quedó instalada. Linux: WebKitGTK ≥ 2.16 (siempre en la build). */
  webviewProxy?: boolean | null;
  /** `STARSEED_SIN_PROXY_PUERTA=1`. */
  proxyApagadoPorEntorno?: boolean;
  /** iOS: versión mayor (WKWebsiteDataStore.proxyConfigurations pide 17). */
  iosMayor?: number | null;
}

export type SegundoPlano = "siempre" | "con-servicio" | "solo-primer-plano" | "no";

export interface CapacidadesPuerta {
  compartir: {
    puede: boolean;
    /** Lo que necesita para hacerlo, en llano. */
    necesita: string[];
    segundoPlano: SegundoPlano;
    /** Por qué no (o con qué límite), en llano. */
    nota: string | null;
  };
  usar: {
    /** Los datos de la propia app (Supabase, `/api/*`). */
    app: boolean;
    /** Todo el tráfico del webview (páginas externas, imágenes, vídeo, iframes, navegador de la app). */
    webview: boolean;
    /** Actualizador y descargas nativas (Rust). */
    descargas: boolean;
    /** Lo que pasa y lo que no, para la interfaz. */
    pasa: string[];
    noPasa: string[];
    nota: string | null;
  };
}

const NODO = "el lado de Node de la app (puerta.cjs: sockets TCP y DNS)";
const PAGINA_VIVA = "la página de la app en marcha (ahí vive el gestor de túneles)";

/** Qué puede hacer este sistema. */
export function capacidadesPuerta(e: EntornoPuerta): CapacidadesPuerta {
  const sinProxy = e.proxyApagadoPorEntorno === true;
  const base = (c: Partial<CapacidadesPuerta["compartir"]>, u: Partial<CapacidadesPuerta["usar"]>): CapacidadesPuerta => ({
    compartir: { puede: false, necesita: [], segundoPlano: "no", nota: null, ...c },
    usar: { app: false, webview: false, descargas: false, pasa: [], noPasa: [], nota: null, ...u },
  });

  if (e.plataforma === "web" || !e.nativo) {
    return base(
      { nota: "La web y la PWA no tienen sockets TCP: no pueden ser puerta." },
      {
        nota: "Sin lado de Node no hay túnel TLS. Solo habría el GET sellado de puerta-internet.ts por una neurona nativa de la misma cuenta, y ese camino aún no tiene transporte enchufado.",
        noPasa: ["Todo: la web no sale por la malla hoy (si tiene internet propio no lo necesita; si no, no alcanza a las neuronas nativas)."],
      },
    );
  }

  const noPasaUdp = "UDP, DNS propio y HTTP/3 (la puerta resuelve el DNS)";

  switch (e.plataforma) {
    case "macos": {
      const v = e.macosMayor ?? null;
      const webview = !sinProxy && v !== null && v >= 14;
      return base(
        { puede: true, necesita: [NODO, PAGINA_VIVA], segundoPlano: "siempre", nota: "La app sigue en el Dock/barra de menús; no duerme si el Mac no entra en reposo." },
        {
          app: true,
          webview,
          descargas: true,
          pasa: ["Datos de la app (Supabase y /api)", "Actualizador y descargas de Rust", ...(webview ? ["Páginas externas, imágenes, vídeo, iframes y el navegador de la app (WKWebsiteDataStore.proxyConfigurations)"] : [])],
          noPasa: [noPasaUdp, ...(webview ? [] : ["Páginas externas, imágenes e iframes del webview"])],
          nota: webview ? null : sinProxy ? "El proxy de la puerta está apagado por STARSEED_SIN_PROXY_PUERTA." : "Hace falta macOS 14 (Sonoma) para llevar el webview entero por la malla; en macOS 10.15–13 pasan los datos de la app y las descargas.",
        },
      );
    }
    case "android": {
      const sdk = e.androidSdk ?? null;
      const webview = !sinProxy && (sdk === null || sdk >= 21) && e.webviewProxy !== false;
      return base(
        {
          puede: true,
          necesita: [NODO + " (nodejs-mobile en el APK)", PAGINA_VIVA, "el servicio en primer plano de las antenas (connectedDevice) para seguir con la pantalla apagada"],
          segundoPlano: "con-servicio",
          nota: "Con la pantalla apagada Android pausa los temporizadores del WebView: ServicioAntenas los reanuda (PTA1110B). Por datos móviles solo comparte si la persona lo eligió (Compartir por datos móviles: Nunca / Preguntar / Sí con tope).",
        },
        {
          app: true,
          webview,
          descargas: true,
          pasa: ["Datos de la app (Supabase y /api)", "Actualizador y descargas de Rust", ...(webview ? ["Todo el WebView del proceso (ProxyController.setProxyOverride)"] : [])],
          noPasa: [noPasaUdp, ...(webview ? [] : ["Páginas externas del WebView"])],
          nota: webview ? null : "El «Android System WebView» de este teléfono no admite el proxy por aplicación (actualízalo).",
        },
      );
    }
    case "windows":
      return base(
        { puede: true, necesita: [NODO, PAGINA_VIVA], segundoPlano: "siempre", nota: "Mientras la app esté abierta (la bandeja la mantiene)." },
        {
          app: true,
          webview: !sinProxy && e.webviewProxy !== false,
          descargas: true,
          pasa: ["Datos de la app (Supabase y /api)", "Actualizador y descargas de Rust", ...(!sinProxy && e.webviewProxy !== false ? ["Páginas externas, imágenes e iframes (pasarela local de WebView2 en 127.0.0.1:47077)"] : [])],
          noPasa: [noPasaUdp, ...(!sinProxy && e.webviewProxy !== false ? [] : ["Páginas externas del webview"])],
          nota:
            !sinProxy && e.webviewProxy !== false
              ? "La pasarela se instala al arrancar. Si el equipo ya usa un proxy (Windows o variable de entorno), el webview sigue su camino y solo las descargas y los datos de la app salen por la malla."
              : "La pasarela no quedó instalada (proxy del sistema, variable de WebView2 ya con proxy o puerto 47077 ocupado).",
        },
      );
    case "linux":
      return base(
        { puede: true, necesita: [NODO, PAGINA_VIVA], segundoPlano: "siempre", nota: "Mientras la app esté abierta." },
        {
          app: true,
          webview: !sinProxy,
          descargas: true,
          pasa: ["Datos de la app (Supabase y /api)", "Actualizador y descargas de Rust", ...(!sinProxy ? ["Páginas externas, imágenes e iframes (WebKitNetworkProxySettings, en caliente)"] : [])],
          noPasa: [noPasaUdp],
          nota: sinProxy ? "El proxy de la puerta está apagado por STARSEED_SIN_PROXY_PUERTA." : null,
        },
      );
    case "ios": {
      const v = e.iosMayor ?? null;
      return base(
        { nota: "Planeado, sin build: iOS suspende la app en segundo plano y no hay nodejs-mobile compilado para iOS; podría compartir solo en primer plano." },
        {
          nota: v !== null && v >= 17 ? "Planeado: WKWebsiteDataStore.proxyConfigurations existe desde iOS 17 (misma API que macOS 14)." : "Planeado: hace falta iOS 17 para llevar el webview por la malla.",
          noPasa: ["Todo, hasta que haya build de iOS."],
        },
      );
    }
    default:
      return base({ nota: "Sistema sin soporte." }, { noPasa: ["Todo"] });
  }
}

/** Texto corto para la interfaz: lo que esta plataforma NO puede, o `null` si puede todo lo previsto. */
export function avisoPlataforma(c: CapacidadesPuerta): string | null {
  if (!c.compartir.puede && !c.usar.app) return c.compartir.nota ?? c.usar.nota;
  if (!c.usar.webview) return c.usar.nota;
  return null;
}
