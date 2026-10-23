// Fuentes locales para diagramas: cambia los <link> a fonts.googleapis.com por
// @font-face con data URL de las fuentes que el OS ya sirve (inyectadas), o por
// la pila de sistema equivalente si no la tiene; nunca deja una petición a
// terceros. PURO: cadena → cadena, sin red ni disco. Contrato: architecture/
// diagramas.md §3 · modo «system» de diagram-design (v. vendor/habilidades).
/** Una cara (archivo) de una fuente servida por el OS (url siempre data:). */
export interface CaraFuente {
  url: string;
  formato: "woff2" | "woff" | "truetype";
  /** Peso o rango que cubre el archivo: «400», «400 700», «100 900»… */
  peso: string;
  estilo?: "normal" | "italic";
}
/** Fuente servida por el OS, tal y como la inyecta quien muestra el diagrama. */
export interface FuenteLocal {
  /** Familia tal y como se pide en font-family: «Geist», «Inter»… */
  familia: string;
  caras: CaraFuente[];
}
/** Familias que quedaron servidas por el OS y las que quedaron por sistema. */
export interface ResultadoSustitucion {
  html: string;
  servidas: string[];
  deSistema: string[];
}

const REMOTAS = /(fonts\.googleapis\.com|fonts\.gstatic\.com)/;

/** Familias pedidas por un <link> o @import a Google Fonts (puntos css2 y css1). */
export function extraerFamiliasGoogle(html: string): string[] {
  const pedidas: string[] = [];
  const re = /[?&;]family=([^&#{\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // «Geist+Mono:wght@400» → «Geist Mono»; el texto ya puede traer &amp;.
    const bruta = m[1].split(":")[0].replace(/\+/g, " ").replace(/&amp;/gi, "&");
    let familia: string;
    try {
      familia = decodeURIComponent(bruta);
    } catch {
      familia = bruta;
    }
    if (familia && !pedidas.includes(familia)) pedidas.push(familia);
  }
  return pedidas;
}
const PILA_SANS = "system-ui, -apple-system, sans-serif";
const PILA_SERIF = "Georgia, 'Times New Roman', serif";
const PILA_MONO = "ui-monospace, Menlo, Consolas, monospace";
const PILA_MANUSCRITA = "'Segoe Print', 'Comic Sans MS', cursive";
/** Pila de sistema equivalente para una familia que el OS no sirve. */
export function pilaSistema(familia: string): string {
  const n = familia.trim().toLowerCase();
  if (/mono|code|consol|courier|vt323/.test(n)) return PILA_MONO;
  if (/sans/.test(n)) return PILA_SANS;
  if (/serif|display|garamond|lora|merriweather|crimson|spectral|fraunces|cormorant/.test(n)) return PILA_SERIF;
  if (/caveat|hand|script|daughter|cursive/.test(n)) return PILA_MANUSCRITA;
  return PILA_SANS;
}
/** Elimina todo sitio desde el que el HTML seguiría pidiendo a Google. */
function quitarPeticiones(html: string): string {
  let salida = html.replace(/<link\b[^>]*>/gi, (e) => (REMOTAS.test(e) ? "" : e));
  salida = salida.replace(/@import\s+(?:url\s*\(\s*)?['"]?[^();'"]*['"]?\s*\)?\s*;?/gi, (regla) => (REMOTAS.test(regla) ? "" : regla));
  // url() remota dentro de CSS copiada (p. ej. el src de una @font-face ajena):
  // cualquier destino con protocolo o relativo al protocolo se neutraliza, no
  // solo el de Google: el enunciado es «nunca deja una petición a terceros».
  salida = salida.replace(/url\(\s*['"]?(?:https?:\/\/|\/\/)[^)]*['"]?\s*\)/gi, "url()");
  return salida;
}
/** @font-face con data URL para una fuente servida por el OS. */
function pasarFontFace(fuente: FuenteLocal): string {
  return fuente.caras
    .filter((cara) => cara.url.startsWith("data:"))
    .map((cara) =>
      `@font-face{font-family:'${fuente.familia}';font-style:${cara.estilo ?? "normal"};font-weight:${cara.peso};font-display:swap;src:url("${cara.url}") format("${cara.formato}");}`,
    )
    .join("\n");
}
/** Inyecta el CSS de fuentes en el <head> del diagrama, o al principio si no hay. */
function inyectarEstilos(html: string, css: string): string {
  const etiqueta = `<style>${css}</style>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (apertura) => apertura + etiqueta);
  }
  return etiqueta + html;
}
/** Sustituye la familia por su pila de sistema en declaraciones font-family (CSS y SVG). */
export function cambiarDeclaraciones(html: string, familia: string, pila: string): string {
  // La clase NO excluye la comilla simple: las familias van a menudo citadas
  // (font-family:'Inter'), y excluir a «'» dejaba la captura vacía y sin cambio.
  return html.replace(/font-family\s*[:=]\s*([^;">}]*)/gi, (completa, valor: string) => {
    if (!valor.trim()) return completa;
    const limpiar = (t: string) => t.trim().replace(/^['"]|['"]$/g, "");
    const pilaNueva = valor
      .split(",")
      .map((nombre) => (limpiar(nombre) === familia ? pila : nombre))
      .join(",");
    return completa.replace(valor, pilaNueva);
  });
}
export function sustituirFuentes(html: string, fuentesDisponibles: readonly FuenteLocal[]): ResultadoSustitucion {
  const pedidas = extraerFamiliasGoogle(html);
  const porFamilia = new Map(fuentesDisponibles.map((f) => [f.familia, f]));
  const servidas: string[] = [];
  const deSistema: string[] = [];
  const fontFaces: string[] = [];
  let salida = quitarPeticiones(html);
  for (const familia of pedidas) {
    const fuente = porFamilia.get(familia);
    if (fuente && fuente.caras.some((c) => c.url.startsWith("data:"))) {
      fontFaces.push(pasarFontFace(fuente));
      servidas.push(familia);
    } else {
      deSistema.push(familia);
    }
  }
  for (const familia of deSistema) {
    salida = cambiarDeclaraciones(salida, familia, pilaSistema(familia));
  }
  if (fontFaces.length > 0) salida = inyectarEstilos(salida, fontFaces.join("\n"));
  return { html: salida, servidas, deSistema };
}
