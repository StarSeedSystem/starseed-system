/**
 * Formateo puro (sin `$`): del resumen de la Mac al texto de la línea de estado, de las
 * herramientas del modelo y de los atajos del panel. Se prueba sin enlace.
 */
import type { FilaMando, MedidorMando, MensajeMando, PublicacionMando, ResumenMando, ServidorMando } from '../types'

export const PESTANAS = [
  { id: 'pulso', titulo: 'Pulso', tecla: '1' },
  { id: 'chat', titulo: 'Chat Director', tecla: '2' },
  { id: 'bloqueadas', titulo: 'Bloqueadas', tecla: '3' },
  { id: 'olas', titulo: 'Olas', tecla: '4' },
  { id: 'produccion', titulo: 'Producción', tecla: '5' },
  { id: 'servicios', titulo: 'Servicios', tecla: '6' },
  { id: 'uso', titulo: 'Uso', tecla: '7' },
] as const

/** Medidores del Mando que la herramienta `medidor` acepta. */
export const CLAVES_MEDIDOR = [
  'en-curso', 'agentes', 'listas', 'bloqueadas', 'sin-publicar', 'proveedores', 'contenedores',
  'tokens', 'integradas', 'memoria', 'disco', 'ola-activa', 'credito-claude', 'creditos',
] as const

/** ¿La fila espera a otra tarea? Entonces se arregla la dependencia, no esta. */
export function esperaDependencia(f: FilaMando): boolean {
  return /espera a \d+ tarea/i.test(f.porque ?? '')
}

/**
 * Una fila de bloqueadas se puede reparar si el Mando ofrece reintentarla Y su causa es suya
 * (la nube la intentó y no la integró, la rechazaron, no tocó sus archivos). Si espera a otra
 * tarea, reencolarla solo crearía un duplicado que seguiría esperando.
 */
export function reparable(f: FilaMando): boolean {
  const ofrece = f.acciones.includes('reintentar') || f.acciones.includes('reintentar-auto')
  return ofrece && !esperaDependencia(f)
}

/** Etiqueta corta de por qué una fila no lleva «Reparar». */
export function porQueNoSeRepara(f: FilaMando): string {
  const p = (f.porque ?? '').toLowerCase()
  if (p.includes('siguen vivas')) return 'espera normal'
  if (p.includes('no existen')) return 'dependencia fuera de progreso'
  if (p.includes('no se van a integrar')) return 'repara su dependencia'
  return 'espera'
}

/** Estados de un paso de publicación que cuentan como fallo («falla», «fallo», «error»). */
export function esFallo(estado: string | null | undefined): boolean {
  return /^(fall|error)/i.test(estado ?? '')
}

/** Estados de fallo o bloqueo que «Reparar todas las que sirvan» procesa. */
export function filasReparables(m: MedidorMando | undefined): FilaMando[] {
  return (m?.filas ?? []).filter(reparable)
}

export function paso(p: PublicacionMando | undefined): string {
  if (!p) return 'sin dato'
  const d = p.diario
  const vivo = d.pasos.find(x => x.estado === 'corriendo')
  const fallo = d.pasos.find(x => esFallo(x.estado))
  if (d.estado === 'corriendo') return `corriendo${vivo ? ': ' + vivo.titulo : ''}`
  if (fallo) return `${d.estado ?? 'fallo'} en «${fallo.titulo}»`
  return d.estado ?? 'sin publicación reciente'
}

export function lineaEstado(r: ResumenMando | null, error: string | null): string | undefined {
  if (!r) return error ? '⟁ Mando · sin enlace' : undefined
  const n = (m?: MedidorMando) => (m ? String(m.total) : '?')
  const partes = [
    `${n(r['en-curso'])} en curso`,
    `${n(r.agentes)} agentes`,
    `${filasReparables(r.bloqueadas).length}/${n(r.bloqueadas)} bloq`,
    `pub ${paso(r.publicacion)}`,
  ]
  if ((r.bandeja?.length ?? 0) > 0) partes.push(`✉ ${r.bandeja!.length}`)
  return `⟁ Mando · ${partes.join(' · ')}${error ? ' · ⚠' : ''}`
}

function lineaMedidor(nombre: string, m?: MedidorMando): string {
  if (!m) return `${nombre}: sin dato`
  const pct = typeof m.porcentaje === 'number' ? ` (${m.porcentaje} %)` : ''
  return `${nombre}: ${m.resumen || m.total}${pct}${m.aviso ? ` · ⚠ ${m.aviso}` : ''}`
}

export function textoFila(f: FilaMando): string {
  const pct = typeof f.porcentaje === 'number' ? ` ${f.porcentaje} %` : ''
  const etapa = f.etapa ? ` · ${f.etapa}` : ''
  const quien = f.quien ? ` · ${f.quien}` : ''
  const porque = f.porque ? `\n    ${f.porque}` : ''
  return `- ${f.id} [${f.estado ?? '?'}${pct}${etapa}${quien}] ${f.titulo}${porque}`
}

