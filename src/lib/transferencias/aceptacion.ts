export type TipoEnvio = 'archivo' | 'carpeta' | 'cerebro';

export interface NeuronaReconocida {
  id: string;
  alias?: string;
  autoAceptar: boolean;
}

export interface ConfiguracionAceptacion {
  neuronasReconocidas: Map<string, NeuronaReconocida>;
  autoAceptarNeuronasReconocidas: boolean;
}

export type AccionAceptacion = 'pedir' | 'auto-aceptar' | 'rechazar';

export interface ResultadoAceptacion {
  accion: AccionAceptacion;
  mensaje: string;
  detalles: {
    nombre: string;
    tamanoFormateado: string;
    tipoReal: string;
    neuronaOrigen: string;
    medio: string;
    cantidadArchivos?: number;
    esCerebro?: boolean;
  };
}

export interface EnvioEntrante {
  tipo: TipoEnvio;
  nombre: string;
  tamano: number;
  tipoReal?: string;
  cantidadArchivos?: number;
  neuronaOrigen: string;
  medio: string;
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function obtenerNombreNeurona(config: ConfiguracionAceptacion, neuronaId: string): string {
  const neurona = config.neuronasReconocidas.get(neuronaId);
  return neurona?.alias ?? neuronaId;
}

function neuronaEsReconocida(config: ConfiguracionAceptacion, neuronaId: string): boolean {
  return config.neuronasReconocidas.has(neuronaId);
}

function neuronaAutoAcepta(config: ConfiguracionAceptacion, neuronaId: string): boolean {
  const neurona = config.neuronasReconocidas.get(neuronaId);
  return neurona?.autoAceptar ?? false;
}

export function tipoEnvio(envio: EnvioEntrante): TipoEnvio {
  return envio.tipo;
}

export function decidirAceptacion(envio: EnvioEntrante, config: ConfiguracionAceptacion): ResultadoAceptacion {
  const tamanoFormateado = formatearTamano(envio.tamano);
  const nombreNeurona = obtenerNombreNeurona(config, envio.neuronaOrigen);
  const esReconocida = neuronaEsReconocida(config, envio.neuronaOrigen);
  const autoAceptar = config.autoAceptarNeuronasReconocidas && esReconocida && neuronaAutoAcepta(config, envio.neuronaOrigen);

  const baseDetalles = {
    nombre: envio.nombre,
    tamanoFormateado,
    tipoReal: envio.tipoReal ?? 'desconocido',
    neuronaOrigen: nombreNeurona,
    medio: envio.medio,
  };

  if (envio.tipo === 'archivo') {
    const mensajeBase = `Archivo «${envio.nombre}» (${tamanoFormateado}, ${envio.tipoReal ?? 'tipo desconocido'}) desde ${nombreNeurona} vía ${envio.medio}.`;
    if (autoAceptar) {
      return {
        accion: 'auto-aceptar',
        mensaje: `${mensajeBase} Auto-aceptado (neurona reconocida con auto-aceptar activado).`,
        detalles: { ...baseDetalles },
      };
    }
    return {
      accion: 'pedir',
      mensaje: `${mensajeBase} ¿Aceptar?`,
      detalles: { ...baseDetalles },
    };
  }

  if (envio.tipo === 'carpeta') {
    const cantidad = envio.cantidadArchivos ?? 0;
    const mensajeBase = `Carpeta «${envio.nombre}» (${tamanoFormateado}, ${cantidad} archivos) desde ${nombreNeurona} vía ${envio.medio}.`;
    if (autoAceptar) {
      return {
        accion: 'auto-aceptar',
        mensaje: `${mensajeBase} Auto-aceptada (neurona reconocida con auto-aceptar activado).`,
        detalles: { ...baseDetalles, cantidadArchivos: cantidad },
      };
    }
    return {
      accion: 'pedir',
      mensaje: `${mensajeBase} ¿Aceptar?`,
      detalles: { ...baseDetalles, cantidadArchivos: cantidad },
    };
  }

  if (envio.tipo === 'cerebro') {
    const mensajeBase = `Sincronización de cerebro «${envio.nombre}» (${tamanoFormateado}) desde ${nombreNeurona} vía ${envio.medio}.`;
    if (autoAceptar) {
      return {
        accion: 'auto-aceptar',
        mensaje: `${mensajeBase} Auto-aceptada (neurona reconocida con auto-aceptar activado).`,
        detalles: { ...baseDetalles, esCerebro: true },
      };
    }
    return {
      accion: 'pedir',
      mensaje: `${mensajeBase} ¿Aceptar?`,
      detalles: { ...baseDetalles, esCerebro: true },
    };
  }

  return {
    accion: 'pedir',
    mensaje: `Envío desconocido desde ${nombreNeurona}. ¿Aceptar?`,
    detalles: { ...baseDetalles },
  };
}

export function crearConfiguracionDefecto(): ConfiguracionAceptacion {
  return {
    neuronasReconocidas: new Map(),
    autoAceptarNeuronasReconocidas: false,
  };
}

export function agregarNeuronaReconocida(config: ConfiguracionAceptacion, neurona: NeuronaReconocida): void {
  config.neuronasReconocidas.set(neurona.id, neurona);
}

export function eliminarNeuronaReconocida(config: ConfiguracionAceptacion, neuronaId: string): boolean {
  return config.neuronasReconocidas.delete(neuronaId);
}

export function establecerAutoAceptarGlobal(config: ConfiguracionAceptacion, valor: boolean): void {
  config.autoAceptarNeuronasReconocidas = valor;
}

export function establecerAutoAceptarNeurona(config: ConfiguracionAceptacion, neuronaId: string, valor: boolean): boolean {
  const neurona = config.neuronasReconocidas.get(neuronaId);
  if (!neurona) return false;
  neurona.autoAceptar = valor;
  return true;
}