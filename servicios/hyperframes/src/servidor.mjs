// servidor.mjs
// Servidor HTTP para el servicio HyperFrames

import { createServer } from "node:http";
import { ErrorValidacion, ErrorRutaDesconocida, ErrorCuerpoGrande, ErrorDiscoFueraProyecto } from "./error.mjs";

const MAX_CUERPO = 8 * 1024 * 1024;

export function crearServidor(componentes) {
  const { manejar } = await import("./rutas.mjs");

  return createServer(async (req, res) => {
    const inicio = Date.now();
    let cuerpo = null;

    // Leer cuerpo con límite
    if (req.method !== "GET" && req.method !== "HEAD") {
      const trozos = [];
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > MAX_CUERPO) {
          req.socket.destroy();
          return responder(413, { ok: false, error: `cuerpo de más de ${MAX_CUERPO} bytes` });
        }
        trozos.push(chunk);
      }

      if (total > 0) {
        const buffer = Buffer.concat(trozos);
        try {
          cuerpo = JSON.parse(buffer.toString("utf8"));
          if (typeof cuerpo !== "object" || cuerpo === null) {
            cuerpo = {};
          }
        } catch {
          return responder(400, { ok: false, error: "JSON no válido" });
        }
      }
    }

    // Validar ruta para ataques de directorio
    const rutaDecodificada = decodeURIComponent(req.url || "/");
    if (rutaDecodificada.includes("..") || rutaDecodificada.includes("\\")) {
      return responder(400, { ok: false, error: `ruta fuera del proyecto: ${rutaDecodificada}` });
    }

    // Manejar la solicitud
    const rutaNormalizada = rutaDecodificada.split("/").filter(Boolean).join("/");
    const resultado = manejar(
      {
        metodo: req.method,
        ruta: `/${rutaNormalizada}`,
        cuerpo,
      },
      componentes.deps
    );

    // Registrar la solicitud
    if (componentes.metricas) {
      componentes.metricas.servida(req.url || "/", resultado.ok ? 200 : (resultado.codigo || 500));
    }

    // Enviar respuesta
    const codigo = resultado.ok ? 200 : (resultado.codigo || 500);
    responder(codigo, resultado);

    function responder(codigo, cuerpo) {
      res.writeHead(codigo, {
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      });

      if (!res.headersSent) {
        res.end(JSON.stringify(cuerpo));
      }
    }
  });
}