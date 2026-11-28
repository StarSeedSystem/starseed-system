import type { AlcanceNodo, Grafo4D, Nodo } from '../modelo';
import { anadirArista, anadirNodo, crearGrafo } from '../modelo';

/**
 * Plantilla de Educación de Ramas 4D (MV1125K).
 * Rutas de aprendizaje como ramas, prerrequisitos como aristas dirigidas,
 * progreso propio y del grupo en brillo y anillos, y ramas de cualquier formato.
 * Todo es puro y determinista: la misma entrada produce el mismo grafo y las
 * mismas posiciones. El grafo lleva referencias, nunca contenido privado.
 */

export const PREFIJO_EDU = 'edu:';

export type FormatoRamaEducativa =
  | 'leccion'
  | 'video'
  | 'ejercicio'
  | 'proyecto'
  | 'sesion'
  | 'evaluacion'
  | 'enlace';

export interface RamaEducativa {
  id: string;
  titulo: string;
  formato: FormatoRamaEducativa;
  ref: string;
  alcance?: AlcanceNodo;
  dueno?: string;
  prerequisitos?: string[];
  hecho?: boolean;
  pasosHechos?: number;
  pasosTotal?: number;
  grupoHechos?: number;
  grupoTotal?: number;
  progresoPropio?: number;
  progresoGrupo?: number;
  peso?: number;
  t_creado?: number;
  t_actividad?: number;
  etiquetas?: string[];
}

export interface RutaEducativa {
  id: string;
  titulo: string;
  ref?: string;
  alcance?: AlcanceNodo;
  dueno?: string;
  ramas: RamaEducativa[];
}

export interface EntradaPlantillaEducacion {
  rutas: RutaEducativa[];
  ahora?: number;
}

export interface ProgresoRama {
  propio: number;
  grupo: number;
  anillosPropio: number;
  anillosGrupo: number;
  brillo: number;
}

export type TipoHueco = 'sin_ramas' | 'prerrequisito_ausente' | 'sin_ref';

export interface HuecoRuta {
  rutaId: string;
  ramaId?: string;
  tipo: TipoHueco;
  detalle: string;
}

export interface SiguientePaso {
  rutaId: string;
  ramaId: string;
  titulo: string;
}

export interface PlantillaEducacion {
  grafo: Grafo4D;
  posiciones: Float32Array;
  progreso: Map<string, ProgresoRama>;
  siguiente: SiguientePaso | null;
  huecos: HuecoRuta[];
}

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

const FORMATO_NODO: Record<FormatoRamaEducativa, string> = {
  leccion: 'documento',
  video: 'video',
  ejercicio: 'flujo',
  proyecto: 'app',
  sesion: 'enlace',
  evaluacion: 'tabla',
  enlace: 'enlace',
};

function limitar01(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}

function ratioDe(hechos?: number, total?: number, directo?: number): number {
  if (typeof directo === 'number' && Number.isFinite(directo)) return limitar01(directo);
  if (typeof total === 'number' && total > 0 && typeof hechos === 'number') {
    return limitar01(hechos / total);
  }
  if (typeof hechos === 'number' && hechos > 0) return 1;
  return 0;
}

/** Id interno del grafo para un id de la Educación. */
export function idNodoEducativo(id: string): string {
  return id.startsWith(PREFIJO_EDU) ? id : `${PREFIJO_EDU}${id}`;
}

/** Id de Educación a partir de un id interno del grafo. */
export function idOriginalEducativo(id: string): string {
  return id.startsWith(PREFIJO_EDU) ? id.slice(PREFIJO_EDU.length) : id;
}

/** Formato del nodo de Ramas 4D para una rama educativa. */
export function formatoDeRama(formato: FormatoRamaEducativa): string {
  return FORMATO_NODO[formato] ?? 'enlace';
}

/** Anillos de progreso (0 a 3): cada tercio completo enciende un anillo. */
export function anillosDeProgreso(ratio: number): number {
  const r = limitar01(ratio);
  if (r <= 0) return 0;
  return Math.min(3, Math.ceil(r * 3));
}

/** Brillo del cuerpo: el progreso propio manda; el del grupo suma un velo. */
export function brilloDeProgreso(propio: number, grupo: number): number {
  return limitar01(0.35 + limitar01(propio) * 0.5 + limitar01(grupo) * 0.15);
}

