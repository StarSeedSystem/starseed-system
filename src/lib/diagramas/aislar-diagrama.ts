/*
 * Aísla y valida el HTML que escribe la habilidad `diagram-design`
 * (licencia MIT, copia en vendor/habilidades/diagram-design/) antes de
 * mostrarlo. Contrato: architecture/diagramas.md §3.
 *
 * Nunca se muestra fuera de un iframe `sandbox` sin `allow-same-origin` y la
 * CSP bloquea toda la red: las fuentes remotas (Google Fonts) se quitan y se
 * usan las del OS.
 */

export interface AislarDiagramaOpciones {
  permitirAnimacion?: boolean;
}

export interface AislarDiagramaResultado {
  ok: boolean;
  srcdoc?: string;
  sandbox: string;
  motivos: string[];
}

const LIMITE_BYTES = 2 * 1024 * 1024;

function bytesUtf8(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

function contar(html: string, patron: RegExp): number {
  return (html.match(patron) ?? []).length;
}

/** Quita un elemento completo y cualquier etiqueta suelta que quede. */
function quitarElemento(html: string, nombre: string): string {
  const bloque = new RegExp(`<${nombre}\\b[^>]*>[\\s\\S]*?<\\/${nombre}\\s*>`, "gi");
  const suelto = new RegExp(`<\\/?${nombre}\\b[^>]*>`, "gi");
  return html.replace(bloque, "").replace(suelto, "");
}

/** Limpia manejadores `on*=` y atributos con `javascript:` dentro de etiquetas. */
function limpiarAtributos(html: string): string {
  return html.replace(/<[a-z][^>]*>/gi, (etiqueta) =>
    etiqueta
      .replace(/[\s/]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(
        /\s(?:href|src|xlink:href|action|formaction)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
        "",
      ),
  );
}

export function prepararDiagrama(
  html: string,
  opciones: AislarDiagramaOpciones = {},
): AislarDiagramaResultado {
  const permitirAnimacion = opciones.permitirAnimacion === true;
  const sandbox = permitirAnimacion ? "allow-scripts" : "";
  const motivos: string[] = [];

  if (bytesUtf8(html) > LIMITE_BYTES) {
    return { ok: false, sandbox, motivos: ["excede el límite de 2 MB"] };
  }

  const doctipos = contar(html, /<!doctype\b/gi);
  const htmls = contar(html, /<html\b/gi);
  const svgs = contar(html, /<svg\b/gi);
  if (doctipos !== 1) {
    motivos.push(`espera exactamente un documento HTML (${doctipos} <!DOCTYPE>)`);
  }
  if (htmls > 1) motivos.push("contiene más de un documento <html>");
  if (svgs === 0) motivos.push("falta etiqueta <svg>");

  let limpio = html;
  for (const [nombre, aviso] of [
    ["iframe", "<iframe>"],
    ["object", "<object>"],
    ["embed", "<embed>"],
    ["form", "<form>"],
  ] as const) {
    if (new RegExp(`<${nombre}\\b`, "i").test(limpio)) {
      motivos.push(`se quitó elemento prohibido ${aviso}`);
    }
    limpio = quitarElemento(limpio, nombre);
  }
  if (/<link\b/i.test(limpio)) {
    motivos.push("se quitó <link> remoto");
    limpio = limpio.replace(/<link\b[^>]*>/gi, "");
  }
  if (/@import\b/i.test(limpio)) {
    motivos.push("se quitó @import remoto");
    limpio = limpio.replace(/@import[^;]*;?/gi, "");
  }
  if (/url\s*\(\s*['"]?(?:https?:)?\/\//i.test(limpio)) {
    motivos.push("se quitó url(http…) remoto");
    limpio = limpio.replace(/url\s*\(\s*['"]?(?:https?:)?\/\/[^)]*\)/gi, "none");
  }
  if (/[\s/]on[a-z]+\s*=/i.test(limpio)) {
    motivos.push("se quitaron manejadores on*=");
  }
  if (/javascript\s*:/i.test(limpio)) motivos.push("se quitó javascript:");
  limpio = limpio.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, "");
  limpio = limpio.replace(/<base\b[^>]*>/gi, "");
  limpio = limpiarAtributos(limpio);

  const metaCsp =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
    `style-src 'unsafe-inline'; img-src data:; font-src data:` +
    (permitirAnimacion ? "; script-src 'unsafe-inline'" : "") +
    `">`;
  if (/<\/head>/i.test(limpio)) {
    limpio = limpio.replace(/<\/head>/i, `${metaCsp}\n</head>`);
  } else if (/<head\b[^>]*>/i.test(limpio)) {
    limpio = limpio.replace(/<head\b[^>]*>/i, (m) => `${m}\n${metaCsp}`);
  } else {
    limpio = limpio.replace(/<!doctype[^>]*>/i, (m) => `${m}\n<head>${metaCsp}</head>`);
  }

  const ok = doctipos === 1 && htmls <= 1 && svgs > 0;
  return { ok, srcdoc: ok ? limpio : undefined, sandbox, motivos };
}
