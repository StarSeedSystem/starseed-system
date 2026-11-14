/**
 * LLA1114B · capacidades — qué sabe hacer el código de llamadas de ESTE aparato, qué dice el otro y qué se usa.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Dos neuronas en una llamada corren a menudo builds distintas (la app nativa carga el código de la web publicada y cada
 * aparato toma la nueva una o dos aperturas después). Para que la versión no importe:
 *  · cada lado ANUNCIA lo que sabe hacer (y la build que corre, `web=<compilación>/<sha>`) en el saludo de la voz por
 *    datos (`voz.c` «hola», campos `cap` y `web`), al empezar cada sesión de voz (cada llamada y cada cambio de enlace;
 *    una build nueva es una página nueva y por tanto una sesión nueva);
 *  · un lado que no anuncia nada es la BASE: el comportamiento de antes de LLA1113C;
 *  · lo que necesita la COOPERACIÓN del otro (que el otro entienda un mensaje o un campo nuevo, o responda distinto) solo
 *    se usa si los DOS lo anunciaron (`puedoUsar`); lo que es solo de un lado (cómo reparte su enlace, cómo reintenta)
 *    se usa siempre y se anuncia para que el registro diga qué hace cada uno;
 *  · una línea por sesión en el registro de enlaces dice lo anunciado por cada lado y lo acordado (`lineaCapacidades`).
 *
 * Por qué así y no de otra forma: el saludo de la voz ya lleva un campo nuevo que el aparato anterior ignora (`fmt`, VOZ1111J)
 * y `leerControl` de TODAS las versiones desde LLA1108E rehace el mensaje solo con los campos que conoce: un campo de más no
 * molesta a nadie. Límite: un `voz.c` de más de 600 caracteres lo tira cualquier versión (`leerControl`), así que el anuncio
 * se recorta (`MAX_CAPACIDADES`, `MAX_WEB`) y una prueba comprueba que el saludo más largo cabe.
 *
 * REGLA PARA AÑADIR UNA CAPACIDAD (o cambiar algo que un aparato con la build de antes no entiende):
 *  1. Una entrada nueva en `CAPACIDADES` con un id corto (`[a-z0-9-]`, ≤ 24) que nunca se reutiliza, el encargo que la
 *     trae y `coopera: true` si necesita que el otro la entienda.
 *  2. Si coopera, el código nuevo la usa SOLO tras `puedoUsar(acuerdo, id)`; sin acuerdo, lo de antes. Nunca se quita una
 *     capacidad de la lista mientras quede un aparato que pueda anunciarla.
 *  3. La prueba «código nuevo contra el último publicado» (`pruebas-reales/compat-versiones/`) tiene que pasar.
 * Puro salvo `anuncioPropio` (lee la build que corre). Nunca lanza.
 */
import { etiquetaBuild } from "@/lib/pwa/build-corriendo";

export interface Capacidad {
  /** Id que viaja en el saludo. */
  id: string;
  /** Encargo que la trajo. */
  desde: string;
  /** ¿Necesita que el otro la entienda? Solo entonces depende del acuerdo. */
  coopera: boolean;
  /** Qué hace (para quien lee el registro y esta lista). */
  que: string;
}

export const CAPACIDADES: readonly Capacidad[] = [
  {
    id: "ciclo-reparto",
    desde: "LLA1113C",
    coopera: false,
    que: "el reparto del vídeo alarga su ciclo con acuse largo (R + 60 ms): con el acuse de la tableta su vídeo no se queda en pausa por «suelo»",
  },
  {
    id: "colgar-reintento",
    desde: "LLA1113C",
    coopera: false,
    que: "«colgar» se reintenta aunque el canal ya se haya soltado (un «colgar» repetido lo ignora cualquier versión)",
  },
  {
    id: "anuncio",
    desde: "LLA1114B",
    coopera: false,
    que: "anuncia sus capacidades y su build en el saludo de la voz por datos",
  },
];

/** Las que anuncia este código. */
export const CAPACIDADES_PROPIAS: readonly string[] = CAPACIDADES.map((c) => c.id);

export const MAX_CAPACIDADES = 12;
export const MAX_WEB = 64;
const ID = /^[a-z0-9-]{1,24}$/;
const WEB = /^[\w./-]{1,64}$/;

