/**
 * DIR1125F · censo de quién pide cuadros de animación y temporizadores rápidos.
 *
 * Por qué: el 25-11 en la Maggabox, con la pantalla casi quieta, el hilo principal seguía al 65 % y desde fuera no se puede
 * saber qué script lo ocupa (WebKitGTK sin herramientas de perfil). Esto hace que lo diga el propio aparato: cuenta las
 * llamadas a `requestAnimationFrame` y a los temporizadores de 50 ms o menos, apunta de dónde salen (1 de cada 16) y, si en
 * un minuto hubo un bucle de verdad (15 o más por segundo), deja unas líneas en el registro de enlaces (las que acaban en
 * enlaces.log). Solo cuenta: cada llamada pasa tal cual, con sus argumentos y su identificador.
 */
import { modoEfectivo } from "./device-tier";
import { fpsDelModo } from "./ritmo-cuadros";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RelojCenso {
  requestAnimationFrame: (cb: FrameRequestCallback) => number;
  setTimeout: (...a: any[]) => any;
  setInterval: (...a: any[]) => any;
  clearInterval: (id: any) => void;
}

export interface ContextoCenso {
  ruta: string;
  modo: string;
  tope: number;
  visible: boolean;
  foco: boolean;
}

export interface EntornoCenso {
  obj: RelojCenso;
  /** La pila en el punto de la llamada (`new Error().stack`). */
  pila: () => string;
  anotar: (linea: string) => void;
  contexto: () => ContextoCenso;
}

export const MUESTRA_CADA = 16;
export const VENTANA_MS = 60_000;
export const UMBRAL_POR_S = 15;
export const RAPIDO_MS = 50;
export const SITIOS_POR_INFORME = 3;
export const INFORMES_POR_HORA = 8;
const LINEA_MAX = 196; // el registro corta a 200

const MARCA = "__ssCensoCuadros";

