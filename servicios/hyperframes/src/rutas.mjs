export function manejar({ metodo, ruta, cuerpo }, deps) {
  // Desestructurar deps para claridad
  const {
    version,
    tieneNavegador,
    tieneFfmpeg,
    linter,
    sdk,
    obtenerComposicion,
    encolarRender,
    obtenerEstadoTrabajo,
  } = deps;

  // Limite de cuerpo: 8 MB
  const LIMITE_CUERPO = 8 * 1024 * 1024; // 8 MB en bytes
  let tamañoCuerpo = 0;
  if (cuerpo !== undefined) {
    if (typeof cuerpo === "string") {
      tamañoCuerpo = new TextEncoder().encode(cuerpo).length;
    } else if (cuerpo instanceof Buffer) {
      tamañoCuerpo = cuerpo.length;
    } else {
      // Asumimos que es un objeto y lo convertimos a string para medir
      tamañoCuerpo = new TextEncoder().encode(JSON.stringify(cuerpo)).length;
    }
  }

  if (tamañoCuerpo > LIMITE_CUERPO) {
    return {
      status: 413,
      cuerpo: JSON.stringify({ error: "Cuerpo demasiado grande" }),
      headers: { "Content-Type": "application/json" },
    };
  }

  // Helper para respuestas JSON
  const json = (status, objeto) => ({
    status,
    cuerpo: JSON.stringify(objeto),
    headers: { "Content-Type": "application/json" },
  });

  // Rutas conocidas
  if (ruta === "/salud" && metodo === "GET") {
    return json(200, {
      version,
      navegador: tieneNavegador,
      ffmpeg: tieneFfmpeg,
      // Telemetría siempre apagada en StarSeed, no se incluye en la respuesta
    });
  }

  if (ruta === "/lint" && metodo === "POST") {
    if (!cuerpo) return json(400, { error: "Cuerpo requerido" });
    try {
      // Asumimos que el cuerpo es una composición en formato JSON string
      const composicion = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
      const resultado = linter.lint(composicion);
      return json(200, resultado);
    } catch (error) {
      return json(500, { error: error.message });
    }
  }

  if (ruta === "/editar" && metodo === "POST") {
    if (!cuerpo) return json(400, { error: "Cuerpo requerido" });
    try {
      // El cuerpo debe contener: { composicion: string, operaciones: Operacion[] }
      const { composicion, operaciones } = typeof cuerpo === "string" ? JSON.parse(cuerpo) : cuerpo;
      const composicionEditada = sdk.applyOperations(composicion, operaciones);
      return json(200, { composicion: composicionEditada });
    } catch (error) {
      return json(500, { error: error.message });
    }
  }

  // GET /vista/:id
  const vistaMatch = ruta.match(/^\/vista\/([^/]+)$/);
  if (vistaMatch && metodo === "GET") {
    const [, id] = vistaMatch;
    try {
      const composicion = obtenerComposicion(id);
      // Sirve composición (el reproductor se maneja en el cliente con @hyperframes/player)
      return json(200, { composicion });
    } catch (error) {
      return json(500, { error: error.message });
    }
  }

  if (ruta === "/render" && metodo === "POST") {
    if (!cuerpo) return json(400, { error: "Cuerpo requerido" });
    try {
      // El cuerpo debe contener la composición y las opciones de render
      const { composicion, opciones } = typeof cuerpo === "string" ? JSON.parse(cuerpo) : cuerpo;
      const trabajoId = encolarRender(composicion, opciones);
      return json(200, { trabajoId });
    } catch (error) {
      return json(500, { error: error.message });
    }
  }

  // GET /trabajos/:id
  const trabajosMatch = ruta.match(/^\/trabajos\/([^/]+)$/);
  if (trabajosMatch && metodo === "GET") {
    const [, trabajoId] = trabajosMatch;
    try {
      const estado = obtenerEstadoTrabajo(trabajoId);
      return json(200, estado);
    } catch (error) {
      return json(500, { error: error.message });
    }
  }

  // Ruta desconocida
  return json(404, { error: "Ruta no encontrada" });
}