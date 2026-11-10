/**
 * LLA1110C · ¿Se VE de verdad el vídeo de la llamada? Telemetría para el registro del enlace.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * prueba.33: la Mac recibió, decodificó y pintó 289 cuadros y Alex vio negro. Los contadores decían «pintados» pero
 * nadie miraba si ese canvas (o ese <video>) estaba en el documento, con tamaño, sin tapar y con imagen. Esto lo mira
 * cada pocos segundos y deja UNA línea por mosaico, para que la siguiente ronda en los aparatos se lea sin adivinar:
 *   visibilidad lienzo=remoto doc=si caja=438x246 display=block vis=visible op=1 arriba=si brillo=87 lienzo=160x120
 *   visibilidad video=local doc=si caja=56x80 … listo=4 tam=640x480 pausado=no pistas=v:live/on/sonando brillo=92
 * Solo etiquetas técnicas: nada de la imagen ni de la persona. Nunca lanza.
 */

export interface DatosVisibilidad {
  conectado: boolean;
  ancho: number;
  alto: number;
  display: string;
  visibility: string;
  opacidad: number;
  /** El elemento (o algo suyo) es lo de más arriba en su propio centro. */
  arriba: boolean;
  /** Lo que lo tapa si no está arriba («div.absolute.inset-0»). */
  tapa: string | null;
  /** Brillo medio 0..255 de una muestra pequeña (null si no se pudo leer). */
  brillo: number | null;
}

export interface DatosVideo {
  listo: number;
  ancho: number;
  alto: number;
  pausado: boolean;
  /** Pistas de vídeo de su `srcObject`: «v:live/on/sonando», «v:live/on/muda»… */
  pistas: string[];
}

/** Descripción corta de un elemento para el registro (etiqueta, testid o dos clases). */
export function describirElemento(el: Element | null): string {
  if (!el) return "nada";
  const tag = el.tagName.toLowerCase();
  const tid = el.getAttribute("data-testid");
  if (tid) return `${tag}[${tid}]`.slice(0, 40);
  const aria = el.getAttribute("aria-label");
  if (aria) return `${tag}[${aria}]`.replace(/[^\p{L}\p{N}\[\]. _-]/gu, "").slice(0, 40);
  const clases = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 2);
  return `${tag}${clases.length ? `.${clases.join(".")}` : ""}`.slice(0, 40);
}

/** Línea del registro (sin el prefijo de la llamada). Pura: recibe los datos ya medidos. */
export function lineaVisibilidad(clase: "lienzo" | "video", nombre: string, d: DatosVisibilidad, extra: { lienzo?: { w: number; h: number }; video?: DatosVideo } = {}): string {
  const partes = [
    `visibilidad ${clase}=${nombre}`,
    `doc=${d.conectado ? "si" : "no"}`,
    `caja=${Math.round(d.ancho)}x${Math.round(d.alto)}`,
    `display=${d.display}`,
    `vis=${d.visibility}`,
    `op=${Math.round(d.opacidad * 100) / 100}`,
    `arriba=${d.arriba ? "si" : `no tapa=${d.tapa ?? "?"}`}`,
    `brillo=${d.brillo ?? "?"}`,
  ];
  if (extra.lienzo) partes.push(`lienzo=${extra.lienzo.w}x${extra.lienzo.h}`);
  if (extra.video) {
    const v = extra.video;
    partes.push(`listo=${v.listo}`, `tam=${v.ancho}x${v.alto}`, `pausado=${v.pausado ? "si" : "no"}`, `pistas=${v.pistas.join("+") || "ninguna"}`);
  }
  return partes.join(" ").slice(0, 195);
}

/** ¿Por qué ese mosaico no se vería? null si todo cuadra (para el aviso en pantalla y las pruebas). */
export function motivoInvisible(d: DatosVisibilidad, video?: DatosVideo): string | null {
  if (!d.conectado) return "no está en el documento";
  if (d.ancho < 2 || d.alto < 2) return "no tiene tamaño";
  if (d.display === "none" || d.visibility === "hidden" || d.opacidad < 0.05) return "está oculto";
  if (!d.arriba) return `lo tapa ${d.tapa ?? "otro elemento"}`;
  if (video) {
    if (!video.pistas.length) return "el vídeo no tiene pista";
    if (video.pistas.every((p) => !p.includes("/sonando"))) return "su pista de vídeo no trae imagen (muda o terminada)";
    if (video.listo < 2) return "el vídeo aún no tiene imagen";
    if (video.pausado) return "el vídeo está en pausa";
  }
  if (d.brillo !== null && d.brillo < 4) return "se ve negro";
  return null;
}

