/**
 * Transporte hacia la Mac (piezas puras; la llamada con `$` vive en register.tsx, porque el
 * motor solo sigue `$` dentro del mismo archivo): el mod no tiene red propia hacia el Mando (escucha en
 * 127.0.0.1:9002 de la Mac), así que cada lectura o acción es UNA llamada al servidor MCP
 * `remote-devices` (Desktop Commander, `start_process`), que corre el script de
 * `script-mac.ts` y devuelve su línea `@@MANDO@@{json}`.
 */
import type { McpToolResult } from 'claude-code'

import { MARCA, SCRIPT_MAC } from './script-mac'

export const SERVIDOR_MCP = 'remote-devices'
export const HERRAMIENTA_MCP = 'Desktop_Commander__start_process'
/** Por debajo del minuto que el enlace con el equipo espera una respuesta. */
export const ESPERA_MS = 50_000

export type Accion = 'resumen' | 'reparar' | 'decir' | 'informar' | 'entrega' | 'publicar' | 'medidor'

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string }

/**
 * JSON → argumento de shell seguro entre comillas simples: `encodeURIComponent` deja
 * `!'()*` sin codificar y la comilla simple cerraría el argumento, así que se codifican
 * también. El script lo deshace con `urllib.parse.unquote`.
 */
export function codificar(valor: unknown): string {
  return encodeURIComponent(JSON.stringify(valor ?? {})).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

/** La orden completa que viaja a la Mac (zsh): el script entra por un heredoc literal. */
export function ordenMac(accion: Accion, datos: unknown = {}): string {
  return `cd ~ && python3 - ${accion} '${codificar(datos)}' <<'PYEOF_MANDO'\n${SCRIPT_MAC}\nPYEOF_MANDO`
}

export function textoDe(r: McpToolResult): string {
  return (r.content ?? [])
    .map(b => (b && typeof b === 'object' && 'text' in b && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
}

/** Lee la línea con la marca; sin marca, explica en castellano qué pasó. */
export function interpretar<T>(texto: string, esError: boolean): Respuesta<T> {
  const i = texto.lastIndexOf(MARCA)
  if (i >= 0) {
    const resto = texto.slice(i + MARCA.length)
    const linea = resto.split('\n')[0] ?? ''
    try {
      const r = JSON.parse(linea) as Respuesta<T>
      if (r && typeof r === 'object' && 'ok' in r) return r
    } catch {
      /* cae al error de abajo */
    }
    return { ok: false, error: 'La Mac respondió, pero la respuesta llegó cortada o ilegible.' }
  }
  if (/did not respond|not connected|disconnected|no device/i.test(texto)) {
    return { ok: false, error: 'La Mac no responde ahora mismo (¿dormida, sin la app de Claude o sin enlace?).' }
  }
  if (/still running|is running|timeout/i.test(texto)) {
    return { ok: false, error: `La Mac tardó más de ${Math.round(ESPERA_MS / 1000)} s: está muy cargada. Prueba otra vez en un rato.` }
  }
  const pista = texto.replace(/\s+/g, ' ').trim().slice(0, 240)
  return {
    ok: false,
    error: esError ? `El enlace con la Mac devolvió un error: ${pista || 'sin detalle'}` : `La Mac no devolvió datos del Mando. ${pista}`,
  }
}
