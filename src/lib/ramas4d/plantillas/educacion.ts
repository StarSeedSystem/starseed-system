/**
 * plantilla-educacion — Plantilla Educación del motor Ramas 4D (MV1125K).
 * Rutas de aprendizaje como ramas, prerrequisitos como aristas dirigidas,
 * progreso propio (brillo) y del grupo (anillos), ramas de cualquier formato,
 * siguiente paso recomendado y huecos de la ruta.
 *
 * Módulo PURO: no lee disco, red ni procesos. El grafo lleva REFERENCIAS
 * (`ref`), nunca contenido privado. La disposición la calcula el visor.
 */

import type { AlcanceNodo, Grafo4D, Nodo } from '../modelo';
import { anadirArista, anadirNodo, crearGrafo } from '../modelo';

export type FormatoRamaEducativa =
  | 'leccion'
  | 'video'
  | 'ejercicio'
  | 'proyecto'
  | 'sesion-en-vivo'
  | 'evaluacion'
  | 'enlace';

export interface RamaEducativa {
  id: string;
  titulo: string;
  formato: FormatoRamaEducativa;
  /** Cómo abrirla (ruta del OS, id de archivo o URL); nunca el contenido. */
  ref: string;
  completada?: boolean;
}

export interface TemaEducativo {
  id: string;
  titulo: string;
  padreId: string | null;
  /** 0..1. */
  progresoPropio: number;
  /** 0..1; si falta, el grupo se muestra como «sin dato», nunca inventado. */
  progresoGrupo?: number;
  ramas: RamaEducativa[];
  /** Tipo de nodo del contrato; por defecto «leccion». */
  tipo?: string;
  /** Categoría o carpeta: organiza la ruta, no es un paso que se curse. */
  estructura?: boolean;
  tema?: string;
  alcance?: AlcanceNodo;
  dueno?: string;
}

export interface PrerrequisitoEducativo {
  de: string;
  a: string;
  intensidad?: number;
}

export interface EntradaPlantillaEducacion {
  temas: TemaEducativo[];
  prerrequisitos?: PrerrequisitoEducativo[];
  ahora?: number;
  dueno?: string;
  alcance?: AlcanceNodo;
}

export type MotivoHueco =
  | 'sin-ramas'
  | 'rama-sin-ref'
  | 'prerrequisito-ausente'
  | 'tema-duplicado';

export interface HuecoRuta {
  temaId: string;
  motivo: MotivoHueco;
  detalle: string;
}

export interface PlantillaEducacion {
  grafo: Grafo4D;
  siguientePaso: string | null;
  huecos: HuecoRuta[];
  /** Brillo 0..1 por id de nodo (progreso propio + grupo). */
  brillo: Map<string, number>;
  /** Anillos 0..3 por id de nodo (progreso del grupo; 0 = sin dato). */
  anillos: Map<string, number>;
  /** Padre de cada nodo del grafo (null = raíz), para la disposición radial. */
  padres: Map<string, string | null>;
}

export const FORMATOS_RAMA: readonly FormatoRamaEducativa[] = [
  'leccion',
  'video',
  'ejercicio',
  'proyecto',
  'sesion-en-vivo',
  'evaluacion',
  'enlace',
];

/** Etiquetas en español para la interfaz (los ids se quedan en el dato). */
export const ETIQUETA_FORMATO: Record<FormatoRamaEducativa, string> = {
  leccion: 'lección',
  video: 'vídeo',
  ejercicio: 'ejercicio',
  proyecto: 'proyecto',
  'sesion-en-vivo': 'sesión en vivo',
  evaluacion: 'evaluación',
  enlace: 'enlace',
};

function limitar01(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}

/** Brillo 0.3..1: el progreso propio ilumina y el del grupo suma sin taparlo. */
export function brilloDeProgreso(propio: number, grupo?: number): number {
  const p = limitar01(propio);
  const g = grupo === undefined ? p : limitar01(grupo);
  return Math.min(1, Math.max(0.3, 0.3 + 0.4 * p + 0.3 * g));
}

/** Anillos 0..3: solo se dibujan cuando hay dato del grupo (si falta, 0). */
export function anillosDeProgreso(grupo?: number): number {
  if (grupo === undefined) return 0;
  const g = limitar01(grupo);
  if (g <= 0) return 0;
  return Math.min(3, Math.ceil(g * 3));
}

