/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Ola 307 · AGENTES DE GRUPO (públicos y privados)
 * ---------------------------------------------------------------------------
 * «La IA también debe poder crear agentes privados y públicos para grupos de
 * cualquier tipo» (rumbo fijado el 2026-09-09, CLAUDE.md §«El OS universal,
 * libre y seguro»). Este módulo EXTIENDE `./model.ts` (`Agent`), no lo
 * reemplaza: un AgenteGrupo es un Agent con dueño colectivo, con los roles que
 * pueden invocarlo y con unos límites que el grupo concede a mano.
 *
 * ⛔ LA REGLA QUE NO SE NEGOCIA
 * Un agente de grupo NUNCA hereda la memoria personal, las claves ni los
 * cerebros privados de quien lo creó. Si alguien copia su agente personal al
 * grupo, lo que se comparte es LA CONFIGURACIÓN, NO SU VIDA. Por eso
 * `sanearParaGrupo` construye el agente con una LISTA BLANCA de campos: lo que
 * no está escrito ahí explícitamente no viaja — ni hoy, ni cuando `Agent`
 * crezca con campos que nadie recuerde filtrar.
 *
 * Por qué los límites nacen cerrados (`LIMITES_POR_DEFECTO`): a un agente
 * público de un grupo lo puede invocar mucha gente. Lo que para una persona es
 * una comodidad, para el grupo entero es una factura —o una fuga—. Salir a
 * internet y escribir se CONCEDEN, no se heredan.
 *
 * Invariantes de CLAUDE.md §6: identidad soberana (`author` firma el origen y
 * `creadoPor` firma quién lo llevó al grupo), privacidad ↔ transparencia (la
 * memoria del agente vive en el grupo, nunca en la persona) y singularidad del
 * contenido (el agente de grupo es una Entidad propia, con `parentId` hacia el
 * agente original).
 *
 * Módulo PURO: solo tipos y funciones deterministas. Sin red, sin disco y sin
 * reloj — SSR-safe por construcción y comprobable campo a campo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { BINDING_TARGET_TYPES } from "./model";
import type {
  Agent,
  AgentBinding,
  AgentModelPrefs,
  BindingTargetType,
  CapabilityId,
} from "./model";

/** Alcance de la memoria de un agente de grupo (nunca «personal»). */
export type AlcanceMemoriaGrupo = "grupo" | "publica";

/** Lo que el grupo CONCEDE a un agente. Nace todo cerrado. */
export interface LimitesAgente {
  /** Tope de invocaciones por hora, sumando a todo el grupo. */
  invocacionesPorHora: number;
  /** Capacidades concedidas (ids del vocabulario compartido de skills.ts). */
  capacidades: CapabilityId[];
  /** ¿Puede pedir contenido a internet? */
  puedeSalirAInternet: boolean;
  /** ¿Puede escribir (publicar, editar o mover cosas del grupo)? */
  puedeEscribir: boolean;
}

/** Un Agent con dueño colectivo: vive en un grupo, no en una persona. */
export interface AgenteGrupo extends Agent {
  /** Grupo dueño del agente. */
  grupoId: string;
  /** Roles del grupo que pueden invocarlo («*» = cualquier miembro). */
  rolesQuePuedenInvocar: string[];
  /** Quién lo llevó al grupo (`author` sigue firmando el origen). */
  creadoPor: string;
  /** Lo que el grupo le ha concedido. */
  limites: LimitesAgente;
  /** Dónde vive su memoria: en el grupo, o a la vista de todos. Nunca personal. */
  memoriaAlcance: AlcanceMemoriaGrupo;
  /** Vínculos supervivientes: solo superficies compartidas. */
  bindings: AgentBinding[];
}

/**
 * Memoria personal de un agente privado: notas, recuerdos y conversaciones de
 * su dueño. Se declara para poder QUITARLA, no para que viaje.
 */
export interface MemoriaPersonal {
  [clave: string]: unknown;
}

/** Un agente tal y como vive en la biblioteca PERSONAL de alguien. */
export interface AgentePersonal extends Agent {
  /** La vida de su dueño. Se queda en casa. */
  memoriaPersonal?: MemoriaPersonal;
  /** Claves y tokens del dueño. Jamás cruzan al grupo. */
  claves?: Record<string, string>;
  /** Cerebros privados a los que el dueño le había dado acceso. */
  cerebrosPrivados?: string[];
  /** Vínculos a cerebros y superficies, públicas y privadas. */
  bindings?: AgentBinding[];
}

