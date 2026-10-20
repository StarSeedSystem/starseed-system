export interface PrepararDiagrama {
  (html: string, opts: { permitirAnimacion: boolean }): { ok: boolean; srcdoc: string; sandbox: string; motivos: string[] };
}

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

const BLOQUEADO = {
  link: 'link remotos',
  import: '@import',
  url: 'url(http)',
  iframe: 'iframe',
  object: 'object',
  embed: 'embed',
  form: 'form',
  onerror: 'evento',
  onclick: 'evento',
  onload: 'evento',
  onloaderror: 'evento',
  javascript: 'javascript:',
} as const;

function contarSvg(html: string): number {
  let count = 0;
  let pos = 0;

  while (pos < html.length) {
    const inicio = html.indexOf('<svg', pos);
    if (inicio === -1) break;

    count++;
    const fin = html.indexOf('</svg>', inicio);
    if (fin === -1) break;
    pos = fin + 6;
  }

  return count;
}

function tieneCSP(html: string): boolean {
  return html.includes('http-equiv="Content-Security-Policy"');
}

function removerElementosPeligrosos(html: string): { html: string; motivos: string[] } {
  let motivos: string[] = [];
  let resultado = html;

  const patrones = [
    { regex: /<link[^>]*>/gi, motivo: BLOQUEADO.link },
    { regex: /<style[^>]*>.*?url\(http[^)]*\)<\/style>/gis, motivo: BLOQUEADO.url },
    { regex: /<iframe[^>]*>/gi, motivo: BLOQUEADO.iframe },
    { regex: /<\/iframe>/gi, motivo: BLOQUEADO.iframe },
    { regex: /<object[^>]*>/gi, motivo: BLOQUEADO.object },
    { regex: /<\/object>/gi, motivo: BLOQUEADO.object },
    { regex: /<embed[^>]*>/gi, motivo: BLOQUEADO.embed },
    { regex: /<\/embed>/gi, motivo: BLOQUEADO.embed },
    { regex: /<form[^>]*>/gi, motivo: BLOQUEADO.form },
    { regex: /<\/form>/gi, motivo: BLOQUEADO.form },
    { regex: /<[^>]*onerror\s*=\s*["']?[^"'>\s]+["']?[^>]*>/gi, motivo: BLOQUEADO.onerror },
    { regex: /<[^>]*onclick\s*=\s*["']?[^"'>\s]+["']?[^>]*>/gi, motivo: BLOQUEADO.onclick },
    { regex: /<[^>]*onload\s*=\s*["']?[^"'>\s]+["']?[^>]*>/gi, motivo: BLOQUEADO.onload },
    { regex: /<[^>]*onloaderror\s*=\s*["']?[^"'>\s]+["']?[^>]*>/gi, motivo: BLOQUEADO.onloaderror },
    { regex: /href\s*=\s*["']?javascript:/gi, motivo: BLOQUEADO.javascript },
  ];

  patrones.forEach(pat => {
    const coincidencias = resultado.match(pat.regex);
    if (coincidencias && coincidencias.length > 0) {
      resultado = resultado.replace(pat.regex, '');
      motivos.push(pat.motivo);
    }
  });

  return { html: resultado, motivos: [...new Set(motivos)] };
}

function agregarCSP(html: string, permitirAnimacion: boolean): string {
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
  ];
  if (permitirAnimacion) {
    csp.push("script-src 'unsafe-inline'");
  }

  if (!tieneCSP(html)) {
    const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp.join('; ')}">`;
    html = html.replace(/<body>/i, `<body>${metaTag}`);
    if (!html.match(/<body>/i)) {
      html = `<body>${metaTag}${html}</body>`;
    }
  }

  return html;
}

export const aislarDiagrama: PrepararDiagrama = (html, opts) => {
  const motivos: string[] = [];

  if (!html || html.trim().length === 0) {
    motivos.push('HTML malformado');
    return { ok: false, srcdoc: html, sandbox: '', motivos };
  }

  const svgCount = contarSvg(html);

  if (svgCount === 0) {
    motivos.push('no hay <svg>');
    return { ok: false, srcdoc: html, sandbox: '', motivos };
  }

  if (svgCount > 1) {
    motivos.push('múltiples elementos <svg>');
    return { ok: false, srcdoc: html, sandbox: '', motivos };
  }

  if (tieneCSP(html)) {
    motivos.push('CSP ya presente');
  }

  const resultadoRemovido = removerElementosPeligrosos(html);
  motivos.push(...resultadoRemovido.motivos);

  const cspHtml = agregarCSP(resultadoRemovido.html, opts.permitirAnimacion);
  const sandboxAttr = opts.permitirAnimacion ? 'allow-scripts' : '';

  const sizeBytes = new TextEncoder().encode(cspHtml).length;
  if (sizeBytes > MAX_SIZE_BYTES) {
    motivos.push('demasiado grande');
    return { ok: false, srcdoc: '', sandbox: '', motivos };
  }

  return { ok: true, srcdoc: cspHtml, sandbox: sandboxAttr, motivos };
};