export type TextosInternet = {
  bancoTitulo: string;
  bancoAyuda: string;
  racionDiaria: string;
  programacion: string;
  mb: string;
  gb: string;
  quedaHoy: (mb: number) => string;
  agotadoHoy: string;
  meshTitulo: string;
  meshAyuda: string;
  meshSinLimite: string;
  meshConLimite: (mb: number) => string;
  conexionLimitada: string;
  conexionNoLimitada: string;
  conexionDesconocida: string;
  fuenteDeclarada: string;
  fuenteNativa: string;
  fuenteNavegador: string;
  sugerirTitulo: string;
  sugerirCuerpo: string;
  sugerirActivar: string;
  sugerirAhoraNo: string;
  audMiCuenta: string;
  audEntidad: string;
  audPublico: string;
};

function formatearMb(mb: number): string {
  if (mb < 1000) {
    return `${mb.toLocaleString('es-ES')} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
}

export const TEXTOS_INTERNET: TextosInternet = {
  bancoTitulo: 'Modo banco',
  bancoAyuda: 'Sirve para cuando el internet es limitado y se reparte una cantidad de datos entre las neuronas',
  racionDiaria: 'Ración diaria',
  programacion: 'Programación',
  mb: 'MB',
  gb: 'GB',
  quedaHoy: (mb: number) => `Quedan ${formatearMb(mb)} hoy`,
  agotadoHoy: 'Agotado hoy',
  meshTitulo: 'Modo mesh',
  meshAyuda: 'Comparte internet por la malla P2P, con o sin límite',
  meshSinLimite: 'Sin límite',
  meshConLimite: (mb: number) => `${formatearMb(mb)} disponibles`,
  conexionLimitada: 'Limitada',
  conexionNoLimitada: 'No limitada',
  conexionDesconocida: 'Sin datos',
  fuenteDeclarada: 'Declarada por la persona',
  fuenteNativa: 'Marca de red del dispositivo',
  fuenteNavegador: 'Información del navegador',
  sugerirTitulo: 'Conexión limitada detectada',
  sugerirCuerpo: 'La conexión parece de pago, es solo una sugerencia y nada cambia hasta que la persona acepte.',
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
  declararDePago: 'Declarar como de pago',
  declararNoDePago: 'Declarar como no de pago',
} as const;