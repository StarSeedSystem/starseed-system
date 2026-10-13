/**
 * Ajustes del cerebro: modelo puro con herencia (cerebro, memoria, carpeta) (CB1013R).
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §8.
 */

/**
 * Capacidades de los medios (texto, imagen, voz, video, embeddings, agentes).
 */
export type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";

/**
 * Ajustes aplicables a un objetivo (cerebro, memoria o carpeta).
 */
export interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: {
    capacidades: Partial<Record<Capacidad, string>>;
    almacenamiento: string[];
  };
  sync: {
    direccion: "enviar" | "recibir" | "ambas" | "ninguna";
    auto: boolean;
    destinos: string[];
  };
  acceso: {
    quien: string;
    nivel: "leer" | "escribir" | "admin";
  }[];
}

/**
 * Ajustes completos del cerebro, incluyendo sobrescrituras por memoria y carpeta.
 */
export interface AjustesCerebro {
  cerebro: AjustesObjetivo;
  memorias: Record<string, Partial<AjustesObjetivo>>;
  carpetas: Record<string, Partial<AjustesObjetivo>>;
}

/**
 * Etiquetas en español para las capacidades.
 */
export const CAPACIDADES: Record<Capacidad, string> = {
  texto: "Texto",
  imagen: "Imagen",
  voz: "Voz",
  video: "Video",
  embeddings: "Embeddings",
  agentes: "Agentes",
};

/**
 * Ajustes por defecto para un nuevo cerebro.
 * - Privacidad según la pestaña: 'privado' para account/profile, 'grupo' para group/page
 * - cifradoLocal: false
 * - capacidades: todas en 'auto'
 * - almacenamiento: [] (vacío)
 * - sync: { direccion: 'ambas', auto: true, destinos: [] }
 * - acceso: [] (vacío)
 */
export const AJUSTES_POR_DEFECTO: AjustesObjetivo = {
  privacidad: "privado", // Se sobrescribirá según el scope en leerAjustes
  cifradoLocal: false,
  medios: {
    capacidades: {
      texto: "auto",
      imagen: "auto",
      voz: "auto",
      video: "auto",
      embeddings: "auto",
      agentes: "auto",
    },
    almacenamiento: [],
  },
  sync: {
    direccion: "ambas",
    auto: true,
    destinos: [],
  },
  acceso: [],
};

/**
 * Lee los ajustes de un cerebro de forma defensiva.
 * @param cerebro Objeto con scope y config opcionales
 * @returns AjustesCerebro con los ajustes del cerebro, memorias y carpetas
 */
export function leerAjustes(cerebro: {
  scope?: string | null;
  config?: Record<string, unknown> | null;
}): AjustesCerebro {
  const ajustesBase = {
    ...AJUSTES_POR_DEFECTO,
    privacidad:
      cerebro.scope === "account" || cerebro.scope === "profile"
        ? "privado"
        : cerebro.scope === "group" ||
          cerebro.scope === "community" ||
          cerebro.scope === "page"
        ? "grupo"
        : "privado", // Por defecto, lo desconocido va a privados
  };

  const ajustesGuardados =
    cerebro.config && cerebro.config.ajustes
      ? (cerebro.config.ajustes as AjustesObjetivo)
      : {};

  const ajustesCerebro: AjustesObjetivo = {
    privacidad: ajustesGuardados.privacidad ?? ajustesBase.privacidad,
    cifradoLocal:
      ajustesGuardados.cifradoLocal ?? ajustesBase.cifradoLocal,
    medios: {
      capacidades: {
        ...ajustesBase.medios.capacidades,
        ...ajustesGuardados.medios?.capacidades,
      },
      almacenamiento: [
        ...(ajustesBase.medios.almacenamiento ?? []),
        ...(ajustesGuardados.medios?.almacenamiento ?? []),
      ],
    },
    sync: {
      direccion:
        ajustesGuardados.sync?.direccion ?? ajustesBase.sync.direccion,
      auto: ajustesGuardados.sync?.auto ?? ajustesBase.sync.auto,
      destinos: [
        ...(ajustesBase.sync.destinos ?? []),
        ...(ajustesGuardados.sync?.destinos ?? []),
      ],
    },
    acceso: [...(ajustesGuardados.acceso ?? []), ...(ajustesBase.acceso ?? [])],
  };

  return {
    cerebro: ajustesCerebro,
    memorias: {},
    carpetas: {},
  };
}

/**
 * Devuelve un config NUEVO con los ajustes aplicados.
 * Para memorias y carpetas, guarda SOLO lo que difiere del cerebro.
 * @param config Configuración actual del cerebro
 * @param objetivo Especifica si es cerebro, memoria o carpeta
 * @param parcial Ajustes parciales a aplicar
 * @returns Nueva configuración sin mutar la original
 */
