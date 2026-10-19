export function prepararDiagrama(html: string, { permitirAnimacion }: { permitirAnimacion: boolean }): { ok: boolean; srcdoc: string; sandbox: string; motivos: string[] } {
  const motivos: string[] = [];

  // 1. Tamaño límite 2 MB
  if (html.length > 2 * 1024 * 1024) {
    motivos.push('El HTML supera el límite de 2 MB');
    return { ok: false, srcdoc: '', sandbox: '', motivos };
  }

  let processed = html;

  // 2. Quitar tags no permitidos y su contenido
  const tagsToRemove = ['link', 'iframe', 'object', 'embed', 'form'];
  for (const tag of tagsToRemove) {
    // Eliminar tags de apertura y cierre con su contenido
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
    processed = processed.replace(regex, '');
    // También eliminar tags de autocierre (como <link />)
    const selfClosingRegex = new RegExp(`<${tag}[^/>]*/?>`, 'gi');
    processed = processed.replace(selfClosingRegex, '');
  }

  // 3. Quitar @import
  processed = processed.replace(/@import\s+[^;]+;/g, '');

  // 4. Quitar url(http...) y url(https...)
  processed = processed.replace(/url\s*\(\s*['"]?https?:\/\/[^)'"]*['"]?\s*\)/g, '');

  // 5. Quitar on* attributes
  processed = processed.replace(/\s*on\w+\s*=\s*['"][^'"]*['"]/gi, '');

  // 6. Quitar javascript: URLs
  processed = processed.replace(/\s*\w+\s*=\s*['"]javascript:[^'"]*['"]/gi, '');

  // 7. Verificar que hay exactamente un <svg> (etiqueta de apertura)
  const svgOpenMatches = processed.match(/<svg/g);
  if (!svgOpenMatches || svgOpenMatches.length !== 1) {
    motivos.push('El HTML debe contener exactamente un elemento <svg>');
    return { ok: false, srcdoc: '', sandbox: '', motivos };
  }

  // 8. Extraer el elemento <svg> completo (etiqueta de apertura y cierre)
  const svgMatch = processed.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    motivos.push('No se encontró un elemento <svg> completo');
    return { ok: false, srcdoc: '', sandbox: '', motivos };
  }
  const svgContent = svgMatch[0];

  // 9. Construir el documento HTML seguro
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:${permitirAnimacion ? `; script-src 'unsafe-inline'` : ''};`;
  const srcdoc = `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${svgContent}</body></html>`;

  // 10. Definir sandbox
  const sandbox = permitirAnimacion ? 'allow-scripts' : '';

  return {
    ok: true,
    srcdoc,
    sandbox,
    motivos: []
  };
}