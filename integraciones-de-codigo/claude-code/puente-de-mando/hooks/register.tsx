/**
 * Genesis de StarSeed OS dentro de Claude Code.
 *
 * QUÉ: un panel con siete pestañas (Pulso, Chat Director, Bloqueadas con Reparar, Olas,
 * Producción, Servicios y Uso), la orden `/mando`, una línea de estado viva y seis
 * herramientas para el modelo (estado, medidor, reparar, chat, informar, publicar).
 * POR QUÉ: Alex dirige la flota desde Genesis del navegador; desde aquí la misma
 * información y las mismas palancas quedan a un atajo, y Claude las usa sin abrir el
 * navegador ni escribir curl a mano.
 * CÓMO: todo pasa por `enMac` (un único viaje por el enlace con el equipo, ver `mac.ts`).
 * Las acciones que cambian algo (reparar todas, publicar) piden un segundo clic.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Confirmacion, FilaMando, MedidorMando, MensajeMando, Pestana, ResumenMando } from '../types'
import { ESPERA_MS, HERRAMIENTA_MCP, SERVIDOR_MCP, codificar, interpretar, ordenMac, textoDe } from './mac'
import { SCRIPT_MAC } from './script-mac'
import type { Accion, Respuesta } from './mac'
import {
  CLAVES_MEDIDOR,
  PESTANAS,
  filasReparables,
  lineaEstado,
  paso,
  porQueNoSeRepara,
  reparable,
  textoMedidor,
  textoMensaje,
  textoPublicacion,
  textoReparacion,
  textoResumen,
  textoServidor,
} from './texto'

const P = 'puente-de-mando'
const PANEL = 'puente-de-mando'
const TITULO = 'Genesis'
/** Cada cuánto se relee la Mac para la línea de estado (el panel tiene su botón). */
const CADA_MS = 5 * 60_000

const pestana = atom({ plugin: 'puente-de-mando', key: 'pestana' } as const, 'pulso' as Pestana)
const resumen = atom({ plugin: 'puente-de-mando', key: 'resumen' } as const, null as ResumenMando | null)
const error = atom({ plugin: 'puente-de-mando', key: 'error' } as const, null as string | null)
const cargando = atom({ plugin: 'puente-de-mando', key: 'cargando' } as const, false)
const aviso = atom({ plugin: 'puente-de-mando', key: 'aviso' } as const, null as string | null)
const confirmar = atom({ plugin: 'puente-de-mando', key: 'confirmar' } as const, null as Confirmacion)

const esPestana = (x: string): x is Pestana => PESTANAS.some(p => p.id === x)

/**
 * Ejecuta una acción en la Mac y la interpreta. Nunca lanza.
 * 1) Por el enlace con el equipo (`remote-devices`): el caso de Cowork en la nube.
 * 2) Si ese servidor no existe en esta sesión (Claude Code corriendo EN la Mac), el mismo
 *    script en local con `$.process.run`, que ahí sí alcanza `127.0.0.1:9002`.
 */
async function enMac<T>($: EngineInterface, accion: Accion, datos: unknown = {}): Promise<Respuesta<T>> {
  let motivoEnlace = ''
  try {
    const r = await $.mcp.call(SERVIDOR_MCP, HERRAMIENTA_MCP, { command: ordenMac(accion, datos), timeout_ms: ESPERA_MS })
    return interpretar<T>(textoDe(r), r.isError === true)
  } catch (e) {
    motivoEnlace = (e instanceof Error ? e.message : String(e)).slice(0, 160)
  }
  try {
    const r = await $.process.run(['python3', '-', accion, codificar(datos)], {
      stdin: SCRIPT_MAC,
      timeoutMs: ESPERA_MS,
    })
    const local = interpretar<T>(r.stdout, r.exitCode !== 0)
    if (local.ok) return local
    return { ok: false, error: `Sin enlace con la Mac (${motivoEnlace}) y Genesis local no responde: ${local.error}` }
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 160)
    return { ok: false, error: `No hay enlace con la Mac desde esta sesión: ${motivoEnlace || motivo}` }
  }
}

/**
 * Lee la Mac en ESTA dispatch y guarda el resumen. Las herramientas y las órdenes la usan
 * siempre: esperar una lectura que empezó otra dispatch (el reloj) contaría contra el
 * presupuesto de 10 s del gancho, porque solo las llamadas `$` propias paran su reloj.
 */
