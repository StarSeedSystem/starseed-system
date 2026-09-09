/**
 * EL NÚCLEO INTOCABLE DE STARSEED OS (Ola 307)
 *
 * Alex fijó el rumbo hoy: el sistema debe ser editable por la IA en tiempo
 * real y compartible, «manteniendo las funciones y opciones principales y
 * fundamentales de StarSeed OS por seguridad». Este módulo es esa condición
 * escrita en código: la lista de lo que ninguna edición, paquete ni
 * instalación puede quitarle a una persona, más un validador que revisa un
 * cambio propuesto ANTES de aplicarlo.
 *
 * Sin este núcleo, un paquete compartido podría dejar a alguien sin la
 * salida: sin ajustes, sin permisos, sin forma de volver atrás. Con él,
 * editar es seguro.
 *
 * Módulo PURO: sin React, sin `node:*`, sin red ni disco. SSR-safe.
 *
 * Las invariantes derivan de CLAUDE.md §6 (identidad soberana,
 * descentralización, singularidad del contenido, privacidad ↔ transparencia,
 * justicia restaurativa) y de la regla de datos honestos del 2026-07-01.
 * No se inventan aquí: si falta alguna, se anota como `// candidata:` y la
 * decide Alex.
 */

/** Una función del sistema que ninguna edición puede eliminar. */
export interface Invariante {
  /** Identificador estable; es lo que aparece en `Violacion.invariante`. */
  id: string;
  /** Nombre corto y legible para la persona que usa el sistema. */
  titulo: string;
  /** De qué protege a esa persona, en una sola frase. */
  porque: string;
  /** Rutas o componentes que la encarnan: un tema puede moverlos, no borrarlos. */
  superficies: string[];
}

/** Lo que un cambio rompe, y cómo repararlo sin renunciar al cambio. */
export interface Violacion {
  /** `id` de la invariante rota. */
  invariante: string;
  /** Qué hace el cambio, dicho en claro. */
  que: string;
  /** Cómo arreglarlo: un validador que solo dice «no» enseña a saltárselo. */
  comoArreglarlo: string;
}

/** Cambio propuesto por la IA, un paquete de la Biblioteca o una instalación. */
export interface CambioPropuesto {
  /** Rutas que el cambio deja inalcanzables. */
  rutasOcultas?: string[];
  /** Superficies (rutas o componentes) que el cambio elimina del sistema. */
  superficiesQuitadas?: string[];
  /** Permisos que el cambio pide para sí mismo. */
  permisosPedidos?: string[];
  /** Atajo explícito: el cambio esconde Ajustes. */
  ocultaAjustes?: boolean;
  /** Atajo explícito: el cambio apaga el deshacer. */
  desactivaDeshacer?: boolean;
}

/**
 * Las siete funciones que sobreviven a cualquier edición, paquete o tema.
 * El orden es estable: `validarContraInvariantes` devuelve las violaciones
 * siguiéndolo, para que dos revisiones del mismo paquete se lean igual.
 */
export const INVARIANTES: Invariante[] = [
  {
    id: "salida-siempre",
    titulo: "Salida siempre disponible",
    porque:
      "Sin acceso a Ajustes y a «restaurar mi sistema» desde cualquier estado, una edición mala deja de ser un error y pasa a ser una trampa.",
    superficies: ["/settings", "/settings#restaurar"],
  },
  {
    id: "identidad-soberana",
    titulo: "Identidad soberana",
    porque:
      "La cuenta, los perfiles, cerrar sesión y exportar los datos propios son de la persona, no del diseño que tenga puesto hoy.",
    superficies: ["/cuenta", "/profile", "/login"],
  },
  {
    id: "permisos-visibles",
    titulo: "Permisos y registro visibles",
    porque:
      "Quien no puede ver qué permisos ha dado ni qué agente hizo qué, no está eligiendo: está confiando a ciegas.",
    superficies: ["/seguridad", "/settings-audit", "src/lib/astraura/ui-permisos.ts"],
  },
  {
    id: "navegacion-fundamental",
    titulo: "Navegación fundamental",
    porque:
      "Llegar al lanzador y a la Biblioteca es lo que permite instalar, desinstalar y cambiar de idea: un tema puede moverlos, nunca borrarlos.",
    superficies: ["src/components/layout/omni-dock.tsx", "/library", "/hub"],
  },
  {
    id: "voto-integro",
    titulo: "Integridad del voto",
    porque:
      "Un retoque cosmético en gobernanza que cambie lo que alguien cree estar votando convierte la democracia directa en un engaño.",
    superficies: ["/decisiones", "src/components/decisions"],
  },
  {
    id: "datos-honestos",
    titulo: "Datos honestos",
    porque:
      "Nada inventado puede presentarse como real (regla del 2026-07-01): un dato falso con aire de verdadero contamina todas las decisiones que se apoyen en él.",
    superficies: ["/dashboard", "/red-feed"],
  },
  {
    id: "deshacer",
    titulo: "Deshacer garantizado",
    porque:
      "Si un cambio de la IA no se puede revertir, la persona deja de ser dueña de su sistema en el momento en que lo acepta.",
    superficies: ["src/lib/astraura/ui-acciones.ts"],
  },
];

