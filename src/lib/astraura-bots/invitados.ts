import {
  type Bot,
  type Dueno,
  type Gobierno,
  type OrigenBot,
  type Personalidad,
  type Cuerpo,
  type Sentido,
  SENTIDOS,
} from "./tipos";
import { NUNCA_INVITADO } from "./permisos";

/** Tipo de entrada para crear un bot invitado. */
export type EntradaInvitado =
  | { tipo: "grok"; nombre: string }
  | { tipo: "openai-compatible"; nombre: string; url: string; variable: string }
  | { tipo: "ag-ui"; nombre: string; endpoint: string };

/** Resultado de la creación: o un bot válido o una lista de problemas. */
export type ResultadoInvitado = Bot | { problemas: string[] };

/** Sentidos que un invitado puede tener máximo (excluye los íntimos). */
export const SENTIDOS_MAXIMOS_INVITADO = SENTIDOS.filter(
  (s) => !NUNCA_INVITADO.includes(s),
) as readonly Sentido[];

/** Catálogo de invitados disponibles. */
export const CATALOGO_INVITADOS = {
  grok: {
    sentidosMaximos: SENTIDOS_MAXIMOS_INVITADO,
    costeOrientativo: "variable",
    aviso:
      "Grok no es de código abierto ni local; recibe solo lo que tú le pases.",
  },
  "openai-compatible": {
    sentidosMaximos: SENTIDOS_MAXIMOS_INVITADO,
    costeOrientativo: "depende del proveedor",
    aviso:
      "API compatible con OpenAI: revisa los costes y políticas del proveedor.",
  },
  "ag-ui": {
    sentidosMaximos: SENTIDOS_MAXIMOS_INVITADO,
    costeOrientativo: "gratuito (autoalojado)",
    aviso:
      "Endpoint AG-UI: el coste depende de tu despliegue; recibirás solo lo que le pases.",
  },
} as const;

/**
 * Crea un bot invitado a partir de la entrada, el id de perfil y el id de cuenta.
 * @param entrada - datos del invitado a crear
 * @param perfilId - id del perfil dueño
 * @param cuentaId - id de la cuenta responsable
 * @returns un bot válido o una lista de problemas de validación
 */
export function crearInvitado(
  entrada: EntradaInvitado,
  perfilId: string,
  cuentaId: string,
): ResultadoInvitado {
  // Validaciones comunes
  const problemas: string[] = [];

  if (!entrada.nombre || entrada.nombre.trim() === "") {
    problemas.push("El nombre es obligatorio.");
  }

  // Validaciones específicas por tipo
  if (entrada.tipo === "grok") {
    // Grok no necesita campos adicionales más que el nombre
    // (la clave se maneja en el servidor vía variable de entorno XAI_API_KEY)
  } else if (entrada.tipo === "openai-compatible") {
    if (!entrada.url || !entrada.url.trim()) {
      problemas.push("La URL es obligatoria para openai-compatible.");
    } else {
      try {
        new URL(entrada.url);
      } catch {
        problemas.push("La URL no es válida.");
      }
    }
    if (!entrada.variable || !entrada.variable.trim()) {
      problemas.push(
        "El nombre de la variable de entorno es obligatorio para openai-compatible.",
      );
    }
  } else if (entrada.tipo === "ag-ui") {
    if (!entrada.endpoint || !entrada.endpoint.trim()) {
      problemas.push("El endpoint es obligatorio para ag-ui.");
    } else {
      try {
        new URL(entrada.endpoint);
      } catch {
        problemas.push("El endpoint no es una URL válida.");
      }
    }
  }

  if (problemas.length > 0) {
    return { problemas };
  }

  // Generamos un id determinista basado en los datos de entrada
  // (en un sistema real, el id lo generaría el backend, pero aquí lo simulamos)
  const id = `${perfilId}-${cuentaId}-${entrada.tipo}-${entrada.nombre}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();

  // Dueno: el bot pertenece al perfil
  const dueno: Dueno = {
    tipo: "perfil",
    id: perfilId,
    cuentaId,
  };

  // Origen: externo para grok y openai-compatible, ag-ui para ag-ui
  const origen: OrigenBot =
    entrada.tipo === "ag-ui" ? "ag-ui" : "externo";

  // Gobierno: por defecto jerarquico (el dueño controla)
  const gobierno: Gobierno = "jerarquico";

  // Personalidad: neutral (todos los rasgos en 0.5)
  const personalidad: Personalidad = {
    calidez: 0.5,
    energia: 0.5,
    formalidad: 0.5,
    curiosidad: 0.5,
    humor: 0.5,
    concision: 0.5,
  };

  // Cuerpo: orbe por defecto
  const cuerpo: Cuerpo = {
    forma: "orbe",
    tono: 0,
    escala: 1,
    avatarRef: undefined,
  };

  // Sentidos habilitados: todos los que un invitado puede tener máximo
  const sentidosHabilitados: readonly Sentido[] =
    SENTIDOS_MAXIMOS_INVITADO;

  // Activo por defecto
  const activo = true;

  const bot: Bot = {
    id,
    nombre: entrada.nombre.trim(),
    dueno,
    origen,
    gobierno,
    personalidad,
    cuerpo,
    sentidosHabilitados,
    activo,
  };

  return bot;
}