/** Límites de un agente recién nacido: ni escribe, ni sale a internet. */
export const LIMITES_POR_DEFECTO: LimitesAgente = {
  invocacionesPorHora: 60,
  capacidades: [],
  puedeSalirAInternet: false,
  puedeEscribir: false,
};

/** Rango admisible del tope de invocaciones (fuera de rango = propuesta inválida). */
export const INVOCACIONES_POR_HORA_MIN = 1;
export const INVOCACIONES_POR_HORA_MAX = 600;

/** Rol comodín: cualquier miembro del grupo puede invocarlo. */
export const ROL_CUALQUIER_MIEMBRO = "*";

/**
 * Superficies que son de UNA persona aunque el vínculo se marque «público»: el
 * perfil (su cara) y los mensajes (sus conversaciones). Un agente de grupo no
 * se ata a ellas.
 */
export const SUPERFICIES_PRIVADAS: BindingTargetType[] = ["profile", "message"];

/**
 * Fuentes de Astraura que NO dependen de una clave personal (espejo de
 * `requiresKey: false` en `src/ai/astraura/free-catalog.ts`): motores locales
 * de la propia neurona y backends abiertos de StarSeed. Cualquier otra fuente
 * preferida se cae al sanear, porque apuntaría a la cuenta —y a la factura— de
 * quien creó el agente.
 */
export const FUENTES_SIN_CLAVE_PERSONAL: readonly string[] = [
  "astraura-158-local",
  "astraura-158-nube",
  "astraura-bonsai-local",
  "ollama-local",
  "lmstudio-local",
  "local-openllm",
  "omniroute-local",
];

/** ¿Esta fuente preferida viaja atada a la clave personal de alguien? */
export function esFuenteAtadaAClavePersonal(fuenteId: string): boolean {
  return !FUENTES_SIN_CLAVE_PERSONAL.includes(fuenteId.trim());
}

/** ¿Este vínculo apunta a una superficie privada de una persona? */
export function esBindingPrivado(b: AgentBinding): boolean {
  return b.scope === "private" || SUPERFICIES_PRIVADAS.includes(b.targetType);
}

/**
 * VOCABULARIO CONOCIDO de capacidades: espejo de los ids de `SKILL_CAPABILITIES`
 * (`src/ai/astraura/skills.ts`), copiado a mano A PROPÓSITO para que este módulo
 * siga siendo puro (aquel importa la Biblioteca, que lee `localStorage`).
 *
 * La IA propone agentes, y un modelo inventa capacidades con la misma soltura
 * con la que inventa URLs. Todo lo que no esté en esta lista se rechaza POR SU
 * NOMBRE, para que quien revise la propuesta sepa exactamente qué se inventó.
 * Si la lista viva crece, `validarAgenteGrupo` acepta el vocabulario del
 * manifiesto real como segundo argumento.
 */
export const CAPACIDADES_CONOCIDAS: readonly CapabilityId[] = [
  "av-gen", "net-neuron", "taste", "pm", "web-senses", "research",
  "vision", "voice", "voice-neural", "web-access", "model-discovery",
  "app-builder", "agent-recipes", "deep-research", "sandbox-exec",
  "multi-agent-code", "web-scraping-adaptativa", "router-proxy",
  "design-import", "rag-knowledge", "voice-realtime", "voice-engines",
  "self-hosting-deploy", "dev-agent", "bonsai-engine", "web-robots",
  "local-llm-ui", "agent-browsing", "flow-builder", "pdf-tools",
  "llm-apps-platform", "bookmarks-ai", "local-objects", "audio-library",
  "home-automation", "p2p-sync", "aurora-avatar", "data-science-fasta",
  "photo-backup", "ai-search", "flow-automation", "rag-workspace",
  "local-ai-notes", "whiteboard-pro", "agent-memory-backend",
  "smart-file-organize", "security-audit", "offline-maps", "aurora-council",
  "agent-delegation", "design-penpot", "video-editing", "advanced-search",
  "agent-memory-layered", "data-backup", "social-publish",
];

/**
 * Preferencias de modelo sin nada atado a la cuenta de una persona: se
 * conservan el gusto (fuerte/creatividad) y el nombre del modelo, y se cae la
 * fuente preferida cuando esa fuente necesita una clave del dueño.
 */