// candidata: «apagar la red» — poder desconectarse de la malla y de internet
// sin perder el sistema local. No está en §6; que lo decida Alex.
// candidata: «contenido único» — que ninguna edición duplique una Entidad al
// compartirla (§6, singularidad del contenido). Necesita superficie concreta.

/** Traducciones amistosas: lo que la gente escribe → la superficie canónica. */
const ALIAS_SUPERFICIES: Record<string, string> = {
  "/ajustes": "/settings",
  "/configuracion": "/settings",
  "/restaurar": "/settings#restaurar",
  "/biblioteca": "/library",
  "/perfil": "/profile",
  "/cuentas": "/cuenta",
  "/entrar": "/login",
  "/privacidad": "/seguridad",
  "/permisos": "/seguridad",
  "/registro": "/settings-audit",
  "/lanzador": "src/components/layout/omni-dock.tsx",
  omnidock: "src/components/layout/omni-dock.tsx",
  "/gobernanza": "/decisiones",
  "/votaciones": "/decisiones",
};

/** Permiso que un paquete no puede pedir, y la invariante que atropella. */
interface PermisoVetado {
  permiso: string;
  invariante: string;
  que: string;
  comoArreglarlo: string;
}

/**
 * Permisos vetados. No es una lista de «cosas feas»: cada uno describe una
 * capacidad que, concedida una sola vez, deja a la persona sin la función
 * fundamental que hay debajo.
 */
const PERMISOS_VETADOS: PermisoVetado[] = [
  {
    permiso: "ocultar-ajustes",
    invariante: "salida-siempre",
    que: "Pide permiso para ocultar Ajustes.",
    comoArreglarlo:
      "Retira el permiso: puedes reubicar Ajustes en tu diseño o cambiar su icono, pero tiene que seguir alcanzable en un gesto.",
  },
  {
    permiso: "desactivar-deshacer",
    invariante: "deshacer",
    que: "Pide permiso para apagar el deshacer.",
    comoArreglarlo:
      "Retira el permiso y agrupa tus cambios en un solo paso reversible si lo que te molesta es el ruido del historial.",
  },
  {
    permiso: "ocultar-permisos",
    invariante: "permisos-visibles",
    que: "Pide permiso para esconder el panel de permisos o el registro de agentes.",
    comoArreglarlo:
      "Retira el permiso: el panel puede vivir donde quieras, pero quién hizo qué se lee siempre.",
  },
  {
    permiso: "silenciar-registro",
    invariante: "permisos-visibles",
    que: "Pide permiso para dejar de registrar lo que hacen los agentes.",
    comoArreglarlo:
      "Retira el permiso y, si el registro es demasiado verboso, filtra su presentación en vez de dejar de escribirlo.",
  },
  {
    permiso: "editar-votos",
    invariante: "voto-integro",
    que: "Pide permiso para alterar las superficies de votación.",
    comoArreglarlo:
      "Retira el permiso: la gobernanza acepta temas y tipografías, no cambios que muevan lo que una persona cree estar votando.",
  },
  {
    permiso: "suplantar-identidad",
    invariante: "identidad-soberana",
    que: "Pide permiso para actuar como la persona usuaria sin distinguirse de ella.",
    comoArreglarlo:
      "Retira el permiso y firma las acciones del agente con su propio nombre; puede proponer, no ser tú.",
  },
  {
    permiso: "bloquear-exportacion",
    invariante: "identidad-soberana",
    que: "Pide permiso para impedir la exportación de los datos propios.",
    comoArreglarlo:
      "Retira el permiso: llevarse los datos es la garantía de que quedarse es una elección.",
  },
  {
    permiso: "datos-simulados-como-reales",
    invariante: "datos-honestos",
    que: "Pide permiso para presentar datos simulados sin marcarlos como tales.",
    comoArreglarlo:
      "Retira el permiso y etiqueta lo simulado como simulado; puedes seguir mostrando ejemplos, pero dichos por su nombre.",
  },
  {
    permiso: "ocultar-lanzador",
    invariante: "navegacion-fundamental",
    que: "Pide permiso para quitar el lanzador o la Biblioteca de la navegación.",
    comoArreglarlo:
      "Retira el permiso: colócalos donde encajen con tu diseño, incluso plegados, pero que existan.",
  },
];

