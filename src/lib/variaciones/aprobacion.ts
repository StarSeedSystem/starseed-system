// src/lib/variaciones/aprobacion.ts

export enum EstadoVariacion {
  BORRADOR = "borrador",
  PROPUESTA = "propuesta",
  APROBADA = "aprobada",
  CAMBIOS = "cambios",
  DESCARTADA = "descartada",
  PUBLICADA = "publicada",
}

export interface MetaVariacion {
  aprobador?: string
  fecha?: string
}

export interface Variacion {
  estado: EstadoVariacion
  meta?: MetaVariacion
  historial?: {estado: EstadoVariacion; meta: MetaVariacion; fecha: string}[]
}

export function crearVariacion(): Variacion {
  const h = new Date().toISOString()
  return {
    estado: EstadoVariacion.BORRADOR,
    meta: {},
    historial: [{estado: EstadoVariacion.BORRADOR, meta: {}, fecha: h}],
  }
}

export function seguirVariacion(
  v: Variacion,
  accion: 'proponer' | 'aprobar' | 'cambiar' | 'descartar' | 'publicar',
  actor?: string
): Variacion {
  const h = new Date().toISOString()
  const nuevo: Variacion = { ...v }
  switch (v.estado) {
    case EstadoVariacion.BORRADOR:
      if (accion !== 'proponer') throw new Error('solo se puede proponer desde borrador')
      nuevo.estado = EstadoVariacion.PROPUESTA
      break
    case EstadoVariacion.PROPUESTA:
      if (accion !== 'aprobar') throw new Error('solo se puede aprobar desde propuesta')
      nuevo.estado = EstadoVariacion.APROBADA
      break
    case EstadoVariacion.APROBADA:
      if (accion === 'cambiar') {
        nuevo.estado = EstadoVariacion.CAMBIOS
      } else if (accion === 'descartar') {
        nuevo.estado = EstadoVariacion.DESCARTADA
      } else if (accion === 'publicar') {
        nuevo.estado = EstadoVariacion.PUBLICADA
      } else {
        throw new Error('acción inválida desde aprobada')
      }
      break
    case EstadoVariacion.CAMBIOS:
      if (accion === 'aprobar') {
        nuevo.estado = EstadoVariacion.APROBADA
      } else if (accion === 'descartar') {
        nuevo.estado = EstadoVariacion.DESCARTADA
      } else if (accion === 'publicar') {
        nuevo.estado = EstadoVariacion.PUBLICADA
      } else {
        throw new Error('acción inválida desde cambios')
      }
      break
    case EstadoVariacion.DESCARTADA:
      if (accion === 'publicar') {
        nuevo.estado = EstadoVariacion.PUBLICADA
      } else {
        throw new Error('solo publicar desde descartada')
      }
      break
    case EstadoVariacion.PUBLICADA:
      throw new Error('no se pueden cambiar estados una vez publicada')
    default:
      throw new Error('estado desconocido')
  }
  if (accion === 'aprobar' || accion === 'descartar' || accion === 'publicar') {
    nuevo.meta = { aprobador: actor ?? v.meta?.aprobador, fecha: h }
  }
  const hist = v.historial ?? []
  nuevo.historial = hist.concat({ estado: nuevo.estado, meta: nuevo.meta ?? {}, fecha: h })
  return nuevo
}