/** Primer tema incompleto cuyos prerrequisitos ya están completos; si todos
 *  están bloqueados, devuelve el primero incompleto para no dejar la ruta muda. */
export function siguientePasoRecomendado(
  temas: readonly TemaEducativo[],
  prerrequisitos: readonly PrerrequisitoEducativo[] = [],
): string | null {
  const porId = new Map(temas.map((t) => [t.id, t]));
  const requeridos = new Map<string, string[]>();
  for (const r of prerrequisitos) {
    if (!porId.has(r.de) || !porId.has(r.a)) continue;
    const lista = requeridos.get(r.a) ?? [];
    lista.push(r.de);
    requeridos.set(r.a, lista);
  }
  let primeroIncompleto: string | null = null;
  for (const tema of temas) {
    if (tema.estructura || limitar01(tema.progresoPropio) >= 1) continue;
    if (primeroIncompleto === null) primeroIncompleto = tema.id;
    const pendientes = requeridos.get(tema.id) ?? [];
    const listo = pendientes.every((id) => {
      const req = porId.get(id);
      return !req || limitar01(req.progresoPropio) >= 1;
    });
    if (listo) return tema.id;
  }
  return primeroIncompleto;
}

/** Huecos reales de la ruta: temas sin ramas, ramas sin referencia, prerrequisitos
 *  que apuntan fuera y temas repetidos. No inventa contenido para rellenarlos. */
export function huecosDeRuta(
  temas: readonly TemaEducativo[],
  prerrequisitos: readonly PrerrequisitoEducativo[] = [],
): HuecoRuta[] {
  const huecos: HuecoRuta[] = [];
  const ids = new Set<string>();
  for (const tema of temas) {
    if (ids.has(tema.id)) {
      huecos.push({
        temaId: tema.id,
        motivo: 'tema-duplicado',
        detalle: `El tema "${tema.titulo}" se repite en la ruta`,
      });
      continue;
    }
    ids.add(tema.id);
    if (tema.ramas.length === 0 && !tema.estructura) {
      huecos.push({
        temaId: tema.id,
        motivo: 'sin-ramas',
        detalle: `El tema "${tema.titulo}" no tiene ninguna rama de contenido`,
      });
    }
    for (const rama of tema.ramas) {
      if (!rama.ref.trim()) {
        huecos.push({
          temaId: tema.id,
          motivo: 'rama-sin-ref',
          detalle: `La rama "${rama.titulo}" no tiene referencia para abrirse`,
        });
      }
    }
  }
  for (const r of prerrequisitos) {
    if (!ids.has(r.de) || !ids.has(r.a)) {
      huecos.push({
        temaId: r.a,
        motivo: 'prerrequisito-ausente',
        detalle: `El prerrequisito ${r.de} → ${r.a} apunta a un tema que no está en la ruta`,
      });
    }
  }
  return huecos;
}

/** Tipo de nodo del contrato para cada formato de rama educativa. */
export function tipoDeFormato(formato: FormatoRamaEducativa): string {
  switch (formato) {
    case 'video':
      return 'archivo';
    case 'ejercicio':
    case 'evaluacion':
      return 'tarea';
    case 'proyecto':
      return 'proyecto';
    case 'sesion-en-vivo':
      return 'proceso';
    case 'enlace':
      return 'archivo';
    default:
      return 'leccion';
  }
}

interface OpcionesNodo {
  ahora: number;
  dueno: string;
  alcance: AlcanceNodo;
}

const PREFIJO = 'edu:';

function idTema(id: string): string {
  return `${PREFIJO}${id}`;
}

function nodoTema(tema: TemaEducativo, opciones: OpcionesNodo): Nodo {
  const propio = limitar01(tema.progresoPropio);
  const grupo = tema.progresoGrupo === undefined ? undefined : limitar01(tema.progresoGrupo);
  const anillos = anillosDeProgreso(grupo);
  return {
    id: idTema(tema.id),
    tipo: tema.tipo ?? 'leccion',
    titulo: tema.titulo,
    formato: 'enlace',
    ref: `/educacion/temas/${encodeURIComponent(tema.id)}`,
    alcance: tema.alcance ?? opciones.alcance,
    dueno: tema.dueno ?? opciones.dueno,
    capas: ['educacion', 'ruta', tema.padreId ? 'subtema' : 'raiz'],
    t_creado: opciones.ahora,
    t_actividad: opciones.ahora,
    peso: brilloDeProgreso(propio, grupo),
    tema: tema.tema,
    categoria: 'ruta-aprendizaje',
    etiquetas: [
      'educacion',
      `propio:${propio.toFixed(2)}`,
      ...(grupo === undefined ? [] : [`grupo:${grupo.toFixed(2)}`]),
      `anillos:${anillos}`,
    ],
  };
}

