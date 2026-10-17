/**
 * Ajustes del cerebro: medios, seguridad, privacidad, vinculación y sincronización (CB1013R).
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §8.
 * Módulo PURO: sin Supabase, sin `window`, sin `node:*`.
 */

/** Capacidades de los medios. */
export type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";

/** Etiquetas en español para las capacidades. */
export const CAPACIDADES: Record<Capacidad, string> = {
  texto: "Texto",
  imagen: "Imagen",
  voz: "Voz",
  video: "Video",
  embeddings: "Embeddings",
  agentes: "Agentes",
};

/** Ajustes objetivo para un cerebro, memoria o carpeta. */
export interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: {
    capacidades: Partial<Record<Capacidad, string>>;
    almacenamiento: string[]; // ids de servidor/medio o "auto"
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

/** Ajustes completos de un cerebro (incluye memorias y carpetas). */
export interface AjustesCerebro {
  cerebro: AjustesObjetivo;
  memorias: Record<string, Partial<AjustesObjetivo>>;
  carpetas: Record<string, Partial<AjustesObjetivo>>;
}

/** Ajustes por defecto para un nuevo cerebro. */
export const AJUSTES_POR_DEFECTO: AjustesObjetivo = {
  privacidad: "privado", // Se ajustará según el scope en leerAjustes
  cifradoLocal: false,
  medios: {
    capacidades: {},
    almacenamiento: [],
  },
  sync: {
    direccion: "ambas",
    auto: true,
    destinos: [],
  },
  acceso: [],
};

/** Qué se aplica ya y qué solo se guarda. */
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

/**
 * Lee los ajustes de un cerebro de forma defensiva.
 * @param cerebro Objeto con scope y config opcionales
 * @returns AjustesCerebro con valores por defecto y los proporcionados
 */
export function leerAjustes(cerebro: {
  scope?: string | null;
  config?: Record<string, unknown> | null;
}): AjustesCerebro {
  // Valor por defecto según el scope
  // Según el contrato: 'privado' para account/profile, 'grupo' para group/page
  // desconocido o vacío cuenta como privado (para que nada quede escondido)
  const alcance = String(cerebro.scope ?? "").trim().toLowerCase();
  const privacidadPorDefecto =
    alcance === "account" || alcance === "profile"
      ? "privado"
      : alcance === "group" || alcance === "community" || alcance === "page"
        ? "grupo"
        : "privado"; // desconocido o vacío

  const ajustesCerebro: AjustesObjetivo = {
    ...AJUSTES_POR_DEFECTO,
    privacidad: privacidadPorDefecto,
  };

  // Extraer ajustes de config si existen
  const configAjustes =
    cerebro.config && typeof cerebro.config === "object" && "ajustes" in cerebro.config
      ? (cerebro.config as { ajustes?: unknown }).ajustes
      : undefined;

  // Si no hay ajustes en config, devolver solo con el scope ajustado
  if (!configAjustes || typeof configAjustes !== "object" || configAjustes === null) {
    return {
      cerebro: ajustesCerebro,
      memorias: {},
      carpetas: {},
    };
  }

  // Tipo para los ajustes de config
  type ConfigAjustes = {
    cerebro?: Partial<AjustesObjetivo>;
    memorias?: Record<string, Partial<AjustesObjetivo>>;
    carpetas?: Record<string, Partial<AjustesObjetivo>>;
  };

  const ajustesConfig = configAjustes as ConfigAjustes;

  // Combinar ajustes de cerebro
  const cerebroFinal: AjustesObjetivo = {
    ...ajustesCerebro,
    ...(ajustesConfig.cerebro ?? {}),
  };

  return {
    cerebro: cerebroFinal,
    memorias: ajustesConfig.memorias ?? {},
    carpetas: ajustesConfig.carpetas ?? {},
  };
}

/**
 * Ajusta parcialmente un objetivo y devuelve un config NUEVO.
 * En memorias y carpetas guarda SOLO lo que difiere del cerebro.
 * @param config Config actual
 * @param objetivo Especifica si es cerebro, memoria o carpeta con su id
 * @param parcial Ajustes parciales a aplicar
 * @returns Nuevo config sin mutar el original
 */
export function conAjustes(
  config: Record<string, unknown>,
  objetivo:
    | { tipo: "cerebro" }
    | { tipo: "memoria" | "carpeta"; id: string },
  parcial: Partial<AjustesObjetivo>
): Record<string, unknown> {
  // No mutar el config original
  const nuevoConfig = { ...config };

   // Asegurarnos de tener un objeto ajustes para trabajar (y clonarlo si existía para no mutar el original)
    let ajustes = nuevoConfig.ajustes as Record<string, unknown> | undefined;
   if (!ajustes || typeof ajustes !== "object") {
     ajustes = {};
     nuevoConfig.ajustes = ajustes;
   } else {
     // Clonamos el objeto ajustes para no mutar el original
     ajustes = { ...ajustes };
     nuevoConfig.ajustes = ajustes;
   }

  switch (objetivo.tipo) {
    case "cerebro": {
      // Para el cerebro, combinar con los ajustes existentes
      const ajustesCerebroActual = ajustes.cerebro ?? {};
      ajustes.cerebro = { ...ajustesCerebroActual, ...parcial };
      break;
    }
    case "memoria":
    case "carpeta": {
      // Para memorias y carpetas, guardar solo lo que difiere del cerebro
      const coleccion =
        objetivo.tipo === "memoria"
          ? (ajustes.memorias ?? {})
          : (ajustes.carpetas ?? {});
      const id = objetivo.id;

      // Obtener los ajustes actuales del cerebro (para comparar)
       const ajustesCerebro: Partial<AjustesObjetivo> = ajustes.cerebro ?? {};

      // Calcular la diferencia: solo lo que está en parcial pero no en el cerebro (o es diferente)
      const diferencias = {} as Record<string, unknown>;
      for (const clave in parcial) {
        const valorParcial = parcial[clave as keyof Partial<AjustesObjetivo>];
        const valorCerebro = ajustesCerebro[clave as keyof Partial<AjustesObjetivo>];

        let esDiferente = false;

        // Para arrays, comparar contenido
        if (
          Array.isArray(valorParcial) &&
          Array.isArray(valorCerebro)
        ) {
          esDiferente = JSON.stringify(valorParcial) !== JSON.stringify(valorCerebro);
        }
        // Para objetos simples (no arrays, no null), comparar directamente
        else if (
          valorParcial !== null &&
          typeof valorParcial === "object" &&
          valorCerebro !== null &&
          typeof valorCerebro === "object"
        ) {
          // Para objetos simples, comparar profundamente
          esDiferente = JSON.stringify(valorParcial) !== JSON.stringify(valorCerebro);
        }
        // Para valores primitivos y null/undefined, comparar directamente
        else {
          esDiferente = valorParcial !== valorCerebro;
        }

        if (esDiferente) {
          (diferencias as any)[clave] = valorParcial;
        }
      }

      // Solo guardar si hay diferencias
      if (Object.keys(diferencias).length > 0) {
        if (objetivo.tipo === "memoria") {
          ajustes.memorias = {
            ...(ajustes.memorias ?? {}),
            [id]: diferencias,
          };
        } else {
          ajustes.carpetas = {
            ...(ajustes.carpetas ?? {}),
            [id]: diferencias,
          };
        }
      }
      break;
    }
  }

  return nuevoConfig;
}

/**
 * Aplica la herencia: lo de la memoria o carpeta pisa lo del cerebro, campo a campo.
 * @param ajustes Ajustes completos del cerebro
 * @param objetivo Especifica si es cerebro, memoria o carpeta con su id
 * @returns Ajustes efectivos para el objetivo
 */
export function ajustesEfectivos(
  ajustes: AjustesCerebro,
  objetivo:
    | { tipo: "cerebro" }
    | { tipo: "memoria" | "carpeta"; id: string }
): AjustesObjetivo {
  // Empezar con los ajustes del cerebro
  let resultado = { ...ajustes.cerebro };

  switch (objetivo.tipo) {
    case "memoria":
    case "carpeta":
      // Aplicar ajustes de la memoria o carpeta (pisan los del cerebro, campo a campo)
      const ajustesObjetivo =
        objetivo.tipo === "memoria"
          ? ajustes.memorias[objetivo.id]
          : ajustes.carpetas[objetivo.id];
      if (ajustesObjetivo) {
        // Hacer un merge profundo de los campos
        resultado = {
          ...resultado,
          privacidad:
            ajustesObjetivo.privacidad !== undefined
              ? ajustesObjetivo.privacidad
              : resultado.privacidad,
          cifradoLocal:
            ajustesObjetivo.cifradoLocal !== undefined
              ? ajustesObjetivo.cifradoLocal
              : resultado.cifradoLocal,
          medios: {
            capacidades: {
              ...(resultado.medios?.capacidades ?? {}),
              ...(ajustesObjetivo.medios?.capacidades ?? {}),
            },
             almacenamiento:
               ajustesObjetivo.medios?.almacenamiento && ajustesObjetivo.medios.almacenamiento.length > 0
                 ? ajustesObjetivo.medios!.almacenamiento
                 : resultado.medios.almacenamiento,
          },
          sync: {
            direccion:
              ajustesObjetivo.sync?.direccion !== undefined
                ? ajustesObjetivo.sync.direccion
                : resultado.sync.direccion,
            auto:
              ajustesObjetivo.sync?.auto !== undefined
                ? ajustesObjetivo.sync.auto
                : resultado.sync.auto,
             destinos:
               ajustesObjetivo.sync?.destinos && ajustesObjetivo.sync.destinos.length > 0
                 ? ajustesObjetivo.sync!.destinos
                 : resultado.sync.destinos,
          },
           acceso:
             ajustesObjetivo.acceso && ajustesObjetivo.acceso.length > 0
               ? ajustesObjetivo.acceso!
               : resultado.acceso,
        };
      }
      break;
    case "cerebro":
    default:
      // Para el cerebro, no hay herencia adicional
      break;
  }

  return resultado;
}