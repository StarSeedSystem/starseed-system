// rutas.mjs
// Rutas puras para el servicio HyperFrames
// Exporta la función pura `manejar` para pruebas

export function manejar({ metodo, ruta, cuerpo }, deps) {
  const { maxCuerpo, telemetriaApagada, navegadorPresent, ffprobePresent, ffmpegPresent } = deps;

  // Validaciones
  if (cuerpo && Buffer.byteLength(JSON.stringify(cuerpo)) > maxCuerpo) {
    return { ok: false, error: `cuerpo de más de ${maxCuerpo} bytes`, codigo: 413 };
  }

  if (ruta.includes("..") || ruta.includes("\\")) {
    return { ok: false, error: `ruta fuera del proyecto: ${ruta}`, codigo: 400 };
  }

  // Rutas
  if (metodo === "GET" && ruta === "/salud") {
    return {
      ok: true,
      version: "1.0.0",
      ffprobe: ffprobePresent,
      ffmpeg: ffmpegPresent,
      navegador: navegadorPresent,
      telemetriaApagada,
      timestamp: Date.now(),
    };
  }

  if (metodo === "POST" && ruta === "/lint") {
    return {
      ok: true,
      lint: {
        errores: [],
        advertencias: [],
      },
    };
  }

  if (metodo === "POST" && ruta === "/editar") {
    return {
      ok: true,
      patch: [],
      revertir: [],
    };
  }

  if (metodo === "GET" && /^\/vista\/[^/]+$/i.test(ruta)) {
    const id = ruta.split("/")[2];
    return {
      ok: true,
      html: `<div>Composición de HyperFrames: ${id}</div>`,
      video: `/videos/${id}.mp4`,
    };
  }

  if (metodo === "POST" && ruta === "/render") {
    const id = `trabajo-${Date.now()}`;
    return {
      ok: true,
      id,
      estado: "en cola",
    };
  }

  if (metodo === "GET" && /^\/trabajos\/[^/]+$/i.test(ruta)) {
    const id = ruta.split("/")[2];
    return {
      ok: true,
      id,
      estado: "en cola",
      progreso: 0,
      salida: null,
    };
  }

  // Ruta desconocida
  return { ok: false, error: `ruta desconocida: ${ruta}`, codigo: 404 };
}