function nodoRama(tema: TemaEducativo, rama: RamaEducativa, opciones: OpcionesNodo): Nodo {
  return {
    id: `${idTema(tema.id)}:${rama.id}`,
    tipo: tipoDeFormato(rama.formato),
    titulo: rama.titulo,
    formato: rama.formato,
    ref: rama.ref,
    alcance: tema.alcance ?? opciones.alcance,
    dueno: tema.dueno ?? opciones.dueno,
    capas: ['educacion', 'rama', tema.id],
    t_creado: opciones.ahora,
    t_actividad: opciones.ahora,
    peso: rama.completada ? 1 : 0.5,
    tema: tema.tema,
    categoria: 'rama-aprendizaje',
    etiquetas: ['educacion', rama.formato, rama.completada ? 'completada' : 'pendiente'],
  };
}

function registrarRama(grafo: Grafo4D, padreId: string, hijoId: string): void {
  const hijos = grafo.ramas.get(padreId) ?? [];
  if (!hijos.includes(hijoId)) {
    hijos.push(hijoId);
    grafo.ramas.set(padreId, hijos);
  }
}

export function construirGrafoEducacion(entrada: EntradaPlantillaEducacion): PlantillaEducacion {
  const ahora = entrada.ahora ?? Date.now();
  const opciones: OpcionesNodo = {
    ahora,
    dueno: entrada.dueno ?? 'sistema',
    alcance: entrada.alcance ?? 'publico',
  };
  const prerrequisitos = entrada.prerrequisitos ?? [];
  const grafo = crearGrafo();
  const padres = new Map<string, string | null>();
  const brillo = new Map<string, number>();
  const anillos = new Map<string, number>();

  for (const tema of entrada.temas) {
    const id = idTema(tema.id);
    padres.set(id, tema.padreId ? idTema(tema.padreId) : null);
    brillo.set(id, brilloDeProgreso(tema.progresoPropio, tema.progresoGrupo));
    anillos.set(id, anillosDeProgreso(tema.progresoGrupo));
    anadirNodo(grafo, nodoTema(tema, opciones));
  }

  for (const tema of entrada.temas) {
    const idPadre = idTema(tema.id);
    if (!grafo.nodos.has(idPadre)) continue;
    for (const rama of tema.ramas) {
      const idRama = `${idPadre}:${rama.id}`;
      if (!anadirNodo(grafo, nodoRama(tema, rama, opciones))) continue;
      padres.set(idRama, idPadre);
      anadirArista(grafo, { de: idPadre, a: idRama, tipo: 'contiene', t: ahora, intensidad: 1 });
      registrarRama(grafo, idPadre, idRama);
    }
  }

  for (const tema of entrada.temas) {
    if (!tema.padreId) continue;
    const idPadre = idTema(tema.padreId);
    const idHijo = idTema(tema.id);
    if (!grafo.nodos.has(idPadre) || !grafo.nodos.has(idHijo)) continue;
    anadirArista(grafo, { de: idPadre, a: idHijo, tipo: 'prerrequisito', t: ahora, intensidad: 0.9 });
    registrarRama(grafo, idPadre, idHijo);
  }

  for (const r of prerrequisitos) {
    const de = idTema(r.de);
    const a = idTema(r.a);
    if (!grafo.nodos.has(de) || !grafo.nodos.has(a)) continue;
    anadirArista(grafo, { de, a, tipo: 'prerrequisito', t: ahora, intensidad: r.intensidad ?? 0.8 });
  }

  return {
    grafo,
    siguientePaso: siguientePasoRecomendado(entrada.temas, prerrequisitos),
    huecos: huecosDeRuta(entrada.temas, prerrequisitos),
    brillo,
    anillos,
    padres,
  };
}