async function leerAhora($: EngineInterface): Promise<string | null> {
  const r = await enMac<ResumenMando>($, 'resumen')
  if (r.ok) {
    await update($, resumen, () => r.datos)
    await update($, error, () => null)
  } else {
    await update($, error, () => r.error)
  }
  $.ui.status(lineaEstado(await read($, resumen), await read($, error)))
  return r.ok ? null : r.error
}

/** Una sola lectura en vuelo: dos pulsaciones seguidas no cargan la Mac dos veces. */
let enVuelo: Promise<string | null> | null = null

/** Relee la Mac; devuelve el error, o null si llegó el resumen. */
function refrescar($: EngineInterface): Promise<string | null> {
  if (enVuelo) return enVuelo
  enVuelo = (async () => {
   try {
    await update($, cargando, () => true)
    const r = await enMac<ResumenMando>($, 'resumen')
    if (r.ok) {
      await update($, resumen, () => r.datos)
      await update($, error, () => null)
    } else {
      await update($, error, () => r.error)
    }
    await update($, cargando, () => false)
    $.ui.status(lineaEstado(await read($, resumen), await read($, error)))
    return r.ok ? null : r.error
   } catch (e) {
    return e instanceof Error ? e.message : String(e)
   }
  })()
  const actual = enVuelo
  void actual.finally(() => {
    if (enVuelo === actual) enVuelo = null
  })
  return actual
}

/** Relee la Mac un momento después de una acción, sin dejar trabajo suelto. */
function luego($: EngineInterface): void {
  $.clock.after(1_500, () => void refrescar($))
}

async function avisar($: EngineInterface, texto: string | null): Promise<void> {
  await update($, aviso, () => texto)
}

async function reparar($: EngineInterface, ids: string[], cambio?: string): Promise<string> {
  const r = await enMac<unknown>($, 'reparar', { ids, ...(cambio ? { cambio } : {}) })
  const texto = r.ok ? textoReparacion(r.datos) : `No se pudo reparar: ${r.error}`
  luego($)
  return texto
}

async function abrir($: EngineInterface, cual?: Pestana): Promise<void> {
  if (cual) await update($, pestana, () => cual)
  await $.ui.open({ id: PANEL, title: TITULO })
  if (!(await read($, resumen))) luego($)
}

type Herramienta = { name: string; description: string; inputSchema?: Record<string, unknown> }

