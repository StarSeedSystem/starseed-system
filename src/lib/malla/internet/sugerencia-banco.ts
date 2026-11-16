import { EstadoConexion, FuenteLimitada } from './tipos';

export const NEGATIVA_HORAS = 24;

export type Negativa = {
  en: number;
  conexion: string;
} | null;

export type EntradaSugerencia = {
  estado: EstadoConexion;
  fuente: FuenteLimitada;
  bancoActivo: boolean;
  compartirConOtros: boolean;
  negativa: Negativa;
  ahora: number;
  clave: string;
};

export type ResultadoSugerencia = {
  sugerir: boolean;
  motivo: string;
};

export function registrarNegativa(ahora: number, clave: string): Negativa {
  return { en: ahora, conexion: clave };
}

export function debeSugerir(entrada: EntradaSugerencia): ResultadoSugerencia {
  const { estado, bancoActivo, compartirConOtros, negativa, ahora, clave } = entrada;

  if (estado !== 'limitada') {
    const motivo = estado === 'desconocida'
      ? 'La conexión es desconocida, no se puede sugerir el modo banco'
      : 'La conexión no es limitada, no se sugiere el modo banco';
    return { sugerir: false, motivo };
  }

  if (bancoActivo) {
    return { sugerir: false, motivo: 'El modo banco ya está activo' };
  }

  if (negativa !== null) {
    const horasPasadas = (ahora - negativa.en) / (1000 * 60 * 60);
    const mismaClave = negativa.conexion === clave;

    if (mismaClave && horasPasadas < NEGATIVA_HORAS) {
      return {
        sugerir: false,
        motivo: 'La persona dijo «Ahora no» hace menos de 24 horas para esta conexión',
      };
    }
  }

  let motivo = 'Se detectó una conexión limitada. Se sugiere activar el modo banco para gestionar mejor los datos.';
  if (!compartirConOtros) {
    motivo += ' (Compartir está desactivado; el modo banco permite activar compartir de forma segura después)';
  }

  return { sugerir: true, motivo };
}