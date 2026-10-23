export interface AislarDiagramaOpciones {
  permitirAnimacion?: boolean;
}

export interface AislarDiagramaResultado {
  ok: boolean;
  srcdoc?: string;
  sandbox?: string;
  motivos: string[];
}

// Aísla y valida HTML de diagramas antes de mostrarlo en iframe sandbox
const LIMITE_BYTES = 2 * 1024 * 1024;

export function prepararDiagrama(
  html: string,
  opciones: AislarDiagramaOpciones = {},
): AislarDiagramaResultado {
  const motivos: string[] = [];

  if (Buffer.byteLength(html, "utf-8") > LIMITE_BYTES) {
    motivos.push("excede el límite de 2 MB");
    return { ok: false, motivos, sandbox: opciones.permitirAnimacion ? "allow-scripts" : "" };
  }

  const tieneSvg = /<svg\b/i.test(html);
  if (!tieneSvg) {
    motivos.push("falta etiqueta <svg>");
  }

  const documentos = (html.match(/<!DOCTYPE\b/gi) || []).length;
  if (documentos !== 1) {
    motivos.push(`espera exactamente un documento HTML (${documentos} <!DOCTYPE>)`);
  }

  // Verifica elementos prohibidos antes de limpiar
  const prohibidos = [
    { etiqueta: "<iframe", nombre: "iframe" },
    { etiqueta: "<object", nombre: "object" },
    { etiqueta: "<embed", nombre: "embed" },
    { etiqueta: "<form", nombre: "form" },
  ];
  for (const p of prohibidos) {
    if (new RegExp(p.etiqueta, "i").test(html)) {
      motivos.push(`contiene elemento prohibido <${p.nombre}>`);
    }
  }
  if (/<link\b/i.test(html)) motivos.push("contiene <link> remoto");
  if (/@import\b/i.test(html)) motivos.push("contiene @import remoto");
  if (/url\s*\(\s*['"]?https?:\/\//i.test(html)) motivos.push("contiene url(http…) remoto");
  if (/on\w+\s*=/i.test(html)) motivos.push("contiene manejador on*=*");
  if (/javascript\s*:/i.test(html)) motivos.push("contiene javascript:");

  if (motivos.length > 0 && !tieneSvg && documentos !== 1) {
    // Si hay errores estructurales, no construimos srcdoc
    return {
      ok: false,
      motivos,
      sandbox: opciones.permitirAnimacion ? "allow-scripts" : "",
    };
  }

  // Limpieza del HTML: quitar link, object, embed, form, scripts remotos
  let limpio = html;
  // Elimina <link ...> completo
  limpio = limpio.replace(/<link[^>]*>/gi, "");
  // Elimina <object ...>...</object>
  limpio = limpio.replace(/<object[\s\S]*?<\/object>/gi, "");
  // Elimina <embed ...>
  limpio = limpio.replace(/<embed[^>]*>/gi, "");
  // Elimina <form ...>...</form>
  limpio = limpio.replace(/<form[\s\S]*?<\/form>/gi, "");
  // Elimina manejadores on*=
  limpio = limpio.replace(/\s+on\w+\s*=["'][^"']*["']/gi, "");
  limpio = limpio.replace(/\s+on\w+\s*=[^\s>]+/gi, "");
  // Elimina referencias javascript:
  limpio = limpio.replace(/javascript\s*:[^"')]*?/gi, "");
  // Elimina @import en <style>
  limpio = limpio.replace(/@import\s+[^;]+;/gi, "");
  // Elimina url(http...) o url('http...) o url("http...)
  limpio = limpio.replace(/url\s*\(\s*['"]?https?:\/\/[^)]+\)/gi, "url(data:)");

  // Inserta CSP meta en <head> si existe, o después de <!DOCTYPE>
  const metaCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; ${opciones.permitirAnimacion ? "script-src 'unsafe-inline';" : ""}">`;
  if (/<\/head>/i.test(limpio)) {
    limpio = limpio.replace(/<\/head>/i, metaCsp + "\n</head>");
  } else if (/<head>/i.test(limpio)) {
    limpio = limpio.replace(/<head>/i, "<head>\n" + metaCsp);
  } else {
    limpio = limpio.replace(/<!DOCTYPE[^>]*>/i, (m) => m + "\n<head>" + metaCsp + "</head>");
  }

  const sandbox = opciones.permitirAnimacion ? "allow-scripts" : "";
  const erroresCriticos = motivos.filter(
    (m) =>
      m.includes("excede") ||
      m.includes("falta etiqueta") ||
      m.includes("espera exactamente") ||
      m.includes("contiene elemento prohibido") ||
      m.includes("contiene <link>") ||
      m.includes("contiene @import") ||
      m.includes("contiene url(http") ||
      m.includes("contiene manejador") ||
      m.includes("contiene javascript:") ||
      m.includes("contiene <iframe") ||
      m.includes("contiene <object") ||
      m.includes("contiene <embed") ||
      m.includes("contiene <form"),
  );
  const ok = erroresCriticos.length === 0 && tieneSvg && documentos === 1;

  return {
    ok,
    srcdoc: ok ? limpio : undefined,
    sandbox,
    motivos,
  };
}