/** Lo que llega en `cap`: lista de ids saneada, o null si el otro no anunció nada (la base). Pura. */
export function sanearCapacidades(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const v of x) if (typeof v === "string" && ID.test(v) && !out.includes(v) && out.length < MAX_CAPACIDADES) out.push(v);
  return out;
}

/** Lo que llega en `web`: la build del otro saneada, o null. Pura. */
export function sanearWeb(x: unknown): string | null {
  return typeof x === "string" && WEB.test(x) ? x.slice(0, MAX_WEB) : null;
}

/** Lo que este lado pone en su saludo. */
export function anuncioPropio(web?: string): { cap: string[]; web?: string } {
  let w: string | null = null;
  try {
    w = sanearWeb(web ?? etiquetaBuild());
  } catch {
    /* sin la build a mano (un banco que no la empaqueta): se anuncia sin `web`, nunca se rompe el saludo */
  }
  return { cap: CAPACIDADES_PROPIAS.slice(0, MAX_CAPACIDADES), ...(w ? { web: w } : {}) };
}

export interface AcuerdoCapacidades {
  mias: string[];
  /** null: el otro no anunció nada (código anterior a LLA1114B): se le trata como la base. */
  suyas: string[] | null;
  /** Las que tenemos los dos (solo ids conocidos aquí). */
  comunes: string[];
  miWeb: string | null;
  webOtro: string | null;
}

/** Lo acordado con lo que anunció el otro. Pura. */
export function acordar(suyas: string[] | null, webOtro: string | null, mias: readonly string[] = CAPACIDADES_PROPIAS, miWeb: string | null = null): AcuerdoCapacidades {
  const conocidas = new Set(CAPACIDADES.map((c) => c.id));
  const comunes = suyas ? mias.filter((m) => suyas.includes(m) && conocidas.has(m)) : [];
  return { mias: [...mias], suyas: suyas ? [...suyas] : null, comunes, miWeb, webOtro };
}

/**
 * ¿Se puede usar esa capacidad con este otro? Las que cooperan, solo si las anunciaron los dos; las de un solo lado, si
 * este código la tiene. Sin acuerdo aún (no llegó el saludo), solo las de un solo lado. Pura.
 */
export function puedoUsar(acuerdo: AcuerdoCapacidades | null, id: string, lista: readonly Capacidad[] = CAPACIDADES): boolean {
  const c = lista.find((x) => x.id === id);
  if (!c) return false;
  if (!c.coopera) return acuerdo ? acuerdo.mias.includes(id) : lista.some((x) => x.id === id);
  return !!acuerdo && acuerdo.comunes.includes(id);
}

/**
 * La línea del registro (una por sesión, y otra si el anuncio del otro cambia). Corta: el registro corta a 200 caracteres.
 * `otro=-`: el otro no anunció (código anterior a LLA1114B: puede ser también anterior a LLA1113C, y entonces su vídeo
 * puede quedarse en pausa por «suelo» con acuse largo: ese fallo está en SU código, no en la mezcla). `otro=`: lo mismo que
 * yo. `otro-sin=…`: lo que tengo yo y el otro, que sí anuncia, no. Pura.
 */
export function lineaCapacidades(a: AcuerdoCapacidades): string {
  const igual = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));
  const l = (x: string[]) => (x.length ? x.join(",") : "ninguna");
  // Corta: la lista del otro, «=» si es la mía; lo común, «todas» si es todo lo mío.
  const otro = a.suyas === null ? "-" : igual(a.suyas, a.mias) ? "=" : l(a.suyas);
  const comunes = a.suyas !== null && igual(a.comunes, a.mias) ? "todas" : l(a.comunes);
  const falta = a.suyas === null ? [] : a.mias.filter((m) => !a.suyas!.includes(m));
  return (
    `capacidades mias=${l(a.mias)} web=${a.miWeb ?? "?"} otro=${otro} web-otro=${a.webOtro ?? "?"} comunes=${comunes}` +
    (a.suyas === null ? " (otro sin anuncio: base)" : "") +
    (falta.length ? ` otro-sin=${falta.join(",")}` : "")
  );
}
