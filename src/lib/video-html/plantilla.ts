type PlantillaParams = {
  ancho: number;
  alto: number;
  duracion: number;
  titulo: string;
  fondo: string;
  acento: string;
};

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"]/g, (match) => {
    const mapa = {
      "&": "&#38;",
      "<": "&#60;",
      ">": "&#62;",
      '"': "&#34;",
      "'": "'",
    };
    return mapa[match];
  });
}

function generarKeyframes(nombre, desde, hasta) {
  const propsDesde = Object.entries(desde).map(([k, v]) => k + ": " + v + ";").join(" ");
  const propsHasta = Object.entries(hasta).map(([k, v]) => k + ": " + v + ";").join(" ");
  return "@keyframes " + nombre + " { from { " + propsDesde + " } to { " + propsHasta + " } }";
}

export function plantillaStarSeed({ ancho, alto, duracion, titulo, fondo, acento }) {
  const tituloEscapado = escaparHtml(titulo);
  const fondoEscapado = escaparHtml(fondo);
  const acentoEscapado = escaparHtml(acento);

  const keyframesFadeIn = generarKeyframes("sf-fade-in", { opacity: "0" }, { opacity: "1" });
  const keyframesSlideUp = generarKeyframes("sf-slide-up", { opacity: "0", transform: "translateY(30px)" }, { opacity: "1", transform: "translateY(0)" });
  const keyframesScaleIn = generarKeyframes("sf-scale-in", { opacity: "0", transform: "scale(0.9)" }, { opacity: "1", transform: "scale(1)" });

  return "<div data-composition-id=\"main\" data-start=\"0\" data-duration=\"" + duracion + "\" data-width=\"" + ancho + "\" data-height=\"" + alto + "\" data-no-timeline>" +
  "<style>" +
    keyframesFadeIn +
    keyframesSlideUp +
    keyframesScaleIn +
    ".sf-fondo { animation: sf-fade-in " + duracion + "s ease-out; }" +
    ".sf-titulo { animation: sf-slide-up 1.2s ease-out; }" +
    ".sf-acento { animation: sf-scale-in 0.8s ease-out 0.4s both; }" +
  "</style>" +
  "<div id=\"fondo\" class=\"clip sf-fondo\" data-start=\"0\" data-duration=\"" + duracion + "\" data-track-index=\"0\" style=\"background: " + fondoEscapado + "; width: 100%; height: 100%; position: absolute; inset: 0;\"></div>" +
  "<div id=\"titulo\" class=\"clip sf-titulo\" data-start=\"0\" data-duration=\"" + duracion + "\" data-track-index=\"1\" style=\"color: " + acentoEscapado + "; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: Inter, system-ui, sans-serif; font-size: clamp(2rem, 5vw, 4rem); font-weight: 600; text-align: center; white-space: pre-wrap;\">" + tituloEscapado + "</div>" +
  "<div id=\"acento\" class=\"clip sf-acento\" data-start=\"0.5\" data-duration=\"" + Math.max(0, duracion - 0.5) + "\" data-track-index=\"2\" style=\"color: " + acentoEscapado + "; position: absolute; bottom: 10%; left: 50%; transform: translateX(-50%); font-family: Rajdhani, Inter, system-ui, sans-serif; font-size: clamp(1rem, 2vw, 1.5rem); font-weight: 400; opacity: 0.8;\">\u2726 StarSeed OS \u2726</div>" +
"</div>";
}
