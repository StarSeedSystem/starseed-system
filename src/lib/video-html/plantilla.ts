export function plantillaStarSeed({ ancho, alto, duracion, titulo, fondo, acento }: {
  ancho: number;
  alto: number;
  duracion: number;
  titulo: string;
  fondo: string;
  acento: string;
}): string {
  // Escape HTML in titulo
  const escapedTitulo = titulo.replace(/[&<>"']/g, (match) => {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[match];
  });

  return `
    <div data-composition-id="main" data-start="0" data-duration="${duracion}" data-width="${ancho}" data-height="${alto}" data-no-timeline>
      <div id="background" class="clip" data-start="0" data-duration="${duracion}" style="background: ${fondo}; width: 100%; height: 100%;"></div>
      <div id="title" class="clip" data-start="0" data-duration="${duracion}" style="color: ${acento}; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">${escapedTitulo}</div>
    </div>
  `;
}