const HERRAMIENTAS: Herramienta[] = [
  {
    name: 'estado',
    description:
      'Estado de Genesis de StarSeed OS, leído ahora de la Mac: tareas en curso, agentes, bloqueadas (y cuántas se pueden reparar), olas, publicación en curso con sus puertas, servicios com.starseed.*, memoria y carga de la Mac, crédito y la bandeja de claude-cowork en el Chat Director.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'medidor',
    description:
      'Filas de un medidor de Genesis (las mismas del panel «pulso de trabajo»): id, estado, avance, etapa, quién y por qué. Úsalo para ver qué tareas están en curso, bloqueadas, sin publicar, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        clave: { type: 'string', enum: [...CLAVES_MEDIDOR] },
        limite: { type: 'integer', minimum: 1, maximum: 120, description: 'Filas como máximo (40 por defecto).' },
      },
      required: ['clave'],
    },
  },
  {
    name: 'reparar',
    description:
      'Repara tareas bloqueadas o fallidas con /api/mando/reintentar (reintento con cambio automático, por delante en la cola). Sin ids, Genesis procesa todas las que sirvan. Solo para tareas en fallo o bloqueo, nunca para las que esperan a otra tarea viva.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        cambio: { type: 'string', description: 'Cambio concreto que debe llevar el reintento (opcional).' },
      },
    },
  },
  {
    name: 'chat',
    description: 'Últimos mensajes del Chat Director y los pendientes de la bandeja de claude-cowork.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'informar',
    description:
      'Publica un informe en el Chat Director como claude-cowork (rol director). Para partes, avisos de reparación o resultados; nunca claves ni rutas de secretos.',
    inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'publicar',
    description:
      'Lanza la publicación de Genesis (commit, cuatro puertas, push a origin/main y verificación). Úsalo SOLO con la palabra de Alex o dentro de las puertas del director de producción. La nota explica qué se publica (8 caracteres o más).',
    inputSchema: { type: 'object', properties: { nota: { type: 'string', minLength: 8 } }, required: ['nota'] },
  },
]


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // (2026-10-07) El Puente de Mando se llama Genesis: /genesis es la orden; /mando sigue
    // valiendo para quien la tenga en los dedos.
    for (const [name, alias] of [['genesis', ''], ['mando', ' (alias de /genesis)']] as const) {
      await $.command.register({
        name,
        description: `Abre Genesis de StarSeed OS (pestaña opcional: pulso, chat, bloqueadas, olas, produccion, servicios, uso)${alias}`,
        argumentHint: '[pestaña]',
      })
    }
    for (const [name, alias] of [['genesis-estado', ''], ['mando-estado', ' (alias de /genesis-estado)']] as const) {
      await $.command.register({ name, description: `Resumen de Genesis en texto, leído ahora de la Mac${alias}` })
    }
    for (const h of HERRAMIENTAS) await $.tool.register(h)
    $.clock.after(4_000, () => void refrescar($))
    $.clock.every(CADA_MS, () => void refrescar($))
    return next(e)
  })

  // ── Órdenes ──────────────────────────────────────────────────────────────
  for (const command of ['genesis', 'mando']) {
    on('command.run', { command }, async ($, e) => {
      const pedida = (e.args ?? '').trim().toLowerCase().replace('producción', 'produccion')
      await abrir($, esPestana(pedida) ? pedida : undefined)
      return { text: `Genesis abierto${esPestana(pedida) ? ` en «${pedida}»` : ''}.` }
    })
  }

  for (const command of ['genesis-estado', 'mando-estado']) {
    on('command.run', { command }, async $ => {
      const fallo = await leerAhora($)
      const r = await read($, resumen)
      if (!r) return { text: `Sin datos de Genesis: ${fallo ?? 'la Mac no respondió'}` }
      return { text: (fallo ? `⚠ ${fallo}\n(último resumen bueno:)\n` : '') + textoResumen(r) }
    })
  }

  // ── Herramientas del modelo ─────────────────────────────────────────────
  on('tool.call', { tool: 'mcp__puente-de-mando__estado' }, async $ => {
    const fallo = await leerAhora($)
    const r = await read($, resumen)
    if (!r) return { isError: true, result: `Sin datos de Genesis: ${fallo ?? 'la Mac no respondió'}` }
    return { result: (fallo ? `⚠ ${fallo} — muestro el último resumen bueno.\n` : '') + textoResumen(r) }
  })

  on('tool.call', { tool: 'mcp__puente-de-mando__medidor' }, async ($, e) => {
    const clave = String(e.clave ?? 'en-curso')
    const limite = Number(e.limite ?? 40)
    const r = await enMac<MedidorMando>($, 'medidor', { clave, limite })
    return r.ok ? { result: textoMedidor(r.datos) } : { isError: true, result: r.error }
  })

  on('tool.call', { tool: 'mcp__puente-de-mando__reparar' }, async ($, e) => {
    const ids = Array.isArray(e.ids) ? e.ids.map(String).filter(Boolean) : []
    const cambio = typeof e.cambio === 'string' && e.cambio.trim() ? e.cambio.trim() : undefined
    return { result: await reparar($, ids, cambio) }
  })

  on('tool.call', { tool: 'mcp__puente-de-mando__chat' }, async $ => {
    const fallo = await leerAhora($)
    const r = await read($, resumen)
    if (!r) return { isError: true, result: `Sin datos del Chat Director: ${fallo ?? 'la Mac no respondió'}` }
    const chat = (r.chat ?? []).map(textoMensaje).join('\n') || '(sin mensajes)'
    const bandeja = (r.bandeja ?? []).map(textoMensaje).join('\n') || '(vacía)'
    return { result: `Chat Director (últimos):\n${chat}\n\nBandeja de claude-cowork:\n${bandeja}` }
  })

  on('tool.call', { tool: 'mcp__puente-de-mando__informar' }, async ($, e) => {
    const texto = String(e.texto ?? '').trim()
    if (!texto) return { isError: true, result: 'Falta el texto del informe.' }
    const r = await enMac<{ id?: string }>($, 'informar', { texto })
    return r.ok ? { result: `Informe publicado en el Chat Director (${r.datos.id ?? 'sin id'}).` } : { isError: true, result: r.error }
  })

  on('tool.call', { tool: 'mcp__puente-de-mando__publicar' }, async ($, e) => {
    const nota = String(e.nota ?? '').trim()
    if (nota.length < 8) return { isError: true, result: 'La nota necesita al menos 8 caracteres.' }
    const r = await enMac<Record<string, unknown>>($, 'publicar', { nota })
    luego($)
    return r.ok ? { result: `Publicación lanzada: ${JSON.stringify(r.datos)}` } : { isError: true, result: r.error }
  })

  // ── Panel ────────────────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const elementos = $.ui.resolve(e)
    const { Box, Text, Button } = elementos
    const Input = 'Input' in elementos ? elementos.Input : undefined
    const [tab, r, err, leyendo, av, conf] = await Promise.all([
      read($, pestana),
      read($, resumen),
      read($, error),
      read($, cargando),
      read($, aviso),
      read($, confirmar),
    ])
    const alto = Math.max(8, (e.viewport?.rows ?? 32) - 9)

    const filaTexto = (f: FilaMando) => (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{f.id}</Text>
          <Text dimColor>{` · ${f.estado ?? '?'}${typeof f.porcentaje === 'number' ? ` · ${f.porcentaje} %` : ''}${f.etapa ? ` · ${f.etapa}` : ''}${f.quien ? ` · ${f.quien}` : ''}`}</Text>
        </Text>
        <Text wrap="truncate-end">{`  ${f.titulo}`}</Text>
        {f.porque ? <Text dimColor wrap="truncate-end">{`  ${f.porque}`}</Text> : null}
      </Box>
    )

    const medidorLinea = (titulo: string, m?: MedidorMando) => (
      <Text wrap="truncate-end">
        <Text bold>{titulo}: </Text>
        {m ? `${m.resumen ?? m.total}${typeof m.porcentaje === 'number' ? ` (${m.porcentaje} %)` : ''}` : 'sin dato'}
        {m?.aviso ? <Text color="yellow">{` · ⚠ ${m.aviso}`}</Text> : null}
      </Text>
    )

    const mensajes = (lista: MensajeMando[], n: number) =>
      lista.slice(-n).map(m => (
        <Text wrap="wrap">
          <Text dimColor>{`[${(m.t || '').replace('T', ' ').slice(11, 16)}] `}</Text>
          <Text bold color={m.de === 'alex' ? 'cyan' : m.de.startsWith('claude') ? 'magenta' : undefined}>{m.de}</Text>
          {`: ${m.texto}`}
        </Text>
      ))

    let cuerpo: RenderChildren
    if (!r) {
      cuerpo = <Text dimColor>{leyendo ? 'Leyendo Genesis en la Mac…' : 'Aún sin datos. Pulsa ↻ Actualizar.'}</Text>
    } else if (tab === 'pulso') {
      const enCurso = r['en-curso']?.filas ?? []
      cuerpo = (
        <Box flexDirection="column">
          {medidorLinea('En curso', r['en-curso'])}
          {medidorLinea('Agentes', r.agentes)}
          {medidorLinea('Bloqueadas', r.bloqueadas)}
          {medidorLinea('Olas', r.olas)}
          {medidorLinea('Sin publicar', r['sin-publicar'])}
          {medidorLinea('Crédito Claude', r.credito)}
          {medidorLinea('Créditos de pago', r.creditos)}
          <Text wrap="truncate-end"><Text bold>Publicación: </Text>{paso(r.publicacion)}</Text>
          <Text dimColor wrap="truncate-end">{textoServidor(r.servidor).split('\n')[1] ?? ''}</Text>
          <Text> </Text>
          <Text bold>Tareas en curso</Text>
          {enCurso.length ? enCurso.slice(0, Math.max(2, Math.floor((alto - 10) / 3))).map(filaTexto) : <Text dimColor>Ninguna tarea en curso.</Text>}
        </Box>
      )
    } else if (tab === 'chat') {
      const bandeja = r.bandeja ?? []
      cuerpo = (
        <Box flexDirection="column">
          {mensajes(r.chat ?? [], Math.max(3, alto - 6 - Math.min(bandeja.length, 4)))}
          {bandeja.length ? <Text bold color="magenta">{`Bandeja de claude-cowork (${bandeja.length})`}</Text> : null}
          {bandeja.slice(-4).map(m => (
            <Box flexDirection="row" gap={1}>
              <Text wrap="truncate-end">{textoMensaje(m)}</Text>
              <Button
                key={`entregado:${m.id}`}
                label="✓ visto"
                dimColor
                onPress={async () => {
                  const x = await enMac<unknown>($, 'entrega', { id: m.id, estado: 'entregado' })
                  await avisar($, x.ok ? `Marcado como entregado: ${m.id}` : x.error)
                  luego($)
                }}
              />
            </Box>
          ))}
          {Input ? (
            <Input
              key="chat"
              label="Al Chat Director:"
              placeholder="Escribe y pulsa Enter (va como Alex a todos los canales que esperan)"
              submitLabel="enviar"
              onSubmit={async texto => {
                const limpio = texto.trim()
                if (!limpio) return
                await avisar($, 'Enviando al Chat Director…')
                const x = await enMac<unknown>($, 'decir', { texto: limpio })
                await avisar($, x.ok ? 'Enviado al Chat Director.' : `No se envió: ${x.error}`)
                luego($)
              }}
            />
          ) : (
            <Text dimColor>Para escribir al Chat Director usa el escritorio o la terminal.</Text>
          )}
        </Box>
      )
    } else if (tab === 'bloqueadas') {
      const m = r.bloqueadas
      const filas = m?.filas ?? []
      const reparables = filasReparables(m)
      const visibles = filas.slice(0, Math.max(2, Math.floor((alto - 5) / 3)))
      cuerpo = (
        <Box flexDirection="column">
          <Text wrap="wrap">{m ? `${reparables.length} reparable(s) de ${m.total} · ${m.resumen ?? ''}` : 'sin dato'}</Text>
          {visibles.map(f => (
            <Box flexDirection="row" gap={1}>
              <Box flexDirection="column" flexGrow={1}>{filaTexto(f)}</Box>
              {reparable(f) ? (
                <Button
                  key={`reparar:${f.id}`}
                  label="Reparar"
                  onPress={async () => {
                    await avisar($, `Reparando ${f.id}…`)
                    await avisar($, await reparar($, [f.id]))
                  }}
                />
              ) : (
                <Text dimColor>{porQueNoSeRepara(f)}</Text>
              )}
            </Box>
          ))}
          {filas.length > visibles.length ? <Text dimColor>{`… y ${filas.length - visibles.length} más (amplía el panel o usa la herramienta «medidor»).`}</Text> : null}
          {conf?.tipo === 'reparar-todas' ? (
            <Box flexDirection="row" gap={1}>
              <Button
                key="confirmar-reparar"
                variant="primary"
                label={`Confirmar: reparar ${reparables.length}`}
                onPress={async () => {
                  await update($, confirmar, () => null)
                  await avisar($, `Reparando ${reparables.length} tarea(s)…`)
                  await avisar($, await reparar($, reparables.map(f => f.id)))
                }}
              />
              <Button key="cancelar-reparar" label="Cancelar" onPress={() => update($, confirmar, () => null)} />
            </Box>
          ) : (
            <Button
              key="reparar-todas"
              label={`Reparar todas las que sirvan (${reparables.length})`}
              onPress={() => update($, confirmar, () => ({ tipo: 'reparar-todas' as const }))}
            />
          )}
        </Box>
      )
    } else if (tab === 'olas') {
      const filas = r.olas?.filas ?? []
      cuerpo = (
        <Box flexDirection="column">
          <Text wrap="wrap">{r.olas?.resumen ?? 'sin dato'}</Text>
          {filas.slice(0, alto - 2).map(f => (
            <Text wrap="truncate-end">
              <Text bold>{f.id}</Text>
              <Text dimColor>{` ${f.estado ?? ''}${typeof f.porcentaje === 'number' ? ` ${f.porcentaje} %` : ''} `}</Text>
              {f.titulo}
            </Text>
          ))}
        </Box>
      )
    } else if (tab === 'produccion') {
      const p = r.publicacion
      const corriendo = p?.diario.estado === 'corriendo'
      cuerpo = (
        <Box flexDirection="column">
          {textoPublicacion(p).split('\n').map(l => (
            <Text wrap="wrap" color={l.includes('✗') ? 'red' : l.includes('✓') ? 'green' : undefined}>{l}</Text>
          ))}
          <Text> </Text>
          {corriendo ? (
            <Text dimColor>Hay una publicación en marcha: espera a que termine para lanzar otra.</Text>
          ) : conf?.tipo === 'publicar' ? (
            <Box flexDirection="row" gap={1}>
              <Button
                key="confirmar-publicar"
                variant="primary"
                label="Confirmar publicación"
                onPress={async () => {
                  const nota = conf.nota
                  await update($, confirmar, () => null)
                  await avisar($, 'Lanzando la publicación…')
                  const x = await enMac<Record<string, unknown>>($, 'publicar', { nota })
                  await avisar($, x.ok ? 'Publicación lanzada: sigue sus puertas aquí.' : `No se lanzó: ${x.error}`)
                  luego($)
                }}
              />
              <Button key="cancelar-publicar" label="Cancelar" onPress={() => update($, confirmar, () => null)} />
              <Text dimColor wrap="truncate-end">{`nota: ${conf.nota}`}</Text>
            </Box>
          ) : Input ? (
            <Input
              key="nota"
              label="Publicar:"
              placeholder="Nota de lo que se publica (8 caracteres o más) y Enter"
              submitLabel="preparar"
              onSubmit={async nota => {
                const limpia = nota.trim()
                if (limpia.length < 8) return avisar($, 'La nota necesita al menos 8 caracteres.')
                await update($, confirmar, () => ({ tipo: 'publicar' as const, nota: limpia }))
              }}
            />
          ) : (
            <Text dimColor>Para publicar usa el escritorio o la terminal.</Text>
          )}
        </Box>
      )
    } else if (tab === 'servicios') {
      const s = r.servidor
      cuerpo = s ? (
        <Box flexDirection="column">
          {textoServidor(s).split('\n').slice(1).map(l => (
            <Text wrap="wrap" color={l.startsWith('⚠') ? 'yellow' : undefined}>{l}</Text>
          ))}
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {s.servicios.map(x => (
              <Text color={x.pid !== null ? 'green' : undefined} dimColor={x.pid === null}>
                {`${x.pid !== null ? '●' : '○'} ${x.etiqueta}`}
              </Text>
            ))}
          </Box>
        </Box>
      ) : (
        <Text dimColor>sin dato de servicios</Text>
      )
    } else {
      const u = r.uso
      const total = u?.total ?? {}
      cuerpo = (
        <Box flexDirection="column">
          {medidorLinea('Crédito Claude', r.credito)}
          {medidorLinea('Créditos de pago', r.creditos)}
          {medidorLinea('Memoria', r.memoria)}
          {medidorLinea('Disco', r.disco)}
          <Text wrap="wrap">
            {`Claude en esta Mac: ${total.turnos ?? '?'} turnos · ${total.total ?? '?'} tokens (relectura ${total.relectura_pct ?? '?'} %)`}
          </Text>
          {u?.limites ? (
            <Text dimColor wrap="wrap">{`Límites: ${Object.entries(u.limites).map(([k, v]) => `${k} ${v}`).join(' · ')}`}</Text>
          ) : null}
        </Box>
      )
    }

    const errores = r ? Object.keys(r.errores ?? {}) : []
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {PESTANAS.map(p => (
            <Button
              key={`pestana:${p.id}`}
              label={p.titulo}
              hotkey={p.tecla}
              plain
              variant={p.id === tab ? 'primary' : undefined}
              dimColor={p.id !== tab}
              onPress={() => update($, pestana, () => p.id)}
            />
          ))}
          <Button key="actualizar" label={leyendo ? 'Leyendo…' : '↻ Actualizar'} hotkey="r" plain onPress={() => void refrescar($)} />
        </Box>
        <Text dimColor wrap="truncate-end">
          {r ? `Datos de la Mac a las ${r.t.slice(11, 16)}${errores.length ? ` · sin: ${errores.join(', ')}` : ''}` : ' '}
        </Text>
        {err ? <Text color="red" wrap="wrap">{`⚠ ${err}`}</Text> : null}
        {av ? <Text color="cyan" wrap="wrap">{av}</Text> : null}
        {cuerpo}
      </Box>
    )
  })
}
