import { RecuerdoBot } from '../memoria-bot'
import type { Medio } from '../tipos'

describe('RecuerdoBot', () => {
  const ahora = Date.now()

  // Helper to create a RecuerdoBot
  const createRecuerdo = (
    id: string,
    alcance: 'personal' | 'perfil' | 'grupo' | 'publica',
    texto: string,
    origen: string,
    at: number,
    etiquetas: string[] | undefined,
    botId: string,
    bytes: number,
    usos: number,
    fijado?: boolean
  ) => new RecuerdoBot(id, alcance, texto, origen, at, etiquetas, botId, bytes, usos, fijado)

  // Test: cuota respetada
  it('respeta la cuota de bytes', () => {
    // TODO
  })

  // Test: fijado nunca se olvida
  it('nunca olvida un recuerdo fijado', () => {
    // TODO
  })

  // Test: recencia
  it('la puntuação considera la recencia', () => {
    // TODO
  })

  // Test: personal nunca sale de la cuenta
  it('los recuerdos personales nunca salen de la cuenta', () => {
    // TODO
  })

  // Test: grupo solo a su grupo
  it('los recuerdos de grupo solo van a destinos del mismo grupo', () => {
    // TODO
  })

  // Test: público libre
  it('los recuerdos públicos pueden ir a cualquier destino', () => {
    // TODO
  })

  // Test: plan vacío sin destinos
  it('devuelve un plan vacío cuando no hay destinos', () => {
    // TODO
  })

  // Test: determinismo
  it('es determinista', () => {
    // TODO
  })
})