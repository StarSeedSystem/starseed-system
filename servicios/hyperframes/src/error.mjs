// error.mjs
// Errores válidos para el servicio HyperFrames

export class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.nombre = "ErrorValidacion";
  }
}

export class ErrorRutaDesconocida extends ErrorValidacion {
  constructor(ruta) {
    super(`ruta desconocida: ${ruta}`);
    this.codigo = 404;
    this.ruta = ruta;
  }
}

export class ErrorCuerpoGrande extends ErrorValidacion {
  constructor(maxBytes) {
    super(`cuerpo de más de ${maxBytes} bytes`);
    this.codigo = 413;
    this.maxBytes = maxBytes;
  }
}

export class ErrorDiscoFueraProyecto extends ErrorValidacion {
  constructor(ruta) {
    super(`ruta fuera del proyecto: ${ruta}`);
    this.codigo = 400;
    this.ruta = ruta;
  }
}