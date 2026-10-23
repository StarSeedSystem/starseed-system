// Aislamiento y validación puros del HTML de un diagrama antes de mostrarlo.
// El HTML se pinta SIEMPRE en un iframe `sandbox` sin `allow-same-origin`,
// sin red y sin recursos externos; las fuentes son las del OS.
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/),
// citada en architecture/diagramas.md §3 y §4.

export interface AislarDiagramaOpciones {
  /** Solo con animación se permite ejecutar scripts dentro del iframe. */
  permitirAnimacion?: boolean;
}

export interface AislarDiagramaResultado {
  ok: boolean;
  srcdoc?: string;
  sandbox: string;
  motivos: string[];
}

/** Tope duro de tamaño: 2 MB de HTML. */
const LIMITE_BYTES = 2 * 1024 * 1024;

function bytesDe(texto: string): number {
  // TextEncoder existe en navegador y en Node; Buffer no existe en el cliente.
  return new TextEncoder().encode(texto).length;
}

function metaCsp(permitirAnimacion: boolean): string {
  const directivas = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
  ];
  if (permitirAnimacion) directivas.push("script-src 'unsafe-inline'");
  return `<meta http-equiv="Content-Security-Policy" content="${directivas.join("; ")}">`;
}

function insertarCsp(html: string, permitirAnimacion: boolean): string {
  const meta = metaCsp(permitirAnimacion);
  if (/<head\b[^>]*>/i.test(html)) {
    // Justo después de <head>: la política cubre también lo que venga después.
    return html.replace(/<head\b[^>]*>/i, (etiqueta) => `${etiqueta}\n${meta}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (etiqueta) => `${etiqueta}\n<head>\n${meta}\n</head>`);
  }
  return html.replace(/<!DOCTYPE[^>]*>/i, (etiqueta) => `${etiqueta}\n<head>\n${meta}\n</head>`);
}

/** Quita lo que no puede llegar a mostrarse y anota cada retirada. */
function limpiar(html: string, motivos: string[]): string {
  let limpio = html;
  const aplicar = (patron: RegExp, reemplazo: string, motivo: string) => {
    const antes = limpio;
    limpio = limpio.replace(patron, reemplazo);
    if (limpio !== antes) motivos.push(motivo);
  };

  // Una CSP previa podría ocultarse entre etiquetas raras: la nuestra manda.
  aplicar(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "", "quitada una CSP previa");
  // Un meta refresh navegaría fuera del iframe y haría red: tampoco pasa.
  aplicar(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "", "quitado meta refresh");
  aplicar(/<link\b[^>]*>/gi, "", "quitado <link> remoto");
  aplicar(/<\/?(?:iframe|object|embed|form)\b[^>]*>/gi, "", "quitado elemento interactivo (iframe/object/embed/form)");
  // Manejadores on* con comillas y sin ellas; el separador puede ser espacio o «/».
  aplicar(/([\s/])on[a-z]+\s*=\s*"[^"]*"/gi, "$1", "quitado manejador on*=");
  aplicar(/([\s/])on[a-z]+\s*=\s*'[^']*'/gi, "$1", "quitado manejador on*=");
  aplicar(/([\s/])on[a-z]+\s*=\s*[^\s>]+/gi, "$1", "quitado manejador on*=");
  aplicar(/javascript\s*:/gi, "", "quitado javascript:");
  aplicar(/@import\b[^;]*;?/gi, "", "quitado @import remoto");
  aplicar(/url\s*\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi, 'url("data:,")', "quitado url(http…) remoto");
  return limpio;
}

export function prepararDiagrama(
  html: string,
  opciones: AislarDiagramaOpciones = {},
): AislarDiagramaResultado {
  const permitirAnimacion = opciones.permitirAnimacion === true;
  // Nunca se concede allow-same-origin: el iframe conserva un origen opaco.
  const sandbox = permitirAnimacion ? "allow-scripts" : "";
  const motivos: string[] = [];

  if (bytesDe(html) > LIMITE_BYTES) {
    motivos.push("excede el límite de 2 MB");
    return { ok: false, sandbox, motivos };
  }

  const limpio = limpiar(html, motivos);
  const tieneSvg = /<svg\b/i.test(limpio);
  if (!tieneSvg) motivos.push("falta etiqueta <svg>");

  const doctypes = (limpio.match(/<!DOCTYPE\b/gi) || []).length;
  if (doctypes !== 1) {
    motivos.push(`espera exactamente un documento HTML (${doctypes} <!DOCTYPE>)`);
  }
  const htmlAbiertos = (limpio.match(/<html\b/gi) || []).length;
  if (htmlAbiertos > 1) {
    motivos.push(`espera un solo documento HTML (${htmlAbiertos} <html>)`);
  }

  const ok = tieneSvg && doctypes === 1 && htmlAbiertos <= 1;
  return {
    ok,
    srcdoc: ok ? insertarCsp(limpio, permitirAnimacion) : undefined,
    sandbox,
    motivos,
  };
}