function sanearPrefsDeModelo(model: AgentModelPrefs | undefined): AgentModelPrefs | undefined {
  if (!model) return undefined;
  const limpio: AgentModelPrefs = {};
  if (typeof model.preferStrong === "boolean") limpio.preferStrong = model.preferStrong;
  if (typeof model.temperature === "number") limpio.temperature = model.temperature;
  if (typeof model.preferredModel === "string" && model.preferredModel.trim()) {
    limpio.preferredModel = model.preferredModel;
  }
  const fuente = typeof model.preferredSourceId === "string" ? model.preferredSourceId.trim() : "";
  if (fuente && !esFuenteAtadaAClavePersonal(fuente)) limpio.preferredSourceId = fuente;
  return Object.keys(limpio).length > 0 ? limpio : undefined;
}

/**
 * Convierte un agente personal en agente de grupo QUITÁNDOLE la vida de su
 * dueño. Es una LISTA BLANCA: se copian uno a uno los campos de configuración
 * de `Agent`; `memoriaPersonal`, `claves`, `cerebrosPrivados`, los vínculos a
 * superficies privadas y cualquier campo futuro que no esté escrito aquí NO
 * viajan al grupo.
 *
 * El resultado nace con lo mínimo: sin roles que puedan invocarlo, con
 * `LIMITES_POR_DEFECTO` y con la memoria en el ámbito del grupo. Abrirlo es una
 * decisión explícita del grupo, no un efecto secundario de copiarlo.
 */
export function sanearParaGrupo(a: AgentePersonal, grupoId: string, creadoPor: string): AgenteGrupo {
  const grupo = grupoId.trim();
  const bindings = (a.bindings ?? []).filter((b) => !esBindingPrivado(b));
  return {
    // ── Configuración: esto sí se comparte ────────────────────────────────
    id: `${a.id}@${grupo}`,
    name: a.name,
    description: a.description,
    persona: a.persona,
    capabilities: [...a.capabilities],
    model: sanearPrefsDeModelo(a.model),
    icon: a.icon,
    author: a.author,
    visibility: a.visibility,
    version: a.version,
    // Singularidad del contenido: Entidad propia con linaje al original.
    parentId: a.id,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    // ── Vida en el grupo: todo cerrado hasta que el grupo firme ───────────
    grupoId: grupo,
    rolesQuePuedenInvocar: [],
    creadoPor: creadoPor.trim(),
    limites: { ...LIMITES_POR_DEFECTO, capacidades: [] },
    memoriaAlcance: "grupo",
    bindings,
  };
}

/**
 * ¿Puede esta persona invocar al agente? Se compara por rol, no por nombre: el
 * grupo concede a «moderación» o a «cualquier miembro», y la lista de personas
 * cambia sin tocar el agente. Sin rol y sin roles concedidos, no invoca nadie.
 */
export function puedeInvocar(a: AgenteGrupo, rolDelUsuario: string): boolean {
  const rol = rolDelUsuario.trim().toLowerCase();
  if (!rol) return false;
  const permitidos = a.rolesQuePuedenInvocar
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  if (permitidos.includes(ROL_CUALQUIER_MIEMBRO)) return true;
  return permitidos.includes(rol);
}

/**
 * Lo que el agente PUEDE hacer de verdad: lo que sabe hacer (`capabilities`)
 * ∩ lo que el grupo le ha concedido (`limites.capacidades`). Un agente recién
 * saneado no puede nada hasta que el grupo firme, y una capacidad concedida por
 * error a un agente que no la declara tampoco se enciende sola.
 */
export function capacidadesEfectivas(a: AgenteGrupo): CapabilityId[] {
  return a.capabilities.filter((c) => a.limites.capacidades.includes(c));
}

// ─── Validación desconfiada de lo que propone la IA ──────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function listaDeTextos(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function esTipoDeVinculo(v: unknown): v is BindingTargetType {
  return BINDING_TARGET_TYPES.some((t) => t === v);
}

