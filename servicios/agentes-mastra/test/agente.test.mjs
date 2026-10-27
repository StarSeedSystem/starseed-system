import { test } from 'node:test'
import assert from 'node:assert/strict'
import { herramientaEco, agenteNeurona } from '../src/agente.mjs'

test('herramientaEco devuelve saludo', async () => {
  const resultado = await herramientaEco.execute({ texto: 'mundo' })
  assert.equal(resultado.salida, 'Hola: mundo')
})

test('agenteNeurona tiene configuración correcta', () => {
  assert.equal(agenteNeurona.id, 'neurona-mastra')
  assert.equal(agenteNeurona.name, 'Agente Neurona Mastra')
})