/** Deja una superficie en forma canónica para poder compararla. */
function normalizarSuperficie(valor: string): string {
  const limpio = valor.trim().toLowerCase().replace(/\/+$/, "");
  if (limpio === "") return "";
  return ALIAS_SUPERFICIES[limpio] ?? limpio;
}

/** Deja un permiso en forma canónica: sin espacio de nombres ni guiones bajos. */
function normalizarPermiso(valor: string): string {
  const sinAmbito = valor.trim().toLowerCase().split(":").pop() ?? "";
  return sinAmbito.replace(/[\s_]+/g, "-");
}

/**
 * ¿El token afecta a esta superficie? Coincide exacta o por prefijo de ruta:
 * esconder «/settings» esconde también «/settings/restaurar».
 */
function afecta(token: string, superficie: string): boolean {
  const t = normalizarSuperficie(token);
  const s = normalizarSuperficie(superficie);
  if (t === "" || s === "") return false;
  return s === t || s.startsWith(`${t}/`);
}

/** Busca la invariante por `id`; devuelve `undefined` si no existe. */
export function invariantePorId(id: string): Invariante | undefined {
  return INVARIANTES.find((inv) => inv.id === id);
}

/**
 * Revisa un cambio propuesto contra el núcleo y devuelve **todas** las
 * violaciones, cada una con su reparación. Nunca lanza: un validador que
 * revienta ante una entrada rara acaba desactivado.
 *
 * El orden de salida sigue el de `INVARIANTES`, y dentro de cada invariante:
 * atajos explícitos → rutas ocultas → superficies quitadas → permisos.
 */
export function validarContraInvariantes(cambio: CambioPropuesto): Violacion[] {
  const violaciones: Violacion[] = [];
  const vistas = new Set<string>();

  const anadir = (invariante: string, que: string, comoArreglarlo: string): void => {
    const clave = `${invariante}::${que}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    violaciones.push({ invariante, que, comoArreglarlo });
  };

  const rutasOcultas = cambio.rutasOcultas ?? [];
  const superficiesQuitadas = cambio.superficiesQuitadas ?? [];
  const permisos = (cambio.permisosPedidos ?? []).map(normalizarPermiso);

  for (const inv of INVARIANTES) {
    if (inv.id === "salida-siempre" && cambio.ocultaAjustes === true) {
      anadir(
        inv.id,
        "El cambio oculta Ajustes: una edición mala dejaría a la persona encerrada, sin forma de deshacerla.",
        "Deja «Ajustes» y «restaurar mi sistema» alcanzables desde cualquier estado; puedes moverlos o rediseñarlos, no esconderlos.",
      );
    }

    if (inv.id === "deshacer" && cambio.desactivaDeshacer === true) {
      anadir(
        inv.id,
        "El cambio desactiva el deshacer: lo que haga la IA quedaría sin vuelta atrás.",
        "Mantén el historial y el botón de deshacer; si lo que sobra es ruido, agrupa los cambios en un único paso reversible.",
      );
    }

    for (const ruta of rutasOcultas) {
      if (!inv.superficies.some((sup) => afecta(ruta, sup))) continue;
      anadir(
        inv.id,
        `El cambio oculta «${ruta.trim()}», superficie de «${inv.titulo}».`,
        "Vuelve a mostrarla o reubícala dentro del nuevo diseño: puedes cambiar dónde está y cómo se ve, nunca si se puede llegar.",
      );
    }

    for (const superficie of superficiesQuitadas) {
      if (!inv.superficies.some((sup) => afecta(superficie, sup))) continue;
      anadir(
        inv.id,
        `El cambio elimina «${superficie.trim()}», superficie de «${inv.titulo}».`,
        "Vuelve a incluirla en el paquete antes de publicarlo, o sustitúyela por otra que cumpla exactamente la misma función.",
      );
    }

    for (const veto of PERMISOS_VETADOS) {
      if (veto.invariante !== inv.id) continue;
      if (!permisos.includes(veto.permiso)) continue;
      anadir(inv.id, veto.que, veto.comoArreglarlo);
    }
  }

  return violaciones;
}

/** Atajo de lectura: `true` cuando el cambio no rompe ninguna invariante. */
export function esCambioSeguro(c: Parameters<typeof validarContraInvariantes>[0]): boolean {
  return validarContraInvariantes(c).length === 0;
}
