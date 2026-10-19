// metricas.mjs
// Métricas para el servicio HyperFrames

export function crearMetricas(db) {
  const metricas = {
    contador: { solicitudes: 0, errores: 0 },
    historial: [],
  };

  function servida(ruta, ok = true) {
    metricas.contador.solicitudes++;
    if (!ok) {
      metricas.contador.errores++;
    }
    metricas.historial.push({
      t: Date.now(),
      ruta,
      ok,
    });
  }

  function volcar() {
    metricas.historial = [];
  }

  return {
    servida,
    volcar,
    estado: () => ({
      solicitudes: metricas.contador.solicitudes,
      errores: metricas.contador.errores,
    }),
  };
}