/** Valida los límites propuestos: tipos correctos y tope dentro de rango. */
function validarLimites(
  bruto: unknown,
  vocabulario: readonly CapabilityId[],
  problemas: string[],
): LimitesAgente | null {
  if (!esObjeto(bruto)) {
    problemas.push("Faltan los «limites»: un agente de grupo sin límites no se acepta.");
    return null;
  }
  const porHora = bruto.invocacionesPorHora;
  const capacidades = bruto.capacidades;
  const salir = bruto.puedeSalirAInternet;
  const escribir = bruto.puedeEscribir;
  if (
    typeof porHora !== "number" ||
    !Number.isFinite(porHora) ||
    porHora < INVOCACIONES_POR_HORA_MIN ||
    porHora > INVOCACIONES_POR_HORA_MAX
  ) {
    problemas.push(
      `«limites.invocacionesPorHora» debe estar entre ${INVOCACIONES_POR_HORA_MIN} y ` +
        `${INVOCACIONES_POR_HORA_MAX}: recibido «${String(porHora)}».`,
    );
  }
  if (!listaDeTextos(capacidades)) {
    problemas.push("«limites.capacidades» debe ser una lista de ids de capacidad.");
  } else {
    for (const c of capacidades) {
      if (!vocabulario.includes(c)) problemas.push(`Capacidad concedida desconocida: «${c}».`);
    }
  }
  if (typeof salir !== "boolean") problemas.push("«limites.puedeSalirAInternet» debe ser booleano.");
  if (typeof escribir !== "boolean") problemas.push("«limites.puedeEscribir» debe ser booleano.");
  if (
    typeof porHora !== "number" ||
    !listaDeTextos(capacidades) ||
    typeof salir !== "boolean" ||
    typeof escribir !== "boolean"
  ) {
    return null;
  }
  return {
    invocacionesPorHora: porHora,
    capacidades: [...capacidades],
    puedeSalirAInternet: salir,
    puedeEscribir: escribir,
  };
}

/** Valida un vínculo propuesto; los que apuntan a superficies privadas se delatan. */
function validarBinding(bruto: unknown, problemas: string[]): AgentBinding | null {
  if (!esObjeto(bruto)) {
    problemas.push("Un vínculo propuesto no es un objeto.");
    return null;
  }
  const { agentId, targetType, targetId, scope, at } = bruto;
  if (!textoNoVacio(agentId) || !textoNoVacio(targetId) || !esTipoDeVinculo(targetType)) {
    problemas.push("Un vínculo propuesto no dice a qué superficie se ata.");
    return null;
  }
  if (scope !== "public" && scope !== "private") {
    problemas.push(`Vínculo con ámbito inválido: «${String(scope)}».`);
    return null;
  }
  const vinculo: AgentBinding = {
    agentId,
    targetType,
    targetId,
    scope,
    at: typeof at === "number" && Number.isFinite(at) ? at : 0,
  };
  if (esBindingPrivado(vinculo)) {
    problemas.push(
      `Vínculo a superficie privada («${targetType}» en ámbito «${scope}»): un agente de ` +
        "grupo no se ata a la vida privada de nadie.",
    );
    return null;
  }
  return vinculo;
}

/** Prefs de modelo propuestas por la IA, ya saneadas de claves ajenas. */
function prefsDesdeBruto(bruto: unknown): AgentModelPrefs | undefined {
  if (!esObjeto(bruto)) return undefined;
  const prefs: AgentModelPrefs = {};
  if (typeof bruto.preferStrong === "boolean") prefs.preferStrong = bruto.preferStrong;
  if (typeof bruto.temperature === "number") prefs.temperature = bruto.temperature;
  if (typeof bruto.preferredModel === "string") prefs.preferredModel = bruto.preferredModel;
  if (typeof bruto.preferredSourceId === "string") prefs.preferredSourceId = bruto.preferredSourceId;
  return sanearPrefsDeModelo(prefs);
}

/**
 * Valida un agente de grupo PROPUESTO (normalmente por la IA) con desconfianza
 * deliberada: capacidades contra el vocabulario conocido, límites dentro de
 * rango, grupo y autoría presentes, y ni rastro de memoria o claves personales.
 *
 * Devuelve `{ agente: null, problemas }` cuando algo falla, con cada problema
 * escrito en español y NOMBRANDO lo que está mal (p. ej. la capacidad
 * inventada), para que la persona que revisa pueda decidir en un vistazo.
 * Los campos cosméticos que falten se rellenan con valores neutros; los que
 * definen quién manda, no.
 */
