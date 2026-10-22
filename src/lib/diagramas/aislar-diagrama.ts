// Aísla y valida el HTML de un diagrama antes de mostrarlo en un iframe sandbox.
// Contrato: architecture/diagramas.md §3.4. La skill de origen es diagram-design
// (MIT, vendor/habilidades/diagram-design/). Nunca allow-same-origin ni red.

export interface AislarDiagramaOpciones {
  permitirAnimacion?: boolean;
}

export interface AislarDiagramaResultado {
  ok: boolean;
  srcdoc?: string;
  sandbox: string;
  motivos: string[];
}

export const LIMITE_DIAGRAMA_BYTES = 2 * 1024 * 1024;

const SANDBOX_ANIMADO = "allow-scripts";

function tamanoUtf8(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

function limpiar(
  html: string,
  patron: RegExp,
  motivo: string,
  motivos: string[],
  reemplazo = "",
): string {
  if (!html.match(patron)) return html;
  motivos.push(motivo);
  return html.replace(patron, reemplazo);
}

function sanear(html: string, animacion: boolean, motivos: string[]): string {
  let limpio = html;
  for (const etiqueta of ["iframe", "object", "form"]) {
    const bloque = new RegExp(`\\s*<${etiqueta}\\b[\\s\\S]*?<\\/${etiqueta}\\s*>`, "gi");
    const suelto = new RegExp(`\\s*<${etiqueta}\\b[^>]*\\/?>`, "gi");
    limpio = limpiar(limpio, bloque, `se quitó <${etiqueta}>`, motivos);
    limpio = limpiar(limpio, suelto, `se quitó <${etiqueta}>`, motivos);
  }
  limpio = limpiar(limpio, /\s*<embed\b[^>]*\/?>/gi, "se quitó <embed>", motivos);
  limpio = limpiar(limpio, /\s*<link\b[^>]*\/?>/gi, "se quitó <link> externo", motivos);
  limpio = limpiar(limpio, /\s*<base\b[^>]*\/?>/gi, "se quitó <base>", motivos);
  limpio = limpiar(
    limpio,
    /\s*<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*\/?>/gi,
    "se quitó un refresco automático",
    motivos,
  );
  limpio = limpiar(
    limpio,
    /\s*@import\s+(?:url\s*\([^)]*\)|[^;{}]+)\s*;?/gi,
    "se quitó @import remoto",
    motivos,
  );
  limpio = limpiar(
    limpio,
    /url\s*\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi,
    "se quitó url(http…) remoto",
    motivos,
    'url("data:,")',
  );
  limpio = limpiar(
    limpio,
    /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "se quitó un manejador on*=*",
    motivos,
  );
  limpio = limpiar(limpio, /javascript\s*:/gi, "se quitó javascript:", motivos);

  const sinAnimacion = "se quitó el script (animación no permitida)";
  if (animacion) {
    limpio = limpiar(
      limpio,
      /<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script\s*>/gi,
      "se quitó un script externo",
      motivos,
    );
    limpio = limpiar(limpio, /<script\b[^>]*\bsrc\s*=[^>]*\/?>/gi, "se quitó un script externo", motivos);
  } else {
    limpio = limpiar(limpio, /<script\b[\s\S]*?<\/script\s*>/gi, sinAnimacion, motivos);
    limpio = limpiar(limpio, /<script\b[^>]*\/?>/gi, sinAnimacion, motivos);
  }
  return limpio;
}

function insertarCsp(html: string, animacion: boolean): string {
  const directivas = ["default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:"];
  if (animacion) directivas.push("script-src 'unsafe-inline'");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${directivas.join("; ")}">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (cabeza) => `${cabeza}\n  ${meta}`);
  }
  return html.replace(/<!DOCTYPE[^>]*>/i, (doctype) => `${doctype}\n<head>\n  ${meta}\n</head>`);
}

export function prepararDiagrama(
  html: string,
  opciones: AislarDiagramaOpciones = {},
): AislarDiagramaResultado {
  const animacion = opciones.permitirAnimacion === true;
  const sandbox = animacion ? SANDBOX_ANIMADO : "";
  const motivos: string[] = [];

  if (tamanoUtf8(html) > LIMITE_DIAGRAMA_BYTES) {
    return { ok: false, sandbox, motivos: ["excede el límite de 2 MB"] };
  }

  const documentos = html.match(/<!DOCTYPE\b/gi)?.length ?? 0;
  const tieneSvg = /<svg\b/i.test(html);
  if (documentos !== 1) motivos.push(`espera exactamente un documento HTML (${documentos} <!DOCTYPE>)`);
  if (!tieneSvg) motivos.push("falta etiqueta <svg>");
  if (documentos !== 1 || !tieneSvg) return { ok: false, sandbox, motivos };

  const limpio = insertarCsp(sanear(html, animacion, motivos), animacion);
  return { ok: true, srcdoc: limpio, sandbox, motivos };
}
