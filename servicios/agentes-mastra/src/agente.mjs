import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import http from 'node:http'

process.env.OPENAI_BASE_URL = 'http://127.0.0.1:4480/v1'
process.env.OPENAI_API_KEY = 'dummy'

export const herramientaEco = createTool({
  id: 'eco-texto',
  description: 'Devuelve el texto recibido con un saludo',
  inputSchema: z.object({ texto: z.string() }),
  outputSchema: z.object({ salida: z.string() }),
  execute: async ({ texto }) => {
    return { salida: `Hola: ${texto}` }
  }
})

export const agenteNeurona = new Agent({
  id: 'neurona-mastra',
  name: 'Agente Neurona Mastra',
  instructions: 'Eres un asistente de neurona. Responde en español con claridad.',
  model: 'openai/gpt-4o-mini',
  tools: { herramientaEco }
})

export function crearServidor(port = 4123, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/salud') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, agente: agenteNeurona.id }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  server.listen(port, host)
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  crearServidor()
  console.log('Servidor Mastra en 127.0.0.1:4123')
}
