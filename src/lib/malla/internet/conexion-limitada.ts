import { EstadoConexion, FuenteLimitada } from './tipos';

type EntradaClasificacion = {
  declarada?: boolean | null;
  nativaMedida?: boolean | null;
  tipo?: string;
  saveData?: boolean;
  effectiveType?: string;
};

type ResultadoClasificacion = {
  estado: EstadoConexion;
  fuente: FuenteLimitada;
  motivo: string;
};

export function clasificarConexion(entrada: EntradaClasificacion): ResultadoClasificacion {
  if (entrada.declarada !== null && entrada.declarada !== undefined) {
    if (entrada.declarada === true) {
      return {
        estado: 'limitada',
        fuente: 'declarada',
        motivo: 'La persona declaró que es conexión limitada',
      };
    }
    if (entrada.declarada === false) {
      return {
        estado: 'no-limitada',
        fuente: 'declarada',
        motivo: 'La persona declaró que la conexión no es limitada',
      };
    }
  }

  if (entrada.nativaMedida !== null && entrada.nativaMedida !== undefined) {
    if (entrada.nativaMedida === true) {
      return {
        estado: 'limitada',
        fuente: 'nativa',
        motivo: 'La marca de red indica conexión limitada',
      };
    }
    if (entrada.nativaMedida === false) {
      return {
        estado: 'no-limitada',
        fuente: 'nativa',
        motivo: 'La marca de red indica conexión no limitada',
      };
    }
  }

  const tipo = entrada.tipo;
  const saveData = entrada.saveData;
  const effectiveType = entrada.effectiveType;

  const tiposLimitados = ['cellular'];
  const tiposNoLimitados = ['wifi', 'ethernet'];
  const tiposLimitadosEf = ['slow-2g', '2g'];

  if (tipo !== undefined && tipo !== null) {
    if (tiposLimitados.includes(tipo)) {
      return {
        estado: 'limitada',
        fuente: 'navegador',
        motivo: 'El tipo de conexión indica limitación (celular)',
      };
    }
    if (tiposNoLimitados.includes(tipo)) {
      if (saveData === true) {
        return {
          estado: 'limitada',
          fuente: 'navegador',
          motivo: 'Modo ahorro de datos activado',
        };
      }
      return {
        estado: 'no-limitada',
        fuente: 'navegador',
        motivo: 'Conexión por WiFi o Ethernet',
      };
    }
  }

  if (saveData === true) {
    return {
      estado: 'limitada',
      fuente: 'navegador',
      motivo: 'Modo ahorro de datos activado',
    };
  }

  if (effectiveType !== undefined && effectiveType !== null) {
    if (tiposLimitadosEf.includes(effectiveType)) {
      return {
        estado: 'limitada',
        fuente: 'navegador',
        motivo: 'Tipo de conectividad efectiva es 2G',
      };
    }
  }

  return {
    estado: 'desconocida',
    fuente: 'ninguna',
    motivo: 'No hay señal suficiente para determinar si la conexión es limitada',
  };
}