/** Progreso propio y del grupo de una rama, con brillo y anillos. */
export function progresoDeRama(rama: RamaEducativa): ProgresoRama {
  const propio =
    rama.hecho === true ? 1 : ratioDe(rama.pasosHechos, rama.pasosTotal, rama.progresoPropio);
  const grupo = ratioDe(rama.grupoHechos, rama.grupoTotal, rama.progresoGrupo);
  return {
    propio,
    grupo,
    anillosPropio: anillosDeProgreso(propio),
    anillosGrupo: anillosDeProgreso(grupo),
    brillo: brilloDeProgreso(propio, grupo),
  };
}

function posicionRuta(indice: number): [number, number, number] {
  const angulo = indice * ANGULO_AUREO;
  const radio = 150 + Math.floor(indice / 6) * 90;
  return [Math.cos(angulo) * radio, ((indice % 3) - 1) * 26, Math.sin(angulo) * radio];
}

function posicionRama(
  centro: [number, number, number],
  indice: number,
  profundidad: number,
): [number, number, number] {
  const angulo = indice * ANGULO_AUREO + profundidad * 0.7;
  const radio = 36 + profundidad * 40;
  return [
    centro[0] + Math.cos(angulo) * radio,
    centro[1] + profundidad * 22 + Math.sin(indice * 1.7) * 6,
    centro[2] + Math.sin(angulo) * radio,
  ];
}

function crearProfundidad(ramas: Map<string, RamaEducativa>): (id: string) => number {
  const memo = new Map<string, number>();
  const pila = new Set<string>();
  const calcular = (id: string): number => {
    const guardado = memo.get(id);
    if (guardado !== undefined) return guardado;
    if (pila.has(id)) return 0;
    const rama = ramas.get(id);
    if (!rama) return 0;
    pila.add(id);
    let maxima = 0;
    for (const prerequisito of rama.prerrequisitos ?? []) {
      if (ramas.has(prerequisito)) {
        maxima = Math.max(maxima, calcular(prerequisito) + 1);
      }
    }
    pila.delete(id);
    memo.set(id, maxima);
    return maxima;
  };
  return calcular;
}

function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

