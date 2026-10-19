export interface PlantillaOpciones {
  ancho: number;
  alto: number;
  duracion: number;
  titulo: string;
  fondo: string;
  acento: string;
}

function escaparCadena(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&#x27;")
    .replace(/\`/g, "&#x60;")
    .replace(/\\/g, "&#x2F;");
}

export function plantillaStarSeed(opciones: PlantillaOpciones): string {
  const { ancho, alto, duracion, titulo, fondo, acento } = opciones;

  const tituloEscapado = escaparCadena(titulo);

  return '<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + tituloEscapado + '</title>\n  <style>\n    @keyframes animarDesdeIzquierda {\n      from { transform: translateX(-100%); opacity: 0; }\n      to { transform: translateX(0); opacity: 1; }\n    }\n\n    @keyframes animarZoom {\n      from { transform: scale(0); opacity: 0; }\n      to { transform: scale(1); opacity: 1; }\n    }\n\n    @keyframes animarFade {\n      from { opacity: 0; }\n      to { opacity: 1; }\n    }\n\n    .clip {\n      position: absolute;\n      will-change: transform, opacity;\n      animation-fill-mode: both;\n    }\n\n    #titulo-principal {\n      color: ' + acento + ';\n      font-family: \'Inter\', sans-serif;\n      font-size: 3rem;\n      font-weight: 700;\n      text-align: center;\n      margin: 2rem 0;\n      animation: animarZoom 0.8s ease-out;\n    }\n\n    #descripcion {\n      color: ' + fondo + ';\n      font-family: \'Inter\', sans-serif;\n      font-size: 1.2rem;\n      line-height: 1.6;\n      text-align: center;\n      padding: 0 2rem;\n      animation: animarFade 1s ease-out;\n    }\n\n    #logo {\n      position: absolute;\n      top: 50%;\n      left: 50%;\n      transform: translate(-50%, -50%);\n      width: 200px;\n      height: 200px;\n      background-color: ' + acento + ';\n      border-radius: 50%;\n      animation: animarZoom 1s ease-out;\n    }\n\n    #fecha {\n      position: absolute;\n      bottom: 20px;\n      right: 20px;\n      color: ' + fondo + ';\n      font-size: 0.9rem;\n      animation: animarDesdeIzquierda 0.6s ease-out;\n    }\n\n    #patrocinador {\n      position: absolute;\n      bottom: 20px;\n      left: 20px;\n      color: ' + acento + ';\n      font-size: 0.9rem;\n      animation: animarDesdeIzquierda 0.6s ease-out;\n    }\n  </style>\n</head>\n<body>\n  <div data-composition-id="main"\n        data-start="0"\n        data-duration="' + duracion + '"\n        data-width="' + ancho + '"\n        data-height="' + alto + '"\n        data-no-timeline="true">\n\n    <h1 id="titulo-principal" class="clip"\n        data-start="0"\n        data-duration="' + duracion + '"\n        data-easing="cubic-bezier(0.4, 0, 0.2, 1)"\n        data-opacity="0->1"\n        data-transform="translateX(-100%)->translateX(0)"\n        data-transform-origin="center"\n        data-animation="animarZoom"\n        data-playback-rate="1">\n      ' + tituloEscapado + '\n    </h1>\n\n    <div id="logo" class="clip"\n         data-start="0.5"\n         data-duration="' + duracion + '"\n         data-easing="cubic-bezier(0.4, 0, 0.2, 1)"\n         data-opacity="0->1"\n         data-transform="scale(0)->scale(1)"\n         data-transform-origin="center">\n    </div>\n\n    <p id="descripcion" class="clip"\n       data-start="1"\n       data-duration="' + duracion + '"\n       data-easing="cubic-bezier(0.4, 0, 0.2, 1)"\n       data-opacity="0->1">\n      Composición generada con la plantilla StarSeed para HyperFrames.\n    </p>\n\n    <div id="fecha" class="clip"\n         data-start="' + (duracion * 0.8) + '"\n         data-duration="1"\n         data-easing="cubic-bezier(0.4, 0, 0.2, 1)"\n         data-opacity="0->1"\n         data-transform="translateX(-100%)->translateX(0)">\n      Creado el 2026-10-19\n    </div>\n\n    <div id="patrocinador" class="clip"\n         data-start="' + (duracion * 0.8) + '"\n         data-duration="1"\n         data-easing="cubic-bezier(0.4, 0, 0.2, 1)"\n         data-opacity="0->1"\n         data-transform="translateX(-100%)->translateX(0)">\n      Patrocinado por StarSeed OS\n    </div>\n\n  </div>\n</body>\n</html>';
}