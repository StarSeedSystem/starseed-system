import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { DocCreditos } from './creditos-pago-tipos'

// Solo servidor: lee ~/.starseed/medidores-credito.json. Lo puro está en creditos-pago-tipos.ts.
export * from './creditos-pago-tipos'

export async function leerCreditosPago(ruta=path.join(os.homedir(),'.starseed','medidores-credito.json')):Promise<DocCreditos|null>{
  try{ const d=await fs.readFile(ruta,'utf8'); return JSON.parse(d) as DocCreditos }catch{ return null }
}
