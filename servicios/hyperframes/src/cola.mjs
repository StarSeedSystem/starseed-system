// cola.mjs
// Cola de render para el servicio HyperFrames

export function crearColaRender(metricas) {
  const cola = {
    trabajos: {},
  };

  function crearTrabajo(opciones) {
    const id = `trabajo-${Date.now()}`;
    cola.trabajos[id] = {
      id,
      estado: "en cola",
      progreso: 0,
      opciones,
      creado: Date.now(),
      salida: null,
    };
    metricas?.servida("trabajo", true);
    return id;
  }

  function estadoTrabajo(id) {
    const trabajo = cola.trabajos[id];
    if (!trabajo) {
      return null;
    }
    return trabajo;
  }

  function cancelarTrabajo(id) {
    const trabajo = cola.trabajos[id];
    if (!trabajo) {
      return false;
    }
    trabajo.estado = "cancelado";
    metricas?.servida("trabajo", true);
    return true;
  }

  return {
    crearTrabajo,
    estadoTrabajo,
    cancelarTrabajo,
  };
}