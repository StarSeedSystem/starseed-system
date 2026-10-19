// player.mjs
// Manejador del reproductor para el servicio HyperFrames

export function crearPlayerManejador() {
  const playerState = {
    estaListo: true,
  };

  function obtenerVista(id) {
    if (!id) {
      throw new Error("ID de composición requerido");
    }
    return {
      html: `<div>Composición ${id}</div>`,
      video: `/videos/${id}.mp4`,
    };
  }

  return {
    estaListo,
    obtenerVista,
  };
}