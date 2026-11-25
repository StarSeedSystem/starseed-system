/**
 * DIR1125H · censo de TIEMPO: quién ocupa el hilo principal de la app.
 *
 * Por qué: el censo de cuadros (DIR1125F) cuenta quién PIDE cuadros, y con eso salió el orbe. Pero el 25-11, con el orbe ya
 * arreglado (DIR1125G), la app de la Maggabox seguía al 53–58 % por dos gastos que no piden cuadros: un parón de casi un
 * segundo cada 15 s y un latido 60 veces por segundo. Desde fuera se ve cuánto dura cada ráfaga, no quién la hace.
 *
 * Esto hace que lo diga el propio aparato. Mide cuánto tarda cada cosa que el navegador llama (cuadros, temporizadores de
 * cualquier periodo y eventos nativos), vigila los parones largos y apunta qué corrió justo antes, y lista las animaciones
 * que siguen vivas. Una vez por minuto deja unas líneas en el registro de enlaces (las que acaban en enlaces.log).
 * Solo mide: cada cosa se ejecuta igual que sin él (mismo `this`, mismos argumentos, mismo resultado, mismas excepciones).
 *
 * Límites, para leerlo bien: «medido» es el tiempo DENTRO de esas llamadas; no incluye lo que el navegador pinta después ni
 * el trabajo que React deja para luego. Por eso existen los parones: «tras X» quiere decir que X fue lo último que corrió
 * antes de que el hilo se quedara ocupado (una pista, no una prueba); «en X», que el parón fue la propia llamada.
 */
import { rutaCorta, sitioDePila } from "./censo-cuadros";
import { modoEfectivo } from "./device-tier";
import { ponerMedidorHilo } from "./medidor-hilo";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RelojTiempo {
  requestAnimationFrame: (cb: FrameRequestCallback) => number;
  setTimeout: (...a: any[]) => any;
  setInterval: (...a: any[]) => any;
  clearInterval: (id: any) => void;
}

export interface EntornoTiempo {
  obj: RelojTiempo;
  /** Reloj monótono en milisegundos (`performance.now()`). */
  ahora: () => number;
  /** La pila en el punto de la llamada (`new Error().stack`). */
  pila: () => string;
  /** ¿La página se ve? Oculta, el navegador retrasa los temporizadores a propósito y eso no es un parón. */
  visible: () => boolean;
  anotar: (linea: string) => void;
  contexto: () => { ruta: string; modo: string };
  /** Una descripción corta por cada animación que corre ahora mismo («nombre @ etiqueta.clase»). */
  animaciones?: () => string[];
}

export interface CensoTiempo {
  parar: () => void;
  /** Ejecuta `f` y apunta lo que tardó a nombre de `clave` (para lo que no llega por temporizador ni por cuadro). */
  medir: <T>(clave: string, f: () => T) => T;
  /** Deja dicho que `clave` acaba de pasar, sin medir nada (para saber «tras qué» vino un parón). */
  marcar: (clave: string) => void;
}

export const VENTANA_TIEMPO_MS = 60_000;
/** Cada cuánto mira el vigía. Más de 50 ms a propósito: así nadie lo cuenta como temporizador rápido. */
export const VIGIA_MS = 60;
/** Retraso del vigía a partir del cual se apunta un parón. */
export const PARON_MS = 70;
/** Las primeras ventanas informan siempre, haya o no trabajo: así se sabe que el censo está puesto. */
export const INFORMES_SEGUROS = 2;
export const INFORMES_HORA = 8;
export const MEDIDO_MINIMO_MS_S = 40;
export const QUIENES = 4;
export const PARONES = 3;
export const ANIMACIONES = 3;
const PILAS_POR_VENTANA = 3000;
const RECIENTES = 32;
const LINEA_MAX = 196; // el registro corta a 200
const MARCA = "__ssCensoTiempo";

