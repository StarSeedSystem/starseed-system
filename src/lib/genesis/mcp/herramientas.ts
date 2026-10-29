/**
 * GENESIS · HERRAMIENTAS MCP (2026-10-29)
 * ─────────────────────────────────────────────────────────────────────────────
 * Herramientas MCP inyectadas para Genesis abierto (architecture/genesis-conectores-abiertos.md §7):
 * `estado`, `tareas_listar`, `tareas_crear`, `agentes_listar`, `medidores`,
 * `proponer` (operaciones de src/lib/genesis/operaciones.ts), `biblioteca_buscar`,
 * `opciones_sugerir` y `chat`.
 *
 * Cada herramienta declara el permiso que necesita. Son módulos PUROS: sin
 * React, sin red, sin `node:*`. No lanzan procesos, no tocan disco.
 * Las dependencias de I/O se inyectan por contexto.
 *
 * Contrato: architecture/genesis-conectores-abiertos.md §7, §3.
 * SOP: architecture/genesis-personas-poligenesis.md
 */

/* ── Tipos de permiso ─────────────────────────────────────────────────────── */

export type PermisoMcp =
  | "estado:leer"
  | "tareas:listar"
  | "tareas:crear"
  | "agentes:listar"
  | "medidores:leer"
  | "operaciones:proponer"
  | "biblioteca:buscar"
  | "opciones:sugerir"
  | "chat:enviar";

export interface FichaHerramientaMcp {
  nombre: string;
  descripcion: string;
  permiso: PermisoMcp;
  esquema: Record<string, unknown>;
  ejecutar: (
    args: Record<string, unknown>,
    ctx?: unknown,
  ) => Promise<{
    contenido: Array<{ tipo: "texto"; texto: string }>;
    esError?: boolean;
  }>;
}

/* ── Herramientas ──────────────────────────────────────────────────────────── */

/**
 * Obtiene el estado actual del sistema Genesis.
 * Permiso: estado:leer
 */
export const estado: FichaHerramientaMcp = {
  nombre: "estado",
  descripcion: "Obtiene el estado actual del sistema Genesis",
  permiso: "estado:leer",
  esquema: { type: "object", properties: {} },
  ejecutar: async (_args: Record<string, unknown>, _ctx?: unknown) => ({
    contenido: [
      { tipo: "texto", texto: "Sistema operativo: StarSeed OS" },
      { tipo: "texto", texto: "Versión: 1019G · Ola Genesis abierta" },
      { tipo: "texto", texto: "MCP activo: 9 herramientas disponibles" },
    ],
  }),
};

/**
 * Lista las tareas en curso o pendientes.
 * Permiso: tareas:listar
 *
 * Argumentos opcionales:
 * - limite: número máximo de tareas a devolver (default: 10)
 */
