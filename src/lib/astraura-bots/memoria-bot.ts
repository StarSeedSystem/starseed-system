import type { FragmentoMemoria } from '../../lib/nucleo/alcance-memoria'

type Medio = "web" | "pwa" | "nativo" | "servidor" | "xr"

export class RecuerdoBot implements FragmentoMemoria {
  id: string
  alcance: 'personal' | 'perfil' | 'grupo' | 'publica'
  texto: string
  origen: string
  at: number
  etiquetas?: string[] | undefined
  botId: string
  bytes: number
  usos: number
  fijado?: boolean

  static CUOTA_POR_MEDIO: Record<Medio, number> = {
    web: 5 * 1024 * 1024, // 5 MB
    pwa: 50 * 1024 * 1024, // 50 MB
    nativo: 500 * 1024 * 1024, // 500 MB
    servidor: 2 * 1024 * 1024 * 1024, // 2 GB
    xr: 20 * 1024 * 1024, // 20 MB
  }

  constructor(
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
  ) {
    this.id = id
    this.alcance = alcance
    this.texto = texto
    this.origen = origen
    this.at = at
    this.etiquetas = etiquetas
    this.botId = botId
    this.bytes = bytes
    this.usos = usos
    this.fijado = fijado
  }

  puntuar(r: RecuerdoBot, ahora: number): number {
    // relevancia por usos × recencia (vida media 30 días)
    const vidaMediaDias = 30
    const vidaMediaMs = vidaMediaDias * 24 * 60 * 60 * 1000
    const recencia = Math.exp(-(ahora - r.at) / vidaMediaMs)
    return r.usos * recencia
  }

  regular(
    recuerdos: RecuerdoBot[],
    cuotaBytes: number,
    ahora: number
  ): { conservar: RecuerdoBot[]; olvidar: RecuerdoBot[] } {
    // Ordenamos por puntuación (de menor a mayor) para olvidar los de menor puntuación primero
    const ordenados = [...recuerdos].sort((a, b) => this.puntuar(a, ahora) - this.puntuar(b, ahora))

    let bytesActuales = 0
    const conservar: RecuerdoBot[] = []
    const olvidar: RecuerdoBot[] = []

    for (const recuerdo of ordenados) {
      // Nunca olvidamos un recuerdo fijado
      if (recuerdo.fijado) {
        conservar.push(recuerdo)
        bytesActuales += recuerdo.bytes
        continue
      }

      // Si añadir este recuerdo no supera la cuota, lo conservamos
      if (bytesActuales + recuerdo.bytes <= cuotaBytes) {
        conservar.push(recuerdo)
        bytesActuales += recuerdo.bytes
      } else {
        // De lo contrario, lo olvidamos
        olvidar.push(recuerdo)
      }
    }

    return { conservar, olvidar }
  }

  planTransferencia(
    recuerdos: RecuerdoBot[],
    origen: { neurona: string; cuentaId: string },
    destinos: {
      neurona: string
      cuentaId: string
      tipo: 'propia' | 'grupo' | 'servidor-grupo'
      grupoId?: string
    }[]
  ): { destino: typeof destinos[0]; ids: string[] }[] {
    // Agrupamos los recuerdos por alcance
    const personales: RecuerdoBot[] = []
    const grupo: RecuerdoBot[] = []
    const publica: RecuerdoBot[] = []

    for (const r of recuerdos) {
      switch (r.alcance) {
        case 'personal':
        case 'perfil':
          personales.push(r)
          break
        case 'grupo':
          grupo.push(r)
          break
        case 'publica':
          publica.push(r)
          break
      }
    }

    const result: { destino: typeof destinos[0]; ids: string[] }[] = []

    // Para cada destino, determinamos qué recuerdos podemos transferir
    for (const destino of destinos) {
      const ids: string[] = []

      // Personal/perfil solo puede ir a neuronas propias de la misma cuenta
      if (destino.tipo === 'propia' && destino.cuentaId === origen.cuentaId) {
        for (const r of personales) {
          ids.push(r.id)
        }
      }
      // Grupo solo puede ir a destinos del tipo grupo (ignoramos grupoId en el recuerdo por falta de información)
      if (destino.tipo === 'grupo') {
        for (const r of grupo) {
          ids.push(r.id)
        }
      }
      // Público puede ir a cualquier destino
      for (const r of publica) {
        ids.push(r.id)
      }

      // Si hay recuerdos que transferir, añadimos al resultado
      if (ids.length > 0) {
        result.push({ destino, ids })
      }
    }

    return result
  }
}