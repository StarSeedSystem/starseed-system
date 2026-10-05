/**
 * Pruebas del mod con la Mac simulada: el servidor MCP `remote-devices` se contesta desde
 * la prueba con la misma línea `@@MANDO@@{json}` que imprime el script de verdad.
 */
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { codificar, interpretar, ordenMac } from '../hooks/mac'
import { MARCA } from '../hooks/script-mac'
import { lineaEstado, textoReparacion } from '../hooks/texto'
import type { ResumenMando } from '../types'

const RESUMEN: ResumenMando = {
  t: '2026-10-05 01:00:00',
  errores: {},
  'en-curso': {
    clave: 'en-curso', titulo: 'Tareas en curso', resumen: '5 en marcha · 11 agente(s) sobre ellas', total: 5, historicas: 0,
    porcentaje: 17, filas: [{ id: 'BLQ1005A', titulo: 'Bloqueadas · reintento inteligente', estado: 'escribiendo', porcentaje: 33, etapa: 'escribiendo', acciones: [] }],
  },
  agentes: { clave: 'agentes', resumen: '11 escribiendo', total: 11, historicas: 0, filas: [] },
  bloqueadas: {
    clave: 'bloqueadas', titulo: 'Bloqueadas', resumen: '2 bloqueadas', total: 3, historicas: 5,
    filas: [
      { id: 'CU3br', titulo: 'Ajustes del Mando', estado: 'bloqueada sin salida', porque: 'la nube la intentó 82 veces sin integrarla. Repetirla igual no sirve: «Reintentar con un cambio» en Bloqueadas', acciones: ['descartar', 'reintentar', 'reintentar-auto'] },
      { id: 'CAMR1005F', titulo: 'CAMR · bucle autónomo', estado: 'bloqueada sin salida', porque: 'espera a 3 tarea(s) que NO EXISTEN: este bloqueo no se resuelve nunca', acciones: ['descartar', 'reintentar', 'reintentar-auto'] },
      { id: 'DIS1005N', titulo: 'Diseño · pruebas', estado: 'esperando', porque: 'espera a DIS1005M', acciones: [] },
    ],
  },
  publicacion: {
    head: '73dd5eb4', sinPublicar: 58, commits: [],
    diario: { id: '20261005-005224', estado: 'corriendo', pasos: [
      { titulo: 'Tipos (tsc --noEmit)', estado: 'ok' },
      { titulo: 'Pruebas del OS (vitest)', estado: 'corriendo' },
    ] },
  },
  servidor: {
    maquina: { host: 'maggasukha.local', memLibreMb: 400, memTotalMb: 8192, carga: [3, 2, 1] },
    enjambre: { orquestadorVivo: true, topeGobernador: 3 },
    servicios: [{ etiqueta: 'mando', pid: 42 }, { etiqueta: 'gobernador', pid: null }],
    avisos: [],
  },
  chat: [{ id: 'md-1', t: '2026-10-05T00:50:00Z', de: 'alex', canal: 'mando', texto: 'arregla las publicaciones' }],
  bandeja: [],
  uso: { total: { turnos: 138, total: 12674634, relectura_pct: 89.6 }, limites: { umbral_pct: 90 } },
}

type Llamada = { accion: string; datos: unknown }

const PROPS_PANEL = {
  title: 'Puente de Mando', isFocused: true, bodyColumns: 100, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {},
}