export function validarAgenteGrupo(
  bruto: unknown,
  vocabulario: readonly CapabilityId[] = CAPACIDADES_CONOCIDAS,
): { agente: AgenteGrupo | null; problemas: string[] } {
  const problemas: string[] = [];
  if (!esObjeto(bruto)) {
    return { agente: null, problemas: ["La propuesta no es un objeto de agente."] };
  }
  if ("memoriaPersonal" in bruto) {
    problemas.push("La propuesta trae «memoriaPersonal»: un agente de grupo nunca hereda la memoria de una persona.");
  }
  if ("claves" in bruto) {
    problemas.push("La propuesta trae «claves» personales: las claves no viajan al grupo.");
  }
  if ("cerebrosPrivados" in bruto) {
    problemas.push("La propuesta trae «cerebrosPrivados»: los cerebros privados no se comparten.");
  }
  // Se sacan a constantes locales para que el estrechado de tipos sea firme y
  // no dependa de leer dos veces la misma propiedad de un objeto desconocido.
  const { id, name, persona, grupoId, creadoPor, visibility, memoriaAlcance, parentId } = bruto;
  if (!textoNoVacio(id)) problemas.push("Falta «id».");
  if (!textoNoVacio(name)) problemas.push("Falta «name».");
  if (!textoNoVacio(persona)) problemas.push("Falta «persona»: un agente sin persona no es nadie.");
  if (!textoNoVacio(grupoId)) problemas.push("Falta «grupoId»: un agente de grupo sin grupo no existe.");
  if (!textoNoVacio(creadoPor)) problemas.push("Falta «creadoPor»: alguien responde por este agente.");
  if (visibility !== "private" && visibility !== "public") {
    problemas.push("«visibility» debe ser «private» o «public».");
  }
  if (memoriaAlcance !== "grupo" && memoriaAlcance !== "publica") {
    problemas.push("«memoriaAlcance» debe ser «grupo» o «publica»: la memoria personal no es una opción.");
  }
  const capacidades = bruto.capabilities;
  if (!listaDeTextos(capacidades)) {
    problemas.push("«capabilities» debe ser una lista de ids de capacidad.");
  } else {
    for (const c of capacidades) {
      if (!vocabulario.includes(c)) problemas.push(`Capacidad desconocida: «${c}».`);
    }
  }
  const roles = bruto.rolesQuePuedenInvocar;
  if (!listaDeTextos(roles)) {
    problemas.push("«rolesQuePuedenInvocar» debe ser una lista de roles del grupo.");
  }
  const limites = validarLimites(bruto.limites, vocabulario, problemas);
  const bindings: AgentBinding[] = [];
  if (bruto.bindings !== undefined) {
    if (!Array.isArray(bruto.bindings)) {
      problemas.push("«bindings» debe ser una lista de vínculos.");
    } else {
      for (const v of bruto.bindings) {
        const vinculo = validarBinding(v, problemas);
        if (vinculo) bindings.push(vinculo);
      }
    }
  }
  if (problemas.length > 0) return { agente: null, problemas };
  if (
    !textoNoVacio(id) ||
    !textoNoVacio(name) ||
    !textoNoVacio(persona) ||
    !textoNoVacio(grupoId) ||
    !textoNoVacio(creadoPor) ||
    !listaDeTextos(capacidades) ||
    !listaDeTextos(roles) ||
    !limites ||
    (visibility !== "private" && visibility !== "public") ||
    (memoriaAlcance !== "grupo" && memoriaAlcance !== "publica")
  ) {
    return { agente: null, problemas: ["La propuesta no está completa."] };
  }
  const agente: AgenteGrupo = {
    id: id.trim(),
    name: name.trim(),
    description: typeof bruto.description === "string" ? bruto.description : "",
    persona,
    capabilities: [...capacidades],
    model: prefsDesdeBruto(bruto.model),
    icon: textoNoVacio(bruto.icon) ? bruto.icon : "Bot",
    author: textoNoVacio(bruto.author) ? bruto.author : creadoPor.trim(),
    visibility,
    version: textoNoVacio(bruto.version) ? bruto.version : "1.0.0",
    createdAt: typeof bruto.createdAt === "number" ? bruto.createdAt : 0,
    updatedAt: typeof bruto.updatedAt === "number" ? bruto.updatedAt : 0,
    grupoId: grupoId.trim(),
    rolesQuePuedenInvocar: [...roles],
    creadoPor: creadoPor.trim(),
    limites,
    memoriaAlcance,
    bindings,
  };
  if (textoNoVacio(parentId)) agente.parentId = parentId;
  return { agente, problemas };
}
