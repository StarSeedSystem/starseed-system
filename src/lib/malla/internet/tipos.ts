export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const Audiencia = ['mi-cuenta', 'entidad', 'publico'] as const;
export type Audiencia = typeof Audiencia[number];

export const FuenteLimitada = ['declarada', 'nativa', 'navegador', 'ninguna'] as const;
export type FuenteLimitada = typeof FuenteLimitada[number];

export const EstadoConexion = ['limitada', 'no-limitada', 'desconocida'] as const;
export type EstadoConexion = typeof EstadoConexion[number];

export interface VentanaBanco {
  desde: string;
  hasta: string;
  horaDesde: string;
  horaHasta: string;
  limiteMb: number;
}

export interface AjustesBanco {
  activo: boolean;
  modo: 'diario' | 'programado';
  diarioMb: number;
  ventanas: VentanaBanco[];
}

export interface AjustesAudiencia {
  mesh: boolean;
  limiteMeshMb: number | null;
}

export interface AjustesInternet {
  version: 1;
  compartirConOtros: boolean;
  banco: AjustesBanco;
  porAudiencia: Record<Audiencia, AjustesAudiencia>;
  declaraLimitada: boolean | null;
  compartirMedidas: boolean;
}

export const TextosInternet = {
  bancoTitulo: 'Modo banco',
  bancoAyuda: 'Raciona los datos por día o por programación horaria',
  racionDiaria: 'Ración diaria',
  programacion: 'Programación',
  mb: 'MB',
  gb: 'GB',
  quedaHoy: (mb: number): string => `Quedan ${mb.toLocaleString()} MB hoy`,
  agotadoHoy: 'Agotado hoy',
  meshTitulo: 'Compartir por malla',
  meshAyuda: 'Permite compartir internet por la red mesh P2P',
  meshSinLimite: 'Sin límite',
  meshConLimite: (mb: number): string => `${mb.toLocaleString()} MB disponibles`,
  conexionLimitada: 'Limitada',
  conexionNoLimitada: 'No limitada',
  conexionDesconocida: 'Sin datos',
  fuenteDeclarada: 'Declarada por la persona',
  fuenteNativa: 'Marca de red del dispositivo',
  fuenteNavegador: 'Información del navegador',
  sugerirTitulo: 'Conexión limitada detectada',
  sugerirCuerpo: 'Se ha detectado que tu conexión a internet es limitada. Considera activar el modo banco para gestionar mejor los datos.',
  sugerirActivar: 'Activar modo banco',
  sugerirAhoraNo: 'Ahora no',
  audMiCuenta: 'Neuronas de mi cuenta',
  audEntidad: 'Miembros de una entidad',
  audPublico: 'Público',
};