export function textoServidor(s?: ServidorMando): string {
  if (!s) return 'Servicios: sin dato'
  const vivos = s.servicios.filter(x => x.pid !== null)
  const parados = s.servicios.filter(x => x.pid === null).map(x => x.etiqueta)
  const m = s.maquina
  const carga = m.carga?.length ? m.carga.map(x => x.toFixed(1)).join(' / ') : '?'
  return [
    `Servicios: ${vivos.length} vivos${parados.length ? ` · parados: ${parados.join(', ')}` : ''}`,
    `Mac ${m.host ?? ''}: ${m.memLibreMb ?? '?'} MB libres de ${m.memTotalMb ?? '?'} · carga ${carga} · enjambre ${s.enjambre?.orquestadorVivo ? 'vivo' : 'parado'} (tope ${s.enjambre?.topeGobernador ?? '?'})`,
    ...s.avisos.map(a => `⚠ ${a}`),
  ].join('\n')
}

export function textoMensaje(m: MensajeMando): string {
  const hora = (m.t || '').replace('T', ' ').slice(5, 16)
  return `[${hora}] ${m.de}${m.canal && m.canal !== 'mando' ? ` → ${m.canal}` : ''}: ${m.texto}`
}

export function textoPublicacion(p?: PublicacionMando): string {
  if (!p) return 'Publicación: sin dato'
  const d = p.diario
  const pasos = d.pasos.map(x => `  ${x.estado === 'ok' ? '✓' : x.estado === 'corriendo' ? '…' : esFallo(x.estado) ? '✗' : '·'} ${x.titulo} (${x.estado})${x.detalle ? `\n      ${x.detalle}` : ''}`)
  return [
    `Publicación ${d.id ?? ''}: ${d.estado ?? '?'} · HEAD ${p.head ?? '?'} · ${p.sinPublicar ?? '?'} commit(s) sin publicar`,
    d.nota ? `  nota: ${d.nota}` : '',
    d.resumen ? `  ${d.resumen}` : '',
    ...pasos,
  ].filter(Boolean).join('\n')
}

/** Resumen completo para la herramienta `estado` y para `/mando-estado`. */
export function textoResumen(r: ResumenMando): string {
  const reparables = filasReparables(r.bloqueadas)
  const partes = [
    `Puente de Mando · datos de la Mac a las ${r.t}`,
    lineaMedidor('En curso', r['en-curso']),
    lineaMedidor('Agentes', r.agentes),
    lineaMedidor('Bloqueadas', r.bloqueadas) + ` · ${reparables.length} reparable(s)`,
    lineaMedidor('Olas', r.olas),
    lineaMedidor('Sin publicar', r['sin-publicar']),
    lineaMedidor('Crédito Claude', r.credito),
    lineaMedidor('Créditos de pago', r.creditos),
    textoPublicacion(r.publicacion),
    textoServidor(r.servidor),
    `Bandeja de claude-cowork: ${r.bandeja?.length ?? 0} pendiente(s)`,
    ...(r.bandeja ?? []).map(m => '  ' + textoMensaje(m)),
  ]
  const errores = Object.entries(r.errores ?? {})
  if (errores.length) partes.push('Secciones que no llegaron: ' + errores.map(([k, v]) => `${k} (${v})`).join('; '))
  return partes.join('\n')
}

export function textoMedidor(m: MedidorMando): string {
  return [
    `${m.titulo ?? m.clave}: ${m.resumen ?? ''}`,
    m.aviso ? `⚠ ${m.aviso}` : '',
    m.cargando ? `… ${m.cargando}` : '',
    ...m.filas.map(textoFila),
    m.historicas ? `(${m.historicas} de olas cerradas, no listadas)` : '',
  ].filter(Boolean).join('\n')
}

/** El resultado de `/api/mando/reintentar`, sea de la versión de hoy o la de BLQ1005A. */
export function textoReparacion(r: unknown): string {
  if (!r || typeof r !== 'object') return 'Reparación enviada.'
  const o = r as Record<string, unknown>
  // Forma de hoy: { reintentadas: string[], descartadas: [{id, motivo}], esperando: [{id, motivo}] }.
  if (Array.isArray(o.reintentadas) || Array.isArray(o.descartadas) || Array.isArray(o.esperando)) {
    const conMotivo = (xs: unknown) =>
      (Array.isArray(xs) ? xs : []).map(x => {
        const y = (x ?? {}) as Record<string, unknown>
        return typeof x === 'string' ? x : `${String(y.id ?? '?')} (${String(y.motivo ?? '')})`
      })
    const re = conMotivo(o.reintentadas)
    const de = conMotivo(o.descartadas)
    const es = conMotivo(o.esperando)
    return [
      `Reparadas: ${re.length ? re.join(', ') : 'ninguna'}`,
      es.length ? `Esperando: ${es.join('; ')}` : '',
      de.length ? `Descartadas: ${de.join('; ')}` : '',
    ].filter(Boolean).join('\n')
  }
  const lista = (o.resultados ?? o.tareas ?? o.items) as unknown
  if (Array.isArray(lista) && lista.length) {
    return lista
      .slice(0, 30)
      .map(x => {
        if (!x || typeof x !== 'object') return `- ${String(x)}`
        const y = x as Record<string, unknown>
        const id = y.id ?? y.tarea ?? '?'
        const que = y.resultado ?? y.accion ?? y.estado ?? y.motivo ?? ''
        const nuevo = y.nuevo ?? y.sucesor ?? y.reintento ?? ''
        return `- ${String(id)}: ${String(que)}${nuevo ? ` → ${String(nuevo)}` : ''}`
      })
      .join('\n')
  }
  const breve = JSON.stringify(r)
  return breve.length > 1200 ? breve.slice(0, 1199) + '…' : breve
}