export function construirPlantillaEducacion(
  entrada: EntradaPlantillaEducacion,
): PlantillaEducacion {
  const ahora = entrada.ahora ?? 0;
  const grafo = crearGrafo();
  const posPorId = new Map<string, [number, number, number]>();
  const progreso = new Map<string, ProgresoRama>();
  const huecos: HuecoRuta[] = [];

  const ramasPorId = new Map<string, RamaEducativa>();
  const idsRuta = new Set<string>();
  for (const ruta of entrada.rutas) {
    idsRuta.add(idNodoEducativo(ruta.id));
    for (const rama of ruta.ramas) {
      if (!ramasPorId.has(rama.id)) ramasPorId.set(rama.id, rama);
    }
  }

  const progresoPorRama = new Map<string, ProgresoRama>();
  for (const [id, rama] of ramasPorId) progresoPorRama.set(id, progresoDeRama(rama));
  const profundidad = crearProfundidad(ramasPorId);

  entrada.rutas.forEach((ruta, indiceRuta) => {
    const ramas = ruta.ramas.filter((rama) => ramasPorId.get(rama.id) === rama);
    const idRuta = idNodoEducativo(ruta.id);
    const centro = posicionRuta(indiceRuta);
    const propioRuta = promedio(ramas.map((rama) => progresoPorRama.get(rama.id)?.propio ?? 0));
    const grupoRuta = promedio(ramas.map((rama) => progresoPorRama.get(rama.id)?.grupo ?? 0));
    const avanceRuta: ProgresoRama = {
      propio: propioRuta,
      grupo: grupoRuta,
      anillosPropio: anillosDeProgreso(propioRuta),
      anillosGrupo: anillosDeProgreso(grupoRuta),
      brillo: brilloDeProgreso(propioRuta, grupoRuta),
    };
    const nodoRuta: Nodo = {
      id: idRuta,
      tipo: 'carpeta',
      titulo: ruta.titulo,
      formato: 'documento',
      ref: ruta.ref?.trim() || `/educacion/ruta/${ruta.id}`,
      alcance: ruta.alcance ?? 'publico',
      dueno: ruta.dueno ?? 'sistema',
      capas: ['educacion', 'ruta', `ruta:${ruta.id}`],
      t_creado: ahora,
      t_actividad: ahora,
      peso: 0.5 + propioRuta * 0.5,
      etiquetas: ['ruta', ruta.id],
    };
    if (anadirNodo(grafo, nodoRuta)) {
      posPorId.set(idRuta, centro);
      progreso.set(idRuta, avanceRuta);
    }
    if (ramas.length === 0) {
      huecos.push({
        rutaId: ruta.id,
        tipo: 'sin_ramas',
        detalle: `La ruta «${ruta.titulo}» todavía no tiene ramas.`,
      });
    }

    ramas.forEach((rama, indiceRama) => {
      const id = idNodoEducativo(rama.id);
      const avance = progresoPorRama.get(rama.id) ?? progresoDeRama(rama);
      const posicion = posicionRama(centro, indiceRama, profundidad(rama.id));
      const nodo: Nodo = {
        id,
        tipo: rama.formato === 'proyecto' ? 'proyecto' : 'leccion',
        titulo: rama.titulo,
        formato: formatoDeRama(rama.formato),
        ref: rama.ref.trim() || `#sin-ref:${rama.id}`,
        alcance: rama.alcance ?? 'publico',
        dueno: rama.dueno ?? 'sistema',
        capas: [
          'educacion',
          'rama',
          `formato:${rama.formato}`,
          `ruta:${ruta.id}`,
          `progreso:${avance.propio >= 1 ? 'completo' : 'en-curso'}`,
        ],
        t_creado: rama.t_creado ?? ahora,
        t_actividad: rama.t_actividad ?? ahora,
        peso: typeof rama.peso === 'number' ? limitar01(rama.peso) : avance.brillo,
        etiquetas: [rama.formato, ruta.id, ...(rama.etiquetas ?? [])],
      };
      if (anadirNodo(grafo, nodo)) {
        posPorId.set(id, posicion);
        progreso.set(id, avance);
      }
      if (!rama.ref.trim()) {
        huecos.push({
          rutaId: ruta.id,
          ramaId: rama.id,
          tipo: 'sin_ref',
          detalle: `La rama «${rama.titulo}» no tiene referencia para abrirse.`,
        });
      }
      for (const prerequisito of rama.prerrequisitos ?? []) {
        if (!ramasPorId.has(prerequisito) && !idsRuta.has(idNodoEducativo(prerequisito))) {
          huecos.push({
            rutaId: ruta.id,
            ramaId: rama.id,
            tipo: 'prerrequisito_ausente',
            detalle: `La rama «${rama.titulo}» depende de «${prerequisito}», que no está en la ruta.`,
          });
        }
      }
    });
  });

  for (const ruta of entrada.rutas) {
    const idRuta = idNodoEducativo(ruta.id);
    for (const rama of ruta.ramas) {
      if (ramasPorId.get(rama.id) !== rama) continue;
      const id = idNodoEducativo(rama.id);
      if (grafo.nodos.has(idRuta) && grafo.nodos.has(id)) {
        anadirArista(grafo, { de: idRuta, a: id, tipo: 'contiene', t: ahora, intensidad: 0.8 });
      }
      for (const prerequisito of rama.prerrequisitos ?? []) {
        if (!ramasPorId.has(prerequisito)) continue;
        const idPrerequisito = idNodoEducativo(prerequisito);
        if (grafo.nodos.has(idPrerequisito) && grafo.nodos.has(id)) {
          anadirArista(grafo, {
            de: idPrerequisito,
            a: id,
            tipo: 'prerrequisito',
            t: ahora,
            intensidad: 0.9,
          });
        }
      }
    }
  }

  const posiciones = new Float32Array(grafo.nodos.size * 3);
  let indice = 0;
  for (const id of grafo.nodos.keys()) {
    const posicion = posPorId.get(id) ?? [0, 0, 0];
    posiciones.set(posicion, indice * 3);
    indice += 1;
  }

  let siguiente: SiguientePaso | null = null;
  for (const ruta of entrada.rutas) {
    for (const rama of ruta.ramas) {
      if (ramasPorId.get(rama.id) !== rama) continue;
      const avance = progresoPorRama.get(rama.id);
      if (!avance || avance.propio >= 1) continue;
      const listo = (rama.prerrequisitos ?? []).every((prerequisito) => {
        if (idsRuta.has(idNodoEducativo(prerequisito))) return true;
        const previo = progresoPorRama.get(prerequisito);
        return previo ? previo.propio >= 1 : false;
      });
      if (listo) {
        siguiente = { rutaId: ruta.id, ramaId: rama.id, titulo: rama.titulo };
        break;
      }
    }
    if (siguiente) break;
  }

  return { grafo, posiciones, progreso, siguiente, huecos };
}