/** El tramo de espera de un `setTimeout`, para que mil esperas distintas no sean mil nombres. Pura. */
export function tramoDeEspera(ms: number): string {
  if (!(ms > 16)) return "t16";
  if (ms <= 50) return "t50";
  if (ms <= 250) return "t250";
  if (ms <= 1000) return "t1s";
  if (ms <= 5000) return "t5s";
  return "t>5s";
}

const corta = (l: string) => l.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, LINEA_MAX);

interface Cuenta {
  n: number;
  ms: number;
  max: number;
}
interface Reciente {
  clave: string;
  ini: number;
  dur: number;
}

function sumar(m: Map<string, Cuenta>, clave: string, ms: number): void {
  const c = m.get(clave);
  if (c) {
    c.n += 1;
    c.ms += ms;
    if (ms > c.max) c.max = ms;
  } else m.set(clave, { n: 1, ms, max: ms });
}

/** Envuelve `requestAnimationFrame`, `setTimeout` y `setInterval` de `obj` para medir lo que tarda lo que llaman. */
export function instalarCensoTiempo(e: EntornoTiempo): CensoTiempo {
  const obj = e.obj as RelojTiempo & Record<string, unknown>;
  if (obj[MARCA]) return { parar: () => {}, medir: (_clave, f) => f(), marcar: () => {} };
  const raf0 = obj.requestAnimationFrame;
  const timeout0 = obj.setTimeout;
  const intervalo0 = obj.setInterval;
  let cuentas = new Map<string, Cuenta>();
  let parones = new Map<string, Cuenta>();
  const recientes: Reciente[] = [];
  const sitios = new WeakMap<object, string>();
  let pilas = 0;
  let pedidosRaf = 0;
  let ventanas = 0;
  let informes = 0;
  let hondura = 0;
  let previsto = 0;

  const reloj = (): number => {
    try {
      const t = e.ahora();
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  };
  const recordar = (clave: string, ini: number, dur: number) => {
    recientes.push({ clave, ini, dur });
    if (recientes.length > RECIENTES) recientes.shift();
  };
  const medir = <T>(clave: string, f: () => T): T => {
    // Anidado (un evento nativo dentro de un temporizador): el tiempo es de quien está fuera.
    if (hondura > 0) return f();
    hondura += 1;
    const ini = reloj();
    try {
      return f();
    } finally {
      hondura -= 1;
      const dur = Math.max(0, reloj() - ini);
      sumar(cuentas, clave, dur);
      recordar(clave, ini, dur);
    }
  };
  const marcar = (clave: string) => {
    recordar(String(clave).slice(0, 60), reloj(), 0);
  };
  const claveDe = (clase: string, f: unknown): string => {
    try {
      const fn = typeof f === "function" ? (f as object) : null;
      const ya = fn ? sitios.get(fn) : undefined;
      if (ya !== undefined) return `${clase} ${ya}`;
      if (pilas >= PILAS_POR_VENTANA) return `${clase} (sin sitio)`;
      pilas += 1;
      const s = sitioDePila(e.pila(), 3);
      if (fn) sitios.set(fn, s);
      return `${clase} ${s}`;
    } catch {
      return `${clase} ?`;
    }
  };
  // Ojo con los marcos: `claveDe` se llama DIRECTAMENTE desde cada envoltorio, así la pila es siempre
  // [pila, claveDe, envoltorio, quien llamó…] y `sitioDePila(…, 3)` cae en quien llamó.
  const raf1 = function (this: unknown, cb: FrameRequestCallback): number {
    pedidosRaf += 1;
    if (typeof cb !== "function") return raf0.call(obj, cb);
    const clave = claveDe("raf", cb);
    return raf0.call(obj, function (this: unknown, t: number) {
      return medir(clave, () => cb.call(this, t));
    } as FrameRequestCallback);
  };
  const timeout1 = function (this: unknown, ...a: any[]): any {
    const f = a[0];
    if (typeof f !== "function") return timeout0.apply(obj, a);
    const clave = claveDe(tramoDeEspera(typeof a[1] === "number" ? a[1] : 0), f);
    a[0] = function (this: unknown, ...b: any[]) {
      return medir(clave, () => f.apply(this, b));
    };
    return timeout0.apply(obj, a);
  };
  const intervalo1 = function (this: unknown, ...a: any[]): any {
    const f = a[0];
    if (typeof f !== "function") return intervalo0.apply(obj, a);
    const clave = claveDe(`iv${typeof a[1] === "number" ? Math.round(a[1]) : 0}`, f);
    a[0] = function (this: unknown, ...b: any[]) {
      return medir(clave, () => f.apply(this, b));
    };
    return intervalo0.apply(obj, a);
  };

  // El vigía: un reloj propio cada VIGIA_MS. Si llega tarde, el hilo estuvo ocupado ese rato.
  const vigia = () => {
    try {
      const t = reloj();
      const debia = previsto;
      let seVe = true;
      try {
        seVe = e.visible();
      } catch {
        seVe = true;
      }
      if (!seVe) {
        previsto = 0;
        return;
      }
      previsto = t + VIGIA_MS;
      if (!(debia > 0)) return;
      const tarde = t - debia;
      if (tarde < PARON_MS) return;
      // Lo último que EMPEZÓ antes de la hora a la que el vigía debía haber mirado es quien ocupó el hilo o quien lo provocó.
      let quien: Reciente | null = null;
      for (const r of recientes) if (r.ini <= debia + 2 && (!quien || r.ini >= quien.ini)) quien = r;
      let etiqueta = "?";
      if (quien && debia - quien.ini <= VIGIA_MS + 20) etiqueta = `${quien.dur >= tarde * 0.6 ? "en" : "tras"} ${quien.clave}`;
      else for (const r of recientes) if (r.ini > debia && r.ini <= t && r.dur >= tarde * 0.6) etiqueta = `en ${r.clave}`;
      sumar(parones, etiqueta, tarde);
    } catch {
      /* el censo nunca rompe nada */
    }
  };

  const informar = () => {
    try {
      const s = VENTANA_TIEMPO_MS / 1000;
      const c0 = cuentas;
      const p0 = parones;
      const raf = pedidosRaf / s;
      cuentas = new Map();
      parones = new Map();
      pedidosRaf = 0;
      pilas = 0;
      ventanas += 1;
      if (ventanas % 60 === 0) informes = 0;
      let anim: string[] = [];
      try {
        anim = e.animaciones ? e.animaciones() : [];
      } catch {
        anim = [];
      }
      let medido = 0;
      for (const c of c0.values()) medido += c.ms;
      medido /= s;
      let nPar = 0;
      let sumaPar = 0;
      let maxPar = 0;
      for (const c of p0.values()) {
        nPar += c.n;
        sumaPar += c.ms;
        if (c.max > maxPar) maxPar = c.max;
      }
      if (ventanas > INFORMES_SEGUROS) {
        if (medido < MEDIDO_MINIMO_MS_S && nPar === 0 && anim.length === 0) return;
        if (informes >= INFORMES_HORA) return;
      }
      informes += 1;
      const c = e.contexto();
      e.anotar(corta(`censo-tiempo ruta=${rutaCorta(c.ruta)} modo=${c.modo} medido=${medido.toFixed(0)}ms/s raf=${raf.toFixed(1)}/s parones=${nPar} (max=${maxPar.toFixed(0)}ms suma=${sumaPar.toFixed(0)}ms) anim=${anim.length}`));
      const top = [...c0].sort((x, y) => y[1].ms - x[1].ms).slice(0, QUIENES);
      top.forEach(([k, v], i) => e.anotar(corta(`censo-quien ${i + 1}/${top.length} ${(v.ms / s).toFixed(1)}ms/s n=${(v.n / s).toFixed(1)}/s max=${v.max.toFixed(0)}ms ${k}`)));
      const tp = [...p0].sort((x, y) => y[1].ms - x[1].ms).slice(0, PARONES);
      tp.forEach(([k, v], i) => e.anotar(corta(`censo-paron ${i + 1}/${tp.length} ${v.n}x suma=${v.ms.toFixed(0)}ms max=${v.max.toFixed(0)}ms ${k}`)));
      const grupos = new Map<string, number>();
      for (const a of anim) grupos.set(a, (grupos.get(a) ?? 0) + 1);
      const ta = [...grupos].sort((x, y) => y[1] - x[1]).slice(0, ANIMACIONES);
      ta.forEach(([k, n], i) => e.anotar(corta(`censo-anim ${i + 1}/${ta.length} ${n}x ${k}`)));
    } catch {
      /* sin registro: nada */
    }
  };

  obj.requestAnimationFrame = raf1 as RelojTiempo["requestAnimationFrame"];
  obj.setTimeout = timeout1;
  obj.setInterval = intervalo1;
  obj[MARCA] = true;
  previsto = reloj() + VIGIA_MS;
  // Los dos relojes propios van por el `setInterval` de antes: el censo no se mide a sí mismo.
  const idVigia = intervalo0.call(obj, vigia, VIGIA_MS);
  const idInforme = intervalo0.call(obj, informar, VENTANA_TIEMPO_MS);

  return {
    parar: () => {
      try {
        obj.clearInterval(idVigia);
        obj.clearInterval(idInforme);
      } catch {
        /* */
      }
      // Solo se deshace lo que sigue siendo nuestro (otro pudo envolver encima).
      if (obj.requestAnimationFrame === raf1) obj.requestAnimationFrame = raf0;
      if (obj.setTimeout === timeout1) obj.setTimeout = timeout0;
      if (obj.setInterval === intervalo1) obj.setInterval = intervalo0;
      obj[MARCA] = false;
    },
    medir: (clave, f) => medir(String(clave).slice(0, 60), f),
    marcar,
  };
}

/** Las animaciones que corren ahora mismo en la página, en corto: solo nombres de animación, etiquetas y clases (nada de contenido). */
export function animacionesVivas(doc: Document): string[] {
  const out: string[] = [];
  const quien = (el: Element | null): string => {
    if (!el) return "?";
    const c = (el as unknown as { className?: unknown }).className;
    const texto = typeof c === "string" ? c : c && typeof (c as { baseVal?: unknown }).baseVal === "string" ? (c as { baseVal: string }).baseVal : "";
    return `${el.tagName.toLowerCase()}.${texto.split(/\s+/).filter(Boolean).slice(0, 3).join(".").slice(0, 70)}`;
  };
  try {
    for (const a of doc.getAnimations()) {
      if (a.playState !== "running") continue;
      const x = a as Animation & { animationName?: string; transitionProperty?: string };
      const nombre = x.animationName ? `anim:${x.animationName}` : x.transitionProperty ? `trans:${x.transitionProperty}` : "waapi";
      const objetivo = (a.effect as KeyframeEffect | null)?.target ?? null;
      out.push(`${nombre} @ ${quien(objetivo)}`);
      if (out.length >= 200) break;
    }
  } catch {
    /* sin getAnimations */
  }
  try {
    doc.querySelectorAll("animate,animateTransform,animateMotion").forEach((el) => {
      if (out.length < 260) out.push(`smil:${el.tagName} @ ${quien(el.closest("svg"))}`);
    });
    doc.querySelectorAll("video").forEach((v) => {
      if (!(v as HTMLVideoElement).paused && out.length < 280) out.push(`video @ ${quien(v)}`);
    });
  } catch {
    /* */
  }
  return out;
}

/** El censo de verdad, sobre `window`. En el servidor no hace nada. Devuelve cómo quitarlo. */
export function iniciarCensoTiempo(): () => void {
  if (typeof window === "undefined") return () => {};
  const censo = instalarCensoTiempo({
    obj: window as unknown as RelojTiempo,
    ahora: () => performance.now(),
    pila: () => new Error().stack ?? "",
    visible: () => document.visibilityState === "visible",
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
      return { ruta: window.location.pathname, modo };
    },
    animaciones: () => animacionesVivas(document),
  });
  ponerMedidorHilo({ medir: censo.medir, marcar: censo.marcar });
  return () => {
    ponerMedidorHilo(null);
    censo.parar();
  };
}
