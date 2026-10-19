export function plantillaStarSeed({ ancho, alto, duracion, titulo, fondo, acento }: {
  ancho: number;
  alto: number;
  duracion: number;
  titulo: string;
  fondo: string;
  acento: string;
}): string {
  const escapedTitulo = titulo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const style = `
    <style>
      @keyframes fondoAnim {
        0% { background-color: ${fondo}; }
        50% { background-color: ${acento}; }
        100% { background-color: ${fondo}; }
      }
      .clip {
        animation: fondoAnim ${duracion}s linear infinite;
        width: ${ancho}px;
        height: ${alto}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
        text-shadow: 0 0 2px black;
      }
    </style>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        ${style.trim()}
      </head>
      <body>
        <div 
          data-composition-id="main"
          data-start="0"
          data-duration="${duracion}"
          data-width="${ancho}"
          data-height="${alto}"
          data-no-timeline
        >
          <div id="main-title" class="clip" data-start="0" data-duration="${duracion}">
            ${escapedTitulo}
          </div>
        </div>
      </body>
    </html>
  `.trim();
}