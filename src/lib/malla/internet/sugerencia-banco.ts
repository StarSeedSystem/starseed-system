import type { EstadoConexion, FuenteLimitada } from './tipos';

export const NEGATIVA_HORAS = 24;

export interface Negativa {
  en: number;
  conexion: string;
}

export interface EntradaSugerencia {
  estado: EstadoConexion;
  fuente: FuenteLimitada;
  bancoActivo: boolean;
  compartirConOtros: boolean;
  negativa: Negativa | null;
  ahora: number;
  clave: string;
}

export interface ResultadoSugerencia {
  sugerir: boolean;
  motivo: string;
}

export function debeSugerir(entrada: EntradaSugerencia): ResultadoSugerencia {
  if (entrada.bancoActivo) {
    return { sugerir: false, motivo: 'Banco ya está activo' };
  }

  if (entrada.estado !== 'limitada') {
    return { sugerir: false, motivo: 'Conexión no es limitada' };
  }

  if (entrada.negativa !== null) {
    const haceMs = entrada.ahora - entrada.negativa.en;
    const haceHoras = haceMs / (1000 * 60 * 60);
    const mismaClave = entrada.negativa.conexion === entrada.clave;

    if (haceHoras < NEGATIVA_HORAS && mismaClave) {
      return { sugerir: false, motivo: 'Persona dijo "Ahora no" hace menos de 24 h' };
    }
  }

  return {
      sugerir: true,
      motivo: entrada.compartirConOtros
        ? 'Conexión limitada sin banco activo'
        : 'Conexión limitada; el banco es la forma segura de compartir',
    };
}

export function registrarNegativa(ahora: number, clave: string): Negativa {
  return { en: ahora, conexion: clave };
}