/* ───────────────────────────── Medida en el navegador ───────────────────────────── */

let muestra: HTMLCanvasElement | null = null;

/** Brillo medio de una muestra de 16×12 del elemento (canvas o <video>). */
export function brilloDe(el: HTMLCanvasElement | HTMLVideoElement): number | null {
  try {
    if (typeof document === "undefined") return null;
    if (el instanceof HTMLVideoElement && (el.readyState < 2 || !el.videoWidth)) return null;
    if (el instanceof HTMLCanvasElement && (!el.width || !el.height)) return null;
    muestra ??= document.createElement("canvas");
    muestra.width = 16;
    muestra.height = 12;
    const ctx = muestra.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, 16, 12);
    const d = ctx.getImageData(0, 0, 16, 12).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return Math.round(s / (d.length / 4));
  } catch {
    return null;
  }
}

export function medirVisibilidad(el: HTMLElement): DatosVisibilidad {
  const conectado = el.isConnected;
  let r = { width: 0, height: 0, left: 0, top: 0 };
  let cs: { display: string; visibility: string; opacity: string } = { display: "?", visibility: "?", opacity: "1" };
  try {
    r = el.getBoundingClientRect();
    cs = getComputedStyle(el);
  } catch {
    /* noop */
  }
  // La opacidad efectiva: la del elemento por la de sus padres.
  let opacidad = 1;
  try {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) opacidad *= Number(getComputedStyle(n).opacity || "1");
  } catch {
    /* noop */
  }
  let arriba = false;
  let tapa: string | null = null;
  try {
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    arriba = !!top && (top === el || el.contains(top));
    if (!arriba) tapa = describirElemento(top);
  } catch {
    /* noop */
  }
  const brillo = el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement ? brilloDe(el) : null;
  return { conectado, ancho: r.width, alto: r.height, display: cs.display, visibility: cs.visibility, opacidad, arriba, tapa, brillo };
}

export function datosVideo(v: HTMLVideoElement): DatosVideo {
  const src = v.srcObject as MediaStream | null;
  let pistas: string[] = [];
  try {
    pistas = (src?.getVideoTracks?.() ?? []).map((t) => `v:${t.readyState}/${t.enabled ? "on" : "off"}/${t.muted ? "muda" : "sonando"}`);
  } catch {
    pistas = [];
  }
  return { listo: v.readyState, ancho: v.videoWidth, alto: v.videoHeight, pausado: v.paused, pistas };
}

/** Las líneas de ahora de todos los mosaicos con imagen dentro de `raiz`. */
export function lineasVisibilidad(raiz: ParentNode): string[] {
  const out: string[] = [];
  try {
    raiz.querySelectorAll<HTMLCanvasElement>("[data-lienzo-ligero] canvas").forEach((c, i) => {
      out.push(lineaVisibilidad("lienzo", `remoto${i ? i + 1 : ""}`, medirVisibilidad(c), { lienzo: { w: c.width, h: c.height } }));
    });
    raiz.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
      const nombre = v.hasAttribute("data-remoto") ? "remoto" : v.hasAttribute("data-local") ? "local" : null;
      if (!nombre) return;
      out.push(lineaVisibilidad("video", nombre, medirVisibilidad(v), { video: datosVideo(v) }));
    });
  } catch {
    /* noop */
  }
  return out;
}

/** Cada `cadaMs` anota las líneas de los mosaicos (mientras haya alguno). Devuelve cómo parar. */
export function vigilarVisibilidad(raiz: () => ParentNode | null, anotar: (linea: string) => void, cadaMs = 5000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const id = window.setInterval(() => {
    const r = raiz();
    if (!r) return;
    for (const l of lineasVisibilidad(r)) anotar(l);
  }, cadaMs);
  return () => window.clearInterval(id);
}
