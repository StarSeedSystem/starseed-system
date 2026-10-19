export type Papel = 'lista' | 'formulario' | 'texto-denso' | 'panel' | 'tarjeta' | 'widget' | 'protagonista' | 'contenedor'

export type Registro = string
export type Contexto = string

export interface FondoResultado {
  background: string
  velo: boolean
}

const PAPELES_SIMPLES: Papel[] = ['lista', 'formulario', 'texto-denso']

export function sombraPara(papel: Papel): string {
  if (papel === 'protagonista') {
    return '--ss-sombra-brillo'
  }
  if (PAPEL_SOMBRA_MD.has(papel)) {
    return '--ss-sombra-md'
  }
  return '--ss-sombra-lg'
}

const PAPEL_SOMBRA_MD = new Set<Papel>(['lista', 'formulario', 'texto-denso', 'widget', 'contenedor'])

export function fondoPara(registro: Registro, contexto: Contexto): FondoResultado {
  const reg = registro.toLowerCase()
  const ctx = contexto.toLowerCase()

  if (ctx === 'documento') {
    return { background: '--ss-nieve', velo: false }
  }

  if (ctx === 'cosmico' || reg.includes('astraura') || reg.includes('exploracion') || reg.includes('xr')) {
    return { background: '--ss-vacio-profundo', velo: true }
  }

  if (reg.includes('natural') || reg.includes('materia viva') || reg.includes('materia') || reg.includes('ecologico')) {
    return { background: '--ss-fondo-natural', velo: true }
  }

  if (reg.includes('claridad')) {
    return { background: '--ss-fondo-claridad', velo: false }
  }

  if (reg.includes('profundidad')) {
    return { background: '--ss-fondo-profundidad', velo: true }
  }

  if (reg.includes('cristal')) {
    return { background: '--ss-fondo-cristal', velo: true }
  }

  const fondoVivo = reg.includes('nexus') || reg.includes('trinity') || ctx === 'interfaz' || ctx === 'noche'
  if (fondoVivo) {
    return { background: '--ss-noche', velo: false }
  }

  return { background: '--ss-noche', velo: false }
}