export function conAjustes(
  config: Record<string, unknown>,
  objetivo:
    | { tipo: "cerebro" }
    | { tipo: "memoria" | "carpeta"; id: string },
  parcial: Partial<AjustesObjetivo>
): Record<string, unknown> {
  // Copiamos el config para no mutar el original
  const nuevoConfig = { ...config };

  // Obtenemos los ajustes actuales completos del cerebro (con defensa)
  const ajustesCerebroActualCompleto = leerAjustes({
    scope: config.config?.scope ?? null,
    config: config.config ?? null,
  });

  if (objetivo.tipo === "cerebro") {
    // Para el cerebro, actualizamos directamente los ajustes
    nuevoConfig.config = {
      ...(nuevoConfig.config ?? {}),
      ajustes: {
        ...ajustesCerebroActualCompleto.cerebro,
        ...parcial,
      },
    };
} else {
    // Para memoria o carpeta, primero obtenemos lo que actualmente está guardado
    const ajustesObjetivoActual =
      objetivo.tipo === "memoria"
        ? ajustesCerebroActualCompleto.memorias[objetivo.id] ?? {}
        : ajustesCerebroActualCompleto.carpetas[objetivo.id] ?? {};

    // Luego calculamos el estado deseado aplicando los cambios parciales
    const estadoDeseado = {
      ...ajustesObjetivoActual,
      ...parcial,
    };

    // Finalmente, solo guardamos lo que difiere del cerebro
    const diferencia: Partial<AjustesObjetivo> = {};
    for (const clave in estadoDeseado) {
      const valorDeseado = estadoDeseado[clave as keyof AjustesObjetivo];
      const valorCerebro =
        objetivo.tipo === "memoria"
          ? ajustesCerebroActualCompleto.cerebro[clave as keyof AjustesObjetivo]
          : ajustesCerebroActualCompleto.cerebro[clave as keyof AjustesObjetivo];

      // Si el valor deseado es diferente del cerebro, lo incluimos en lo que guardaremos
      if (valorDeseado !== valorCerebro) {
        diferencia[clave as keyof AjustesObjetivo] = valorDeseado;
      }
    }

    // Solo actualizamos si hay diferencias
    if (Object.keys(diferencia).length > 0) {
      if (objetivo.tipo === "memoria") {
        nuevoConfig.config = {
          ...(nuevoConfig.config ?? {}),
          ajustes: {
            ...ajustesCerebroActualCompleto.cerebro,
            memorias: {
              ...ajustesCerebroActualCompleto.memorias,
              [objetivo.id]: {
                ...diferencia,
              },
            },
          },
        };
      } else {
        // tipo === "carpeta"
        nuevoConfig.config = {
          ...(nuevoConfig.config ?? {}),
          ajustes: {
            ...ajustesCerebroActualCompleto.cerebro,
            carpetas: {
              ...ajustesCerebroActualCompleto.carpetas,
              [objetivo.id]: {
                ...diferencia,
              },
            },
          },
        };
      }
    }
  }

  return nuevoConfig;
}

/**
 * Calcula los ajustes efectivos aplicando la herencia.
 * Lo de la memoria o carpeta pisa lo del cerebro, campo a campo.
 * @param a Ajustes completos del cerebro
 * @param objetivo Especifica el objetivo (memoria o carpeta con su id)
 * @returns Ajustes efectivos para el objetivo
 */
export function ajustesEfectivos(
  a: AjustesCerebro,
  objetivo: { tipo: "memoria" | "carpeta"; id: string }
): AjustesObjetivo {
  // Empezamos con los ajustes del cerebro
  const efectivos: AjustesObjetivo = { ...a.cerebro };

  // Los ajustes de memoria o carpeta pisan los del cerebro
  const ajustesObjetivo =
    objetivo.tipo === "memoria"
      ? a.memorias[objetivo.id] ?? {}
      : a.carpetas[objetivo.id] ?? {};

  // Hacemos una fusión profunda para cada campo
  for (const clave in ajustesObjetivo) {
    const valorObjetivo = ajustesObjetivo[clave as keyof AjustesObjetivo];
      const valorCerebro = efectivos[clave as keyof AjustesObjetivo];

    // Para objetos que necesitan fusión profunda (medios, sync, acceso)
    if (
      clave === "medios" ||
      clave === "sync" ||
      clave === "acceso"
    ) {
      if (clave === "medios") {
        efectivos.medios = {
          ...(efectivos.medios as any),
          ...(valorObjetivo as any),
        };
        // Especialmente para capacidades, hacemos fusión profunda
        if (valorObjetivo.capacidades) {
          efectivos.medios.capacidades = {
            ...(efectivos.medios.capacidades as any),
            ...(valorObjetivo.capacidades as any),
          };
        }
        if (valorObjetivo.almacenamiento) {
          efectivos.medios.almacenamiento = [
            ...(efectivos.medios.almacenamiento as any),
            ...(valorObjetivo.almacenamiento as any),
          ];
        }
      } else if (clave === "sync") {
        efectivos.sync = {
          ...(efectivos.sync as any),
          ...(valorObjetivo as any),
        };
        if (valorObjetivo.destinos) {
          efectivos.sync.destinos = [
            ...(efectivos.sync.destinos as any),
            ...(valorObjetivo.destinos as any),
          ];
        }
      } else if (clave === "acceso") {
        efectivos.acceso = [
          ...(efectivos.acceso as any),
          ...(valorObjetivo as any),
        ];
      }
    } else {
      // Para campos simples, sobrescribimos directamente
      efectivos[clave as keyof AjustesObjetivo] = valorObjetivo;
    }
  }

  return efectivos;
}

/**
 * Indica qué ajustes se aplican ya y qué solo se guardan.
 * Según §8:
 * - Destinos de memoria (medios.almacenamiento): se-aplica
 * - Privacidad que cambia de pestaña: se-aplica
 * - Permisos por memoria o carpeta: solo-se-guarda
 * - Cifrado local: solo-se-guarda
 * - Sync: se-aplica (destinos de memoria)
 * - Capacidades: solo-se-guarda (hasta que el orquestador las lea)
 */
export const APLICACION: Record<
  | "medios.almacenamiento"
  | "privacidad"
  | "acceso"
  | "cifradoLocal"
  | "sync"
  | "medios.capacidades",
  "se-aplica" | "solo-se-guarda"
> = {
  "medios.almacenamiento": "se-aplica",
  privacidad: "se-aplica",
  acceso: "solo-se-guarda",
  cifradoLocal: "solo-se-guarda",
  sync: "se-aplica",
  "medios.capacidades": "solo-se-guarda",
};