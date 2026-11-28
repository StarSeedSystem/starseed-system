/**
 * Plantilla Cerebros (MV1125L) — carpetas, archivos y memorias como recuerdos vivos.
 * Cerebro = galaxia, carpeta = sistema, archivo y memoria = planeta o luna.
 * Puro y determinista: sin DOM, red ni `node:*`. El grafo lleva referencias,
 * nunca contenido privado. El brillo mide el uso y se enfría despacio sin borrar.
 */

import type { AlcanceNodo, Grafo4D, Nodo } from '../modelo';
import { anadirArista, anadirNodo, crearGrafo } from '../modelo';
import { podarGrafo, type Observador } from '../alcance';

export const VIDA_MEDIA_ENFRIAMIENTO_MS = 30 * 24 * 60 * 60 * 1000;
export const BRILLO_MINIMO = 0.08;

export interface RecuerdoCerebro {
  id: string;
  titulo: string;
  /** Cómo abrirlo en su app: ruta del OS o id del recuerdo. */
  ref: string;
  carpetaId?: string | null;
  alcance?: AlcanceNodo;
  formato?: string;
  /** Usos recientes: más uso, más brillo. */
  uso?: number;
  /** Última actividad en ms; los recuerdos se enfrían despacio. */
  t_actividad?: number;
  etiquetas?: string[];
  /** Luna: un recuerdo que orbita en vez de ser planeta principal. */
  luna?: boolean;
}

export interface CarpetaCerebro {
  id: string;
  titulo: string;
  ref?: string;
  alcance?: AlcanceNodo;
  uso?: number;
  t_actividad?: number;
  etiquetas?: string[];
}

export interface EnlaceCerebro {
  de: string;
  a: string;
  t?: number;
}

export interface CerebroFuente {
  id: string;
  titulo: string;
  dueno: string;
  alcance: AlcanceNodo;
  capas?: string[];
  t_creado?: number;
  t_actividad?: number;
  uso?: number;
  etiquetas?: string[];
  carpetas?: CarpetaCerebro[];
  archivos?: RecuerdoCerebro[];
  memorias?: RecuerdoCerebro[];
  fusiones?: EnlaceCerebro[];
  telepatias?: EnlaceCerebro[];
}

export interface OpcionesPlantillaCerebros {
  ahora?: number;
  observador?: Observador;
  /** Vida media del enfriamiento; por defecto 30 días. */
  vidaMediaMs?: number;
}

const MAPA_ALCANCE: Record<string, AlcanceNodo> = {
  account: 'privado',
  profile: 'contactos',
  group: 'grupo',
  page: 'comunidad',
  public: 'publico',
  publico: 'publico',
};

/** Alcance del cerebro (scope del OS) traducido al del grafo. Desconocido = privado. */
export function mapearAlcanceCerebro(scope: string): AlcanceNodo {
  return MAPA_ALCANCE[scope] ?? 'privado';
}

/**
 * Brillo de un recuerdo: sube con el uso y baja despacio con el tiempo.
 * Nunca llega a cero (un recuerdo no desaparece solo) ni supera 1.
 */
export function brilloRecuerdo(
  uso = 0,
  tActividad?: number,
  ahora = Date.now(),
  vidaMediaMs = VIDA_MEDIA_ENFRIAMIENTO_MS,
): number {
  const usos = Number.isFinite(uso) ? Math.max(0, uso) : 0;
  const factorUso = usos / (usos + 4);
  const vida = vidaMediaMs > 0 ? vidaMediaMs : VIDA_MEDIA_ENFRIAMIENTO_MS;
  const edad = tActividad === undefined ? 0 : Math.max(0, ahora - tActividad);
  const recencia = Math.pow(0.5, edad / vida);
  const brillo = (0.3 + 0.7 * factorUso) * (0.25 + 0.75 * recencia);
  return Math.min(1, Math.max(BRILLO_MINIMO, brillo));
}

interface NodoBorrador {
  id: string;
  tipo: string;
  titulo: string;
  formato: string;
  ref: string;
  alcance: AlcanceNodo;
  dueno: string;
  capas: string[];
  t_creado: number;
  t_actividad: number;
  peso: number;
  etiquetas: string[];
}

function nodoDe(borrador: NodoBorrador): Nodo {
  return { ...borrador, etiquetas: [...borrador.etiquetas], capas: [...borrador.capas] };
}

