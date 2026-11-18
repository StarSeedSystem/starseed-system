import { TextosInternet } from './tipos';

function formatearMbGb(mb: number): string {
  if (mb < 1000) {
    return `${mb.toLocaleString('es-ES')} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace('.', ',')} GB`;
}

export const TEXTOS_INTERNET: typeof TextosInternet = {
  bancoTitulo: 'Modo banco',
  bancoAyuda: 'Sirve para cuando el internet es limitado y se reparte una cantidad de datos entre las neuronas',
  racionDiaria: 'Ración diaria',
  programacion: 'Programación',
  mb: 'MB',
  gb: 'GB',
  quedaHoy: (mb: number): string => `Quedan ${formatearMbGb(mb)} hoy`,
  agotadoHoy: 'Agotado hoy',
  meshTitulo: 'Modo mesh',
  meshAyuda: 'Comparte internet por la malla P2P, con o sin límite',
  meshSinLimite: 'Sin límite',
  meshConLimite: (mb: number): string => `${formatearMbGb(mb)} disponibles`,
  conexionLimitada: 'Limitada',
  conexionNoLimitada: 'No limitada',
  conexionDesconocida: 'Sin datos',
  fuenteDeclarada: 'Declarada por la persona',
  fuenteNativa: 'Marca de red del dispositivo',
  fuenteNavegador: 'Información del navegador',
  sugerirTitulo: 'Conexión limitada detectada',
  sugerirCuerpo: 'La conexión parece de pago. Es solo una sugerencia y nada cambia hasta que la persona acepte.',
  sugerirActivar: 'Activar modo banco',
  sugerirAhoraNo: 'Ahora no',
  audMiCuenta: 'Neuronas de mi cuenta',
  audEntidad: 'Miembros de una entidad',
  audPublico: 'Público',
};

export const TEXTOS_EXTRA_INTERNET = {
  desde: 'Desde',
  hasta: 'Hasta',
  limite: 'Límite',
  compartirConOtros: 'Compartir con otros',
  declararDePago: 'Declarar conexión de pago',
  declararNoDePago: 'Declarar conexión no de pago',
} as const;