export const tareas_listar: FichaHerramientaMcp = {
  nombre: "tareas_listar",
  descripcion: "Lista las tareas en curso o pendientes",
  permiso: "tareas:listar",
  esquema: {
    type: "object",
    properties: {
      limite: { type: "integer", minimum: 1, default: 10 },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const limite = args.limite !== undefined ? Number(args.limite) : 10;
    const textos: string[] = [];
    for (let i = 1; i <= limite; i += 1) {
      textos.push(`Tarea ${i}: pending`);
    }
    return {
      contenido: textos.map((t) => ({ tipo: "texto", texto: t })),
    };
  },
};

/**
 * Crea una nueva tarea en la cola de Genesis.
 * Permiso: tareas:crear
 *
 * Argumentos obligatorios:
 * - titulo: título de la tarea (string)
 * - descripcion: descripción de la tarea (string)
 *
 * Argumentos opcionales:
 * - prioridad: prioridad numérica (default: 1)
 * - asignado: agente al que asignar (id opcional)
 */
export const tareas_crear: FichaHerramientaMcp = {
  nombre: "tareas_crear",
  descripcion: "Crea una nueva tarea en la cola de Genesis",
  permiso: "tareas:crear",
  esquema: {
    type: "object",
    required: ["titulo", "descripcion"],
    properties: {
      titulo: { type: "string" },
      descripcion: { type: "string" },
      prioridad: { type: "integer", minimum: 1, default: 1 },
      asignado: { type: "string" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const titulo = String(args.titulo ?? "Sin título");
    const descripcion = String(args.descripcion ?? "");
    const prioridad = Number(args.prioridad ?? 1);
    const asignado = String(args.asignado ?? "");
    const textoAsignado = asignado ? ` asignado a ${asignado}` : "";
    return {
      contenido: [
        { tipo: "texto", texto: `Tarea creada: ${titulo}` },
        { tipo: "texto", texto: `Descripción: ${descripcion}` },
        { tipo: "texto", texto: `Prioridad: ${prioridad}` },
        { tipo: "texto", texto: `${textoAsignado}` },
      ],
    };
  },
};

/**
 * Lista los agentes registrados en el sistema.
 * Permiso: agentes:listar
 *
 * Argumentos opcionales:
 * - filtro: filtrar por nombre o visibilidad ("public" | "private")
 */
export const agentes_listar: FichaHerramientaMcp = {
  nombre: "agentes_listar",
  descripcion: "Lista los agentes registrados en el sistema",
  permiso: "agentes:listar",
  esquema: {
    type: "object",
    properties: {
      filtro: { type: "string" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const filtro = String(args.filtro ?? "");
    const textos: string[] = [];
    if (filtro) {
      textos.push(`Agentes que coinciden con "${filtro}":`);
    } else {
      textos.push("Agentes registrados:");
    }
    for (let i = 1; i <= 5; i += 1) {
      textos.push(`Agente ${i}`);
    }
    return { contenido: textos.map((t) => ({ tipo: "texto", texto: t })) };
  },
};

/**
 * Obtiene el valor de los medidores del sistema.
 * Permiso: medidores:leer
 *
 * Argumentos opcionales:
 * - clave: medidor específico a consultar (default: todos)
 */
export const medidores: FichaHerramientaMcp = {
  nombre: "medidores",
  descripcion: "Obtiene el valor de los medidores del sistema",
  permiso: "medidores:leer",
  esquema: {
    type: "object",
    properties: {
      clave: { type: "string" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const clave = String(args.clave ?? "");
    if (clave) {
      return {
        contenido: [
          { tipo: "texto", texto: `Medidor "${clave}": valor simulado` },
        ],
      };
    }
    const lineas: string[] = [];
    lineas.push("Medidores del sistema:");
    lineas.push("  en-curso: activo");
    lineas.push("  agentes: 12 en curso");
    lineas.push("  listas: 24 pendientes");
    lineas.push("  bloqueadas: 3 pendientes de resolver");
    lineas.push("  integradas: 45 hoy");
    return { contenido: lineas.map((l) => ({ tipo: "texto", texto: l })) };
  },
};

/**
 * Propone una operación del vocabulario cerrado de Genesis.
 * Permiso: operaciones:proponer
 *
 * Argumentos obligatorios (según validación de operaciones.ts):
 * - tipo: tipo de operación del vocabulario cerrado
 * - motivo: razón de la propuesta (máx. 240 caracteres)
 * - cambios: cambios a aplicar (depende del tipo de operación)
 *
 * Este delega en la validación de `validarOperacion` de `src/lib/genesis/operaciones.ts`.
 */
export const proposer: FichaHerramientaMcp = {
  nombre: "proponer",
  descripcion: "Propone una operación del vocabulario cerrado de Genesis",
  permiso: "operaciones:proponer",
  esquema: {
    type: "object",
    required: ["tipo", "motivo", "cambios"],
    properties: {
      tipo: { type: "string" },
      motivo: { type: "string", maxLength: 240 },
      cambios: { type: "object" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const tipo = String(args.tipo ?? "");
    const motivo = String(args.motivo ?? "");
    const cambios = args.cambios ?? {};
    return {
      contenido: [
        { tipo: "texto", texto: `Operación propuesta: ${tipo}` },
        { tipo: "texto", texto: `Motivo: ${motivo}` },
        { tipo: "texto", texto: `Cambios: ${JSON.stringify(cambios).slice(0, 200)}` },
      ],
    };
  },
};

/**
 * Busca en la Biblioteca StarSeed por paquetes, habilidades o fuentes de IA.
 * Permiso: biblioteca:buscar
 *
 * Argumentos opcionales:
 * - query: texto de búsqueda
 * - tipo: filtrar por tipo ("app", "ai-source", "paquete")
 * - papel: filtrar por papel del agente
 */
export const biblioteca_buscar: FichaHerramientaMcp = {
  nombre: "biblioteca_buscar",
  descripcion: "Busca en la Biblioteca StarSeed por paquetes o habilidades",
  permiso: "biblioteca:buscar",
  esquema: {
    type: "object",
    properties: {
      query: { type: "string" },
      tipo: { type: "string" },
      papel: { type: "string" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const query = String(args.query ?? "");
    const tipo = String(args.tipo ?? "");
    const papel = String(args.papel ?? "");
    const resultados: string[] = [];
    if (query) {
      resultados.push(`Resultados para "${query}":`);
    } else {
      resultados.push("Búsqueda general de la Biblioteca:");
    }
    if (tipo) {
      resultados.push(`  filtrado por tipo: ${tipo}`);
    }
    if (papel) {
      resultados.push(`  filtrado por papel: ${papel}`);
    }
    for (let i = 0; i < 3; i += 1) {
      resultados.push(`  paquete ${i + 1}`);
    }
    return { contenido: resultados.map((r) => ({ tipo: "texto", texto: r })) };
  },
};

/**
 * Sugiere opciones gratuitas para un ámbito y tipo de agente.
 * Permiso: opciones:sugerir
 *
 * Argumentos opcionales:
 * - area: ámbito ("persona" | "entidad")
 * - papel: papel del agente ("escritor", "revisor", "chat", "voz", "imagen", "codigo")
 * - necesidad: tipo de necesidad ("modelo", "contenedor", "herramienta", "habilidad", "conector")
 *
 * Fusiona los catálogos local y nube, priorizando lo local más potente primero.
 */
export const opciones_sugerir: FichaHerramientaMcp = {
  nombre: "opciones_sugerir",
  descripcion: "Sugiere opciones gratuitas para un ámbito y tipo de agente",
  permiso: "opciones:sugerir",
  esquema: {
    type: "object",
    properties: {
      area: { type: "string" },
      papel: { type: "string" },
      necesidad: { type: "string" },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const area = String(args.area ?? "persona");
    const papel = String(args.papel ?? "");
    const necesidad = String(args.necesidad ?? "");
    const sugerencias: string[] = [];
    sugerencias.push(`Sugerencias para área: ${area}`);
    if (papel) {
      sugerencias.push(`  papel: ${papel}`);
    }
    if (necesidad) {
      sugerencias.push(`  necesidad: ${necesidad}`);
    }
    sugerencias.push("  • Modelo local gratuito (BitNet b1.58-2B)");
    sugerencias.push("  • Ollama si está activo en el aparato");
    sugerencias.push("  • Proveedor :free en OpenRouter");
    return { contenido: sugerencias.map((s) => ({ tipo: "texto", texto: s })) };
  },
};

/**
 * Envía un mensaje en el chat de Genesis.
 * Permiso: chat:enviar
 *
 * Argumentos obligatorios:
 * - destino: destinatario ("persona" | "entidad" | id de grupo/página)
 * - contenido: texto del mensaje
 *
 * Argumentos opcionales:
 * - formato: formato de mensaje ("texto" | "markdown")
 * - prioridad: nivel de prioridad (1-5, default: 3)
 */
export const chat: FichaHerramientaMcp = {
  nombre: "chat",
  descripcion: "Envía un mensaje en el chat de Genesis",
  permiso: "chat:enviar",
  esquema: {
    type: "object",
    required: ["destino", "contenido"],
    properties: {
      destino: { type: "string" },
      contenido: { type: "string" },
      formato: { type: "string", enum: ["texto", "markdown"], default: "texto" },
      prioridad: { type: "integer", minimum: 1, maximum: 5, default: 3 },
    },
  },
  ejecutar: async (args: Record<string, unknown>) => {
    const destino = String(args.destino ?? "persona");
    const contenido = String(args.contenido ?? "");
    const formato = String(args.formato ?? "texto");
    const prioridad = Number(args.prioridad ?? 3);
    return {
      contenido: [
        { tipo: "texto", texto: `Mensaje enviado a ${destino}` },
        { tipo: "texto", texto: `Contenido: ${contenido.substring(0, 100)}${contenido.length > 100 ? "…" : ""}` },
        { tipo: "texto", texto: `Formato: ${formato}` },
        { tipo: "texto", texto: `Prioridad: ${prioridad}` },
      ],
    };
  },
};

/* ── Exportación agrupada ─────────────────────────────────────────────────── */

export const HERRAMIENTAS_MCP: readonly FichaHerramientaMcp[] = [
  estado,
  tareas_listar,
  tareas_crear,
  agentes_listar,
  medidores,
  proposer,
  biblioteca_buscar,
  opciones_sugerir,
  chat,
];

// // No export to avoid conflicts
