function formatearMB(mb: number): string {
  if (mb < 1000) {
    return `${mb} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace('.', ',')} GB`;
}

export function quedaHoy(mb: number): string {
  return `Quedan ${formatearMB(mb)} hoy`;
}

export function meshConLimite(mb: number): string {
  return `${formatearMB(mb)} disponibles`;
}

export const TEXTOS_INTERNET = {
  bancoTitulo: 'Modo banco',
  bancoAyuda: 'Raciona los datos cuando el internet es limitado y se reparte una cantidad entre las neuronas',
  racionDiaria: 'Ración diaria',
  programacion: 'Programación',
  mb: 'MB',
  gb: 'GB',
  quedaHoy,
  agotadoHoy: 'Agotado hoy',
  meshTitulo: 'Modo mesh',
  meshAyuda: 'Comparte internet por la malla P2P, con o sin límite',
  meshSinLimite: 'Sin límite',
  meshConLimite,
  conexionLimitada: 'Limitada',
  conexionNoLimitada: 'No limitada',
  conexionDesconocida: 'Sin datos',
  fuenteDeclarada: 'Declarada por la persona',
  fuenteNativa: 'Marca de red del dispositivo',
  fuenteNavegador: 'Información del navegador',
  sugerirTitulo: 'Conexión limitada detectada',
  sugerirCuerpo: 'Se ha detectado que tu conexión a internet es de pago. Es solo una sugerencia: nada cambia hasta que la aceptes.',
  sugerirActivar: 'Activar modo banco',
  sugerirAhoraNo: 'Ahora no',
  audMiCuenta: 'Neuronas de mi cuenta',
  audEntidad: 'Miembros de una entidad',
  audPublico: 'Público',
} as const;

export const TEXTOS_EXTRA_INTERNET = {
  desde: 'Desde',
  hasta: 'Hasta',
  limite: 'Límite',
  compartirConOtros: 'Compartir con otros',
  declararDePago: 'Declarar conexión de pago',
  declararNoDePago: 'Declarar conexión no de pago',
} as const;