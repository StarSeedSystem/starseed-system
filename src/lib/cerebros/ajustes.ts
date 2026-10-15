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

    // Inicializar la estructura de ajustes si no existe
    if (!nuevoConfig.ajustes || typeof nuevoConfig.ajustes !== "object") {
      nuevoConfig.ajustes = {};
    }

    // Work with references to avoid repeating the property access
    const cerebro = nuevoConfig.ajustes.cerebro as Partial<AjustesObjetivo> | undefined;
    const memorias = nuevoConfig.ajustes.memorias as Record<string, Partial<AjustesObjetivo>> | undefined;
    const carpetas = nuevoConfig.ajustes.carpetas as Record<string, Partial<AjustesObjetivo>> | undefined;

   switch (objetivo.tipo) {
     case "cerebro":
       // Para el cerebro, combinar con los ajustes existentes
       nuevoConfig.ajustes.cerebro = { ...(nuevoConfig.ajustes.cerebro ?? {}), ...parcial };
       break;
     case "memoria":
     case "carpeta":
       // Para memorias y carpetas, guardar solo lo que difiere del cerebro
       const coleccion =
         objetivo.tipo === "memoria" ? nuevoConfig.ajustes.memorias : nuevoConfig.ajustes.carpetas;
       const id = objetivo.id;

       // Calcular la diferencia: solo lo que está en parcial pero no en el cerebro (o es diferente)
       const diferencias = {} as Record<string, unknown>;
       for (const clave in parcial) {
         const valorParcial = parcial[clave as keyof Partial<AjustesObjetivo>];
         const valorCerebro = nuevoConfig.ajustes.cerebro?.[clave as keyof Partial<AjustesObjetivo>];

         let esDiferete = false;

         // Para arrays, comparar contenido
         if (Array.isArray(valorParcial) && Array.isArray(valorCerebro)) {
           esDiferete = JSON.stringify(valorParcial) !== JSON.stringify(valorCerebro);
         } 
         // Para objetos simples (no arrays, no null), comparar directamente
         else if (
           valorParcial !== null && 
           typeof valorParcial === "object" && 
           valorCerebro !== null && 
           typeof valorCerebro === "object"
         ) {
           // Para objetos simples, comparar profundamente
           esDiferete = JSON.stringify(valorParcial) !== JSON.stringify(valorCerebro);
         }
         // Para valores primitivos y null/undefined, comparar directamente
         else {
           esDiferete = valorParcial !== valorCerebro;
         }

         if (clave === 'privacidad') {
           console.log('DEBUG privacidad: valorParcial=', valorParcial, 'valorCerebro=', valorCerebro, 'esDiferete=', esDiferete);
         }

         if (esDiferete) {
           (diferencias as any)[clave] = valorParcial;
         }
       }

        // Solo guardar si hay diferencias
        if (Object.keys(diferencias).length > 0) {
          if (!coleccion) {
            // Inicializar la colección si no existe
            const nuevaColeccion: Record<string, Partial<AjustesObjetivo>> = {};
            nuevaColeccion[id] = diferencias;
            if (objetivo.tipo === "memoria") {
              nuevoConfig.ajustes.memorias = nuevaColeccion;
            } else {
              nuevoConfig.ajustes.carpetas = nuevaColeccion;
            }
          } else {
            coleccion[id] = diferencias;
          }
        }
       break;
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

  if (objetivo.tipo === "memoria" || objetivo.tipo === "carpeta") {
    // Obtener los ajustes de la memoria o carpeta (pueden estar undefined)
    const ajustesObjetivo =
      objetivo.tipo === "memoria"
        ? ajustes.memorias[objetivo.id]
        : ajustes.carpetas[objetivo.id];

    if (ajustesObjetivo) {
      // Para cada campo, decidir si se aplica el valor de la memoria/carpeta o se mantiene el del cerebro
      // según la constante APLICACION

      // privacidad
      if (APLICACION.privacidad === "se-aplica") {
        resultado.privacidad =
          ajustesObjetivo.privacidad !== undefined
            ? ajustesObjetivo.privacidad
            : resultado.privacidad;
      } // else: solo-se-guarda, mantener el valor del cerebro (ya en resultado)

      // cifradoLocal
      if (APLICACION.cifradoLocal === "se-aplica") {
        resultado.cifradoLocal =
          ajustesObjetivo.cifradoLocal !== undefined
            ? ajustesObjetivo.cifradoLocal
            : resultado.cifradoLocal;
      } // else: solo-se-guarda

      // medios: tenemos que manejar los subcampos
      const mediosCerebro = resultado.medios;
      const mediosObjetivo = ajustesObjetivo.medios;
      let nuevosMedios = { ...mediosCerebro };

      // medios.almacenamiento
      if (APLICACION["medios.almacenamiento"] === "se-aplica") {
        nuevosMedios.almacenamiento =
          mediosObjetivo?.almacenamiento !== undefined
            ? mediosObjetivo.almacenamiento
            : mediosCerebro.almacenamiento;
      } // else: solo-se-guarda, mantener el del cerebro

      // medios.capacidades
      if (APLICACION["medios.capacidades"] === "se-aplica") {
        // Combinar capacidades: el objetivo puede agregar o sobrescribir
        nuevosMedios.capacidades = {
          ...(mediosCerebro.capacidades ?? {}),
          ...(mediosObjetivo?.capacidades ?? {}),
        };
      } // else: solo-se-guarda, mantener el del cerebro

      resultado.medios = nuevosMedios;

      // sync
      if (APLICACION.sync === "se-aplica") {
        // Sobrescribir sync si está definido en el objetivo
        const syncObjetivo = ajustesObjetivo.sync;
        if (syncObjetivo !== undefined) {
          resultado.sync = {
            ...resultado.sync,
            ...syncObjetivo,
          };
        }
      } // else: solo-se-guarda, mantener el del cerebro

      // acceso
      if (APLICACION.acesso === "se-aplica") {
        resultado.acesso =
          ajustesObjetivo.acesso !== undefined
            ? ajustesObjetivo.acesso
            : resultado.acesso;
      } // else: solo-se-guarda, mantener el del cerebro
    }
  }
  // Si objetivo es cerebro, no hacemos nada (resultado ya es el cerebro)

  return resultado;
}