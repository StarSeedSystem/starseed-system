/**
 * Contrato del mod «puente-de-mando»: lo que el script de la Mac devuelve (ya reducido)
 * y el estado de sesión que dibuja el panel.
 */

export type Pestana = 'pulso' | 'chat' | 'bloqueadas' | 'olas' | 'produccion' | 'servicios' | 'uso'

export type FilaMando = {
  id: string
  titulo: string
  estado?: string | null
  porcentaje?: number | null
  etapa?: string | null
  porque?: string | null
  quien?: string | null
  desde?: string | null
  /** Clases de acción que el Mando ofrece para esta fila (reintentar, descartar…). */
  acciones: string[]
}

export type MedidorMando = {
  clave: string
  titulo?: string | null
  resumen?: string | null
  total: number
  historicas: number
  porcentaje?: number | null
  aviso?: string | null
  cargando?: string | null
  filas: FilaMando[]
}

export type PasoPublicacion = {
  titulo: string
  estado: string
  segundos?: number | null
  detalle?: string | null
}

export type PublicacionMando = {
  head?: string | null
  rama?: string | null
  sinPublicar?: number | null
  archivos?: number | null
  comprobaciones?: Record<string, string | number | null> | null
  titulo?: string | null
  diario: {
    id?: string | null
    estado?: string | null
    nota?: string | null
    empezado?: string | null
    terminado?: string | null
    resumen?: string | null
    pasos: PasoPublicacion[]
  }
  commits: string[]
}

export type ServicioMando = {
  etiqueta: string
  pid: number | null
  salida?: string | number | null
  reiniciable?: boolean | null
}

export type ServidorMando = {
  maquina: {
    host?: string | null
    memLibreMb?: number | null
    memTotalMb?: number | null
    carga?: number[] | null
    uptimeS?: number | null
  }
  despierto?: boolean | null
  enjambre?: { orquestadorVivo?: boolean | null; topeGobernador?: number | null } | null
  tunel?: boolean | null
  servicios: ServicioMando[]
  avisos: string[]
}

export type MensajeMando = {
  id: string
  t: string
  de: string
  canal?: string | null
  tipo?: string | null
  texto: string
}

export type UsoMando = {
  total?: Record<string, number> | null
  limites?: Record<string, string | number | null> | null
}

export type ResumenMando = {
  t: string
  errores: Record<string, string>
  'en-curso'?: MedidorMando
  agentes?: MedidorMando
  bloqueadas?: MedidorMando
  olas?: MedidorMando
  'sin-publicar'?: MedidorMando
  memoria?: MedidorMando
  disco?: MedidorMando
  credito?: MedidorMando
  publicacion?: PublicacionMando
  servidor?: ServidorMando
  chat?: MensajeMando[]
  bandeja?: MensajeMando[]
  uso?: UsoMando
}

/** Acción que espera un segundo clic antes de ir a la Mac. */
export type Confirmacion = { tipo: 'publicar'; nota: string } | { tipo: 'reparar-todas' } | null

declare module 'claude-code' {
  interface PluginState {
    'puente-de-mando': {
      pestana: Pestana
      resumen: ResumenMando | null
      error: string | null
      cargando: boolean
      aviso: string | null
      confirmar: Confirmacion
    }
  }
}