/** Monta la Mac falsa y todo lo que el motor pondría debajo del mod. */
function mundo(on: On, respuesta: (accion: string, datos: unknown) => unknown) {
  const llamadas: Llamada[] = []
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__puente-de-mando__${e.name}` } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isOpen: true } }) as never)
  on('mcp.call', ($, e) => {
    const orden = String(e.args.command ?? '')
    const m = orden.match(/python3 - ([a-z]+) '([^']*)'/)
    const accion = m?.[1] ?? '?'
    const datos = JSON.parse(decodeURIComponent(m?.[2] ?? '%7B%7D'))
    llamadas.push({ accion, datos })
    const texto = `Process started with PID 1 (shell: /bin/zsh)\nInitial output:\n${MARCA}${JSON.stringify({ ok: true, datos: respuesta(accion, datos) })}\n`
    return { value: { content: [{ type: 'text' as const, text: texto }], isError: false } }
  })
  return llamadas
}

test('la orden viaja con el script entero y un argumento seguro entre comillas', () => {
  const orden = ordenMac('decir', { texto: "l'ola (1) ¡ya! *" })
  expect(orden.startsWith("cd ~ && python3 - decir '")).toBe(true)
  expect(orden.includes("<<'PYEOF_MANDO'\n")).toBe(true)
  expect(orden.trimEnd().endsWith('PYEOF_MANDO')).toBe(true)
  expect(codificar({ texto: "l'ola (1) ¡ya! *" })).toMatch(/^[A-Za-z0-9%._~-]+$/)
  expect(JSON.parse(decodeURIComponent(codificar({ a: "x'y" })))).toEqual({ a: "x'y" })
})

test('interpretar: marca, Mac caída y respuesta cortada', () => {
  const bien = interpretar<{ n: number }>(`ruido\n${MARCA}{"ok":true,"datos":{"n":3}}\n`, false)
  expect(bien).toEqual({ ok: true, datos: { n: 3 } })
  const caida = interpretar("Device 'maggasukha-local' did not respond within 60s.", true)
  expect(caida.ok).toBe(false)
  expect(!caida.ok && caida.error.includes('no responde')).toBe(true)
  const cortada = interpretar(`${MARCA}{"ok":tr`, false)
  expect(!cortada.ok && cortada.error.includes('cortada')).toBe(true)
})

test('textoReparacion entiende la respuesta de hoy de /api/mando/reintentar', () => {
  const t = textoReparacion({ reintentadas: ['CAMR1005Fb'], descartadas: [], esperando: [{ id: 'DIS1005N', motivo: 'espera a DIS1005M' }] })
  expect(t).toContain('Reparadas: CAMR1005Fb')
  expect(t).toContain('DIS1005N (espera a DIS1005M)')
})

test('la línea de estado cuenta en curso, agentes, bloqueadas reparables y la publicación', () => {
  expect(lineaEstado(RESUMEN, null)).toBe('⟁ Mando · 5 en curso · 11 agentes · 1/3 bloq · pub corriendo: Pruebas del OS (vitest)')
  expect(lineaEstado(null, 'sin enlace')).toBe('⟁ Mando · sin enlace')
})

test('la herramienta estado lee la Mac y resume', async ($, on) => {
  const llamadas = mundo(on, accion => (accion === 'resumen' ? RESUMEN : null))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__puente-de-mando__estado' })
  expect(r.deny).toBeUndefined()
  const texto = String(r.result)
  expect(texto).toContain('En curso: 5 en marcha')
  expect(texto).toContain('1 reparable(s)')
  expect(texto).toContain('Publicación 20261005-005224: corriendo')
  expect(llamadas.some(l => l.accion === 'resumen')).toBe(true)
})

test('la herramienta reparar manda los ids con reparación automática', async ($, on) => {
  const llamadas = mundo(on, accion =>
    accion === 'reparar' ? { reintentadas: ['CAMR1005Fb'], descartadas: [], esperando: [] } : RESUMEN,
  )
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__puente-de-mando__reparar', ids: ['CU3br'] })
  expect(String(r.result)).toContain('Reparadas: CAMR1005Fb')
  expect(llamadas.find(l => l.accion === 'reparar')?.datos).toEqual({ ids: ['CU3br'] })
})

test('el panel: pestañas, Reparar por fila y «reparar todas» a dos clics, en terminal y escritorio', async ($, on) => {
  const llamadas = mundo(on, accion =>
    accion === 'reparar' ? { reintentadas: ['CAMR1005Fb'], descartadas: [], esperando: [] } : RESUMEN,
  )
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__puente-de-mando__estado' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'puente-de-mando',
      surface,
      component: 'Pane',
      requestId: 'puente-de-mando',
      props: PROPS_PANEL,
    })
    expect(await ui.find({ type: 'Text', text: /5 en marcha/ })).toBeDefined()
    await ui.press({ key: 'pestana:bloqueadas' })
    expect(await ui.find({ key: 'reparar:CU3br' })).toBeDefined()
    expect(await ui.find({ key: 'reparar:CAMR1005F' })).toBeUndefined()
    expect(await ui.find({ key: 'reparar:DIS1005N' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'dependencia fuera de progreso' })).toBeDefined()
    await ui.press({ key: 'reparar:CU3br' })
    expect(await ui.find({ type: 'Text', text: /Reparadas: CAMR1005Fb/ })).toBeDefined()
    const antes = llamadas.filter(l => l.accion === 'reparar').length
    await ui.press({ key: 'reparar-todas' })
    expect(llamadas.filter(l => l.accion === 'reparar').length).toBe(antes)
    await ui.press({ key: 'confirmar-reparar' })
    expect(llamadas.filter(l => l.accion === 'reparar').length).toBe(antes + 1)
    await ui.press({ key: 'pestana:pulso' })
    await ui.unmount()
  }
})

test('producción a dos pasos y chat al Director', async ($, on) => {
  const quieta: ResumenMando = { ...RESUMEN, publicacion: { ...RESUMEN.publicacion!, diario: { ...RESUMEN.publicacion!.diario, estado: 'ok' } } }
  const llamadas = mundo(on, accion => (accion === 'resumen' ? quieta : accion === 'publicar' ? { lanzado: true } : { ok: true }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__puente-de-mando__estado' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'puente-de-mando', surface, component: 'Pane', requestId: 'puente-de-mando',
      props: PROPS_PANEL,
    })
    await ui.press({ key: 'pestana:produccion' })
    await ui.input({ key: 'nota', text: 'corta' })
    expect(await ui.find({ key: 'confirmar-publicar' })).toBeUndefined()
    const antes = llamadas.filter(l => l.accion === 'publicar').length
    await ui.input({ key: 'nota', text: 'reintento tras arreglar vitest' })
    expect(llamadas.filter(l => l.accion === 'publicar').length).toBe(antes)
    await ui.press({ key: 'confirmar-publicar' })
    expect(llamadas.filter(l => l.accion === 'publicar').length).toBe(antes + 1)
    expect(llamadas.filter(l => l.accion === 'publicar').at(-1)?.datos).toEqual({ nota: 'reintento tras arreglar vitest' })
    await ui.press({ key: 'pestana:chat' })
    await ui.input({ key: 'chat', text: 'hola flota' })
    expect(llamadas.filter(l => l.accion === 'decir').at(-1)?.datos).toEqual({ texto: 'hola flota' })
    await ui.unmount()
  }
})

test('con una publicación en marcha no hay campo para lanzar otra', async ($, on) => {
  mundo(on, () => RESUMEN)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__puente-de-mando__estado' })
  const ui = await $.ui.mount({ plugin: 'puente-de-mando', surface: 'terminal', component: 'Pane', requestId: 'puente-de-mando', props: PROPS_PANEL })
  await ui.press({ key: 'pestana:produccion' })
  expect(await ui.find({ key: 'nota' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /publicación en marcha/ })).toBeDefined()
  await ui.unmount()
})

test('sin el enlace remote-devices (Claude Code en la propia Mac) corre el script en local', async ($, on) => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__puente-de-mando__${e.name}` } }))
  on('ui.status', () => ({ value: undefined }))
  const vistos: string[][] = []
  on('process.run', ($, e) => {
    vistos.push([...e.argv])
    return { value: { exitCode: 0, stdout: `${MARCA}${JSON.stringify({ ok: true, datos: RESUMEN })}\n`, stderr: '' } } as never
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__puente-de-mando__estado' })
  expect(String(r.result)).toContain('En curso: 5 en marcha')
  expect(vistos[0]?.slice(0, 3)).toEqual(['python3', '-', 'resumen'])
})

test('un paso «falla» de la publicación cuenta como fallo', () => {
  const p = { ...RESUMEN.publicacion!, diario: { ...RESUMEN.publicacion!.diario, estado: 'fallo', pasos: [{ titulo: 'Pruebas del OS (vitest)', estado: 'falla', detalle: 'FAIL catalogo' }] } }
  expect(lineaEstado({ ...RESUMEN, publicacion: p }, null)).toContain('pub fallo en «Pruebas del OS (vitest)»')
})