function anadirRecuerdo(
  grafo: Grafo4D,
  recuerdo: RecuerdoCerebro,
  tipo: 'archivo' | 'memoria',
  formatoPorDefecto: string,
  cerebro: CerebroFuente,
  capasBase: string[],
  ahora: number,
  vida: number,
): void {
  const capas = [...capasBase, tipo === 'memoria' ? 'memorias' : 'archivos'];
  if (recuerdo.luna) capas.push('luna');
  const etiquetas = [...(recuerdo.etiquetas ?? [])];
  if (recuerdo.luna) etiquetas.push('luna');
  const tActividad = recuerdo.t_actividad ?? ahora;
  const creado = anadirNodo(
    grafo,
    nodoDe({
      id: recuerdo.id,
      tipo,
      titulo: recuerdo.titulo,
      formato: recuerdo.formato ?? formatoPorDefecto,
      ref: recuerdo.ref,
      alcance: recuerdo.alcance ?? cerebro.alcance,
      dueno: cerebro.dueno,
      capas,
      t_creado: tActividad,
      t_actividad: tActividad,
      peso: brilloRecuerdo(recuerdo.uso ?? 0, tActividad, ahora, vida),
      etiquetas,
    }),
  );
  if (!creado) return;

  const padre = recuerdo.carpetaId && grafo.nodos.has(recuerdo.carpetaId)
    ? recuerdo.carpetaId
    : cerebro.id;
  anadirArista(grafo, {
    de: padre,
    a: recuerdo.id,
    tipo: tipo === 'memoria' && padre === cerebro.id ? 'deriva' : 'contiene',
    t: tActividad,
    intensidad: 0.6 + brilloRecuerdo(recuerdo.uso ?? 0, tActividad, ahora, vida) * 0.4,
  });
}

/**
 * Construye el grafo de la plantilla Cerebros a partir de datos ya leídos.
 * Solo referencias: nunca copia contenido. Con `observador`, poda lo que esa
 * persona no puede ver (lo privado ajeno no aparece).
 */
export function construirGrafoCerebros(
  cerebros: readonly CerebroFuente[],
  opciones: OpcionesPlantillaCerebros = {},
): Grafo4D {
  const ahora = opciones.ahora ?? Date.now();
  const vida =
    opciones.vidaMediaMs && opciones.vidaMediaMs > 0
      ? opciones.vidaMediaMs
      : VIDA_MEDIA_ENFRIAMIENTO_MS;
  const grafo = crearGrafo();

  for (const cerebro of cerebros) {
    const tCerebro = cerebro.t_actividad ?? ahora;
    const capasBase = ['cerebros', cerebro.alcance, ...(cerebro.capas ?? [])];
    anadirNodo(
      grafo,
      nodoDe({
        id: cerebro.id,
        tipo: 'cerebro',
        titulo: cerebro.titulo,
        formato: 'documento',
        ref: `/cerebros/${cerebro.id}`,
        alcance: cerebro.alcance,
        dueno: cerebro.dueno,
        capas: capasBase,
        t_creado: cerebro.t_creado ?? tCerebro,
        t_actividad: tCerebro,
        peso: brilloRecuerdo(cerebro.uso ?? 0, tCerebro, ahora, vida),
        etiquetas: [...(cerebro.etiquetas ?? [])],
      }),
    );

    for (const carpeta of cerebro.carpetas ?? []) {
      const tCarpeta = carpeta.t_actividad ?? tCerebro;
      const creada = anadirNodo(
        grafo,
        nodoDe({
          id: carpeta.id,
          tipo: 'carpeta',
          titulo: carpeta.titulo,
          formato: 'app',
          ref: carpeta.ref ?? `/cerebros/${cerebro.id}?carpeta=${carpeta.id}`,
          alcance: carpeta.alcance ?? cerebro.alcance,
          dueno: cerebro.dueno,
          capas: [...capasBase, 'carpetas'],
          t_creado: tCarpeta,
          t_actividad: tCarpeta,
          peso: brilloRecuerdo(carpeta.uso ?? 0, tCarpeta, ahora, vida),
          etiquetas: [...(carpeta.etiquetas ?? [])],
        }),
      );
      if (!creada) continue;
      anadirArista(grafo, {
        de: cerebro.id,
        a: carpeta.id,
        tipo: 'contiene',
        t: tCarpeta,
        intensidad: 0.9,
      });
    }

    for (const archivo of cerebro.archivos ?? []) {
      anadirRecuerdo(grafo, archivo, 'archivo', 'texto', cerebro, capasBase, ahora, vida);
    }
    for (const memoria of cerebro.memorias ?? []) {
      anadirRecuerdo(grafo, memoria, 'memoria', 'documento', cerebro, capasBase, ahora, vida);
    }

    for (const fusion of cerebro.fusiones ?? []) {
      anadirArista(grafo, {
        de: fusion.de,
        a: fusion.a,
        tipo: 'fusion',
        t: fusion.t ?? ahora,
        intensidad: 1,
      });
    }
    for (const telepatia of cerebro.telepatias ?? []) {
      anadirArista(grafo, {
        de: telepatia.de,
        a: telepatia.a,
        tipo: 'telepatia',
        t: telepatia.t ?? ahora,
        intensidad: 0.8,
      });
    }
  }

  return opciones.observador ? podarGrafo(grafo, opciones.observador) : grafo;
}