/** De una pila (WebKit: `fn@url:l:c`; V8: `at fn (url:l:c)`) a «fn archivo.js:l:c < fn archivo.js:l:c», saltando los marcos del propio censo. Pura. */
export function sitioDePila(pila: string, saltar = 2): string {
  const lineas = String(pila || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lineas[0] && /^[A-Za-z]*Error\b/.test(lineas[0])) lineas.shift();
  const marcos: string[] = [];
  for (const l of lineas.slice(saltar)) {
    const sitio = /([^/\s(@]+\.m?js)(?:\?[^:\s)]*)?:(\d+):(\d+)/.exec(l);
    if (!sitio) continue;
    const fn = (/^at\s+(?:async\s+)?([^\s(]+)\s+\(/.exec(l) ?? /^([^@]*)@/.exec(l))?.[1] ?? "";
    marcos.push(`${fn.replace(/[^\w$.<>]/g, "").slice(0, 28)} ${sitio[1]}:${sitio[2]}:${sitio[3]}`.trim());
    if (marcos.length === 2) break;
  }
  return marcos.length ? marcos.join(" < ").slice(0, 150) : "?";
}

/** La ruta sin identificadores (un tramo largo o con pinta de id queda como «…»). Pura. */
export function rutaCorta(ruta: string): string {
  const tramos = String(ruta || "/").split("/").filter(Boolean).map((t) => (t.length > 24 || /[0-9a-f]{8,}/i.test(t) || /^\d+$/.test(t) ? "…" : t));
  return ("/" + tramos.join("/")).slice(0, 60);
}

const corta = (l: string) => l.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, LINEA_MAX);

/** Envuelve `requestAnimationFrame`, `setTimeout` y `setInterval` de `obj` para contarlos. Devuelve cómo dejarlo como estaba. */
export function instalarCenso(e: EntornoCenso): () => void {
  const obj = e.obj as RelojCenso & Record<string, unknown>;
  if (obj[MARCA]) return () => {};
  const raf0 = obj.requestAnimationFrame;
  const timeout0 = obj.setTimeout;
  const intervalo0 = obj.setInterval;
  const sitios = new Map<string, number>();
  let nRaf = 0;
  let nRapidos = 0;
  let nLlamadas = 0;
  let informes = 0;
  let ventanas = 0;

  const apuntar = (clase: string, peso: number, sitio?: string) => {
    try {
      const k = `${clase} ${sitio ?? sitioDePila(e.pila(), 3)}`;
      sitios.set(k, (sitios.get(k) ?? 0) + peso);
    } catch {
      /* el censo nunca rompe a quien llama */
    }
  };
  // Ojo con los marcos: `apuntar` se llama DIRECTAMENTE desde cada envoltorio, así la pila es siempre
  // [pila, apuntar, envoltorio, quien llamó…] y `sitioDePila(…, 3)` cae en quien llamó.
  const raf1 = function (this: unknown, cb: FrameRequestCallback): number {
    nRaf += 1;
    nLlamadas += 1;
    if (nLlamadas % MUESTRA_CADA === 0) apuntar("raf", MUESTRA_CADA);
    return raf0.call(obj, cb);
  };
  const timeout1 = function (this: unknown, ...a: any[]): any {
    const ms = typeof a[1] === "number" ? a[1] : 0;
    if (ms <= RAPIDO_MS) {
      nRapidos += 1;
      nLlamadas += 1;
      if (nLlamadas % MUESTRA_CADA === 0) apuntar("t", MUESTRA_CADA);
    }
    return timeout0.apply(obj, a);
  };
  const intervalo1 = function (this: unknown, ...a: any[]): any {
    const ms = typeof a[1] === "number" ? a[1] : 0;
    const f = a[0];
    if (ms > RAPIDO_MS || typeof f !== "function") return intervalo0.apply(obj, a);
    let sitio = "?";
    try {
      sitio = sitioDePila(e.pila(), 2);
    } catch {
      /* */
    }
    a[0] = function (this: unknown, ...b: any[]) {
      nRapidos += 1;
      apuntar(`iv${ms}`, 1, sitio);
      return f.apply(this, b);
    };
    return intervalo0.apply(obj, a);
  };

  const informar = () => {
    const s = VENTANA_MS / 1000;
    const raf = nRaf / s;
    const rapidos = nRapidos / s;
    const top = [...sitios].sort((x, y) => y[1] - x[1]).slice(0, SITIOS_POR_INFORME);
    nRaf = 0;
    nRapidos = 0;
    sitios.clear();
    ventanas += 1;
    if (ventanas > 60) {
      ventanas = 1;
      informes = 0;
    }
    if (raf < UMBRAL_POR_S && rapidos < UMBRAL_POR_S) return;
    if (informes >= INFORMES_POR_HORA) return;
    informes += 1;
    try {
      const c = e.contexto();
      e.anotar(corta(`censo-cuadros ruta=${rutaCorta(c.ruta)} modo=${c.modo} tope=${c.tope} visible=${c.visible ? "si" : "no"} foco=${c.foco ? "si" : "no"} raf=${raf.toFixed(1)}/s rapidos=${rapidos.toFixed(1)}/s`));
      top.forEach(([k, n], i) => e.anotar(corta(`censo-sitio ${i + 1}/${top.length} ${(n / s).toFixed(1)}/s ${k}`)));
    } catch {
      /* sin registro: nada */
    }
  };

  obj.requestAnimationFrame = raf1 as RelojCenso["requestAnimationFrame"];
  obj.setTimeout = timeout1;
  obj.setInterval = intervalo1;
  obj[MARCA] = true;
  const idInforme = intervalo0.call(obj, informar, VENTANA_MS);

  return () => {
    try {
      obj.clearInterval(idInforme);
    } catch {
      /* */
    }
    // Solo se deshace lo que sigue siendo nuestro (otro pudo envolver encima).
    if (obj.requestAnimationFrame === raf1) obj.requestAnimationFrame = raf0;
    if (obj.setTimeout === timeout1) obj.setTimeout = timeout0;
    if (obj.setInterval === intervalo1) obj.setInterval = intervalo0;
    obj[MARCA] = false;
  };
}

/** El censo de verdad, sobre `window`. En el servidor no hace nada. */
export function iniciarCensoCuadros(): () => void {
  if (typeof window === "undefined") return () => {};
  return instalarCenso({
    obj: window as unknown as RelojCenso,
    pila: () => new Error().stack ?? "",
    anotar: (linea) => {
      void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("web-version", null, linea)).catch(() => { /* */ });
    },
    contexto: () => {
      let modo = "?";
      try {
        modo = modoEfectivo();
      } catch {
        /* */
      }
      return {
        ruta: window.location.pathname,
        modo,
        tope: fpsDelModo(),
        visible: document.visibilityState === "visible",
        foco: typeof document.hasFocus === "function" ? document.hasFocus() : false,
      };
    },
  });
}
