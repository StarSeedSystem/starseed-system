// ══════════════════════════════════════════════════════════════
// Taller del agente — catálogo unificado de recursos (2026-09-09)
// ──────────────────────────────────────────────────────────────
// Alex pidió «una ventana de habilidades, conexiones, MCP, prompts, plugins y
// memorias para los agentes, agregando los que ya tenemos y los de StarSeed OS
// de la librería y de Astraura». Esto es la capa de datos: reúne en UNA lista
// lo que ya existe de verdad en el repositorio, sin inventar catálogos nuevos.
//
// Módulo PURO: sin `node:*`, sin Supabase, sin red. Lo importan componentes de
// cliente, así que arrastrar aquí un módulo de servidor rompería el build de
// producción (lección del 2026-09-08 con `node:crypto`).
// ══════════════════════════════════════════════════════════════

export type TipoRecurso =
  | "habilidad" | "conexion" | "mcp" | "prompt" | "plugin" | "herramienta" | "memoria";

export type OrigenRecurso = "os" | "biblioteca" | "astraura" | "enjambre";

/** Dónde vive el recurso: el navegador y los MCP locales son de la Mac. */
export type MaquinaRecurso = "mac" | "nube" | "cualquiera";

export interface RecursoAgente {
  id: string;
  tipo: TipoRecurso;
  origen: OrigenRecurso;
  nombre: string;
  descripcion: string;
  etiquetas: string[];
  /** Nombres de variables de entorno o condiciones. NUNCA valores de claves. */
  requiere: string[];
  maquina?: MaquinaRecurso;
  ruta?: string;
  docs?: string;
}

export interface ComprobacionRecurso {
  /** Operación inocua que permite observar si el recurso responde ahora. */
  accion: string;
  /** Evidencia mínima que convierte la comprobación en positiva. */
  disponibleSi: string;
}

/** Contrato más estricto para una vía de navegador del Taller. */
export interface RecursoNavegador extends RecursoAgente {
  capacidades: string[];
  limites: string[];
  comprobacion: ComprobacionRecurso;
}

/* ── Navegador: verificado en vivo el 2026-09-08 ────────────────────────────
   En el Chrome de la Mac, con la sesión de fundacionstarseed@gmail.com, están
   instaladas las extensiones de Claude y de ChatGPT. `list_connected_browsers`
   devolvió 1 navegador y `Control_Chrome.list_tabs` respondió con las pestañas.
   El navegador es una capacidad de la MAC: los agentes del enjambre que corren
   en el contenedor de la nube NO llegan a ese Chrome.                        */
export const RECURSOS_NAVEGADOR: RecursoNavegador[] = [
  {
    id: "os:claude-en-chrome", tipo: "herramienta", origen: "os", maquina: "mac",
    nombre: "Claude en Chrome",
    descripcion: "Extensión de Claude en el Chrome de la fundación; solo está viva cuando la extensión expone una conexión comprobada.",
    etiquetas: ["navegador", "web", "pestañas", "formularios", "captura"],
    requiere: ["CLAUDE_EN_CHROME_CONECTADO"],
    capacidades: ["Navegar y leer páginas", "Capturar la vista", "Rellenar formularios"],
    limites: ["Solo funciona en la Mac con la extensión conectada", "No introduce contraseñas ni datos de pago", "No publica, envía ni acepta términos sin autorización explícita"],
    comprobacion: {
      accion: "Consultar los navegadores conectados con list_connected_browsers.",
      disponibleSi: "La respuesta incluye un Chrome conectado mediante la extensión de Claude.",
    },
    docs: "https://claude.com/chrome",
  },
  {
    id: "os:control-chrome", tipo: "mcp", origen: "os", maquina: "mac",
    nombre: "Control Chrome (MCP local)",
    descripcion: "Servidor MCP local para conducir el Chrome de la Mac; estar instalado no significa que esté conectado en este turno.",
    etiquetas: ["navegador", "mcp", "pestañas", "javascript"],
    requiere: ["CONTROL_CHROME_CONECTADO"],
    capacidades: ["Abrir URL", "Listar y cambiar pestañas", "Leer contenido", "Ejecutar JavaScript en una pestaña"],
    limites: ["Solo lo alcanzan agentes que corren en la Mac", "Depende de que Chrome y el MCP local respondan", "No convierte una sesión abierta en permiso para acciones externas"],
    comprobacion: {
      accion: "Invocar Control_Chrome.list_tabs sin modificar ninguna pestaña.",
      disponibleSi: "La llamada responde correctamente con la lista de pestañas, aunque esté vacía.",
    },
  },
  {
    id: "astraura:browser-tool", tipo: "herramienta", origen: "astraura", maquina: "cualquiera",
    nombre: "Navegador autónomo 1.58",
    descripcion: "browser_tool del backend Astraura 1.58, accesible por el proxy del OS cuando el backend y la herramienta responden.",
    etiquetas: ["navegador", "autónomo", "astraura", "sin-api", "paneles", "documentación"],
    requiere: ["ASTRAURA_158_BROWSER_TOOL_SANO"],
    capacidades: ["Buscar en la web", "Navegar a una URL", "Ejecutar acciones admitidas", "Indexar contenido en memoria"],
    limites: ["No hereda las sesiones del Chrome de la Mac", "Solo ejecuta las acciones que admita el backend desplegado", "Un backend accesible no prueba por sí solo que browser_tool esté sano"],
    comprobacion: {
      accion: "Ejecutar una búsqueda inocua mediante /api/ai/astraura-158/api/browser/search.",
      disponibleSi: "El proxy y browser_tool responden con éxito; no basta con tener ASTRAURA_158_URL configurada.",
    },
    ruta: "backend/app/tools/browser_tool.py",
  },
];

/** Herramientas reales del backend 1.58 (viven en el repo `astraura`). */
export const RECURSOS_ASTRAURA: RecursoAgente[] = [
  { id: "astraura:terminal", tipo: "herramienta", origen: "astraura", nombre: "Terminal 1.58",
    descripcion: "Ejecuta órdenes en la neurona con permisos y registro.", etiquetas: ["terminal", "shell", "sistema"],
    requiere: [], ruta: "backend/app/tools/terminal_tool.py" },
  { id: "astraura:explorador", tipo: "herramienta", origen: "astraura", nombre: "Explorador del dispositivo",
    descripcion: "Recorre y describe el sistema de archivos de la neurona.", etiquetas: ["archivos", "explorador", "sistema"],
    requiere: [], ruta: "backend/app/tools/system_explorer.py" },
  { id: "astraura:sentidos", tipo: "herramienta", origen: "astraura", nombre: "Sentidos del sistema",
    descripcion: "Sensorium: CPU, memoria, batería, red y clima de la neurona.", etiquetas: ["sensores", "telemetría", "sensorium"],
    requiere: [], ruta: "backend/app/tools/system_senses.py" },
  { id: "astraura:crawl", tipo: "herramienta", origen: "astraura", nombre: "Rastreo web",
    descripcion: "Descarga y limpia páginas para alimentar memorias y publicaciones.", etiquetas: ["web", "crawl", "investigación"],
    requiere: [], ruta: "backend/app/tools/web_crawl_tool.py" },
  { id: "astraura:almacenamiento", tipo: "herramienta", origen: "astraura", nombre: "Adaptadores de almacenamiento",
    descripcion: "Enrutamiento de medios y archivos entre neurona, Drive y la nube.", etiquetas: ["almacenamiento", "drive", "medios"],
    requiere: [], ruta: "backend/app/tools/storage_adapters.py" },
  { id: "astraura:biblioteca", tipo: "habilidad", origen: "astraura", nombre: "Biblioteca StarSeed",
    descripcion: "Habilidad de acceso a la Biblioteca del OS desde el backend 1.58.", etiquetas: ["biblioteca", "conocimiento"],
    requiere: [], ruta: "backend/app/skills/starseed_library.py" },
  { id: "astraura:cerebros", tipo: "memoria", origen: "astraura", nombre: "Cerebros y memorias 1.58",
    descripcion: "Memorias multidimensionales por personalidad: recuerdos, corpus de aprendizaje y adaptadores LoRA.", etiquetas: ["memoria", "cerebro", "aprendizaje", "lora"],
    requiere: [], ruta: "backend/app/memory" },
];

/** Memorias del OS que un agente puede leer y escribir. */
export const RECURSOS_MEMORIA: RecursoAgente[] = [
  { id: "os:memory-root", tipo: "memoria", origen: "os", nombre: "Memory root de StarSeed",
    descripcion: "La memoria viva portátil: soul, ego, skills, style, memory, dream, accounts, tasks y logs, con espejo en Google Drive.",
    etiquetas: ["memoria", "raíz", "portátil", "drive"], requiere: [], ruta: "starseed_memory_root/" },
  { id: "os:memorias-profundas", tipo: "memoria", origen: "os", nombre: "Memoria profunda del proyecto",
    descripcion: "Principios, arquitectura, glosario, roadmap y bitácora de estado; mandan sobre el criterio del agente.",
    etiquetas: ["memoria", "principios", "arquitectura"], requiere: [], ruta: "memory/" },
  { id: "os:exocortex", tipo: "memoria", origen: "os", nombre: "Exocórtex y bóvedas",
    descripcion: "Memorias y bóvedas del usuario, con permisos por ámbito y vínculos externos.",
    etiquetas: ["memoria", "bóveda", "privacidad"], requiere: [], ruta: "src/components/exocortex" },
  { id: "os:cuadernos", tipo: "memoria", origen: "os", nombre: "Cuadernos de NotebookLM",
    descripcion: "Los tres cuadernos fundamentales del proyecto y los artefactos de su Studio (audio, diapositivas, vídeo, mapa mental, informes, fichas, cuestionarios, infografías).",
    etiquetas: ["memoria", "notebooklm", "fundamentos", "audiovisual"], requiere: [], maquina: "mac",
    docs: "https://notebook.google.com/" },
];

/* 2026-09-08 · Ola 297 · NV1: las reglas se declaran ANTES de `PROMPTS_BASE`
   porque el prompt de navegación las reutiliza; al revés habría zona muerta
   (TDZ) al evaluar el módulo. */
/** Reglas que acompañan a cualquier recurso de navegación. */
export const REGLAS_NAVEGADOR: string[] = [
  "Nunca introducir contraseñas ni datos de pago.",
  "Nunca aceptar términos, publicar, enviar formularios ni comprar sin la palabra explícita de Alex.",
  "En los avisos de cookies, siempre la opción más restrictiva.",
  "Jamás sacar claves ni tokens de la máquina dentro de un contexto de navegación.",
];

/** Plantillas de prompt útiles de verdad para un agente de StarSeed. */
export const PROMPTS_BASE: RecursoAgente[] = [
  { id: "prompt:investigar", tipo: "prompt", origen: "os", nombre: "Investigar y citar fuentes",
    descripcion: "Busca, contrasta al menos dos fuentes y cita cada afirmación con su enlace; di lo que NO se pudo verificar.",
    etiquetas: ["investigación", "fuentes", "rigor"], requiere: [] },
  { id: "prompt:canal", tipo: "prompt", origen: "os", nombre: "Redactar para un canal",
    descripcion: "Escribe con la voz de la personalidad del canal, con su cadencia y su formato, y deja el borrador para visto bueno: nunca publiques solo.",
    etiquetas: ["canales", "contenido", "voz"], requiere: [] },
  { id: "prompt:revisar", tipo: "prompt", origen: "os", nombre: "Revisar código con radio de impacto",
    descripcion: "Revisa el diff citando archivo y línea, di qué flujos toca según el grafo del código y separa lo bloqueante de lo opinable.",
    etiquetas: ["código", "revisión", "impacto"], requiere: [] },
  { id: "prompt:memoria", tipo: "prompt", origen: "os", nombre: "Resumir una memoria de cerebro",
    descripcion: "Condensa una memoria conservando nombres, fechas y decisiones; nunca inventes lo que no está.",
    etiquetas: ["memoria", "resumen"], requiere: [] },
  { id: "prompt:ola", tipo: "prompt", origen: "os", nombre: "Planificar una ola",
    descripcion: "Parte el trabajo en tareas de ≤3 archivos con enunciado medido, archivos, dependencias y tests de funciones puras.",
    etiquetas: ["olas", "planificación", "enjambre"], requiere: [] },
  // 2026-09-08 · Ola 297 · NV1: quien conduce un navegador actúa en nombre de la
  // fundación con sus sesiones ya iniciadas; las cuatro reglas viajan con el
  // prompt para que ningún agente tenga que acordarse de ellas.
  { id: "prompt:navegador", tipo: "prompt", origen: "os", nombre: "Conducir un navegador con cuidado",
    descripcion: REGLAS_NAVEGADOR.join(" "),
    etiquetas: ["navegador", "seguridad", "reglas", "consentimiento"], requiere: [] },
];

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿Este recurso existe en esa máquina? Sin `maquina` declarada, en las dos. */
export function disponibleEn(r: RecursoAgente, maquina: "mac" | "nube"): boolean {
  if (!r.maquina || r.maquina === "cualquiera") return true;
  return r.maquina === maquina;
}

export function filtrarRecursos(
  recursos: RecursoAgente[],
  f: { tipo?: TipoRecurso; origen?: OrigenRecurso; texto?: string },
): RecursoAgente[] {
  const t = f.texto ? sinTildes(f.texto) : "";
  return recursos.filter((r) => {
    if (f.tipo && r.tipo !== f.tipo) return false;
    if (f.origen && r.origen !== f.origen) return false;
    if (!t) return true;
    return sinTildes(`${r.nombre} ${r.descripcion} ${r.etiquetas.join(" ")}`).includes(t);
  });
}

export function agruparPorTipo(recursos: RecursoAgente[]): Record<string, RecursoAgente[]> {
  const out: Record<string, RecursoAgente[]> = {};
  for (const r of recursos) (out[r.tipo] ??= []).push(r);
  return out;
}

/** Puntúa por palabras de la tarea contra nombre, descripción y etiquetas. */
export function recomendarPara(
  recursos: RecursoAgente[], tarea: string, max = 6, maquina?: "mac" | "nube",
): RecursoAgente[] {
  const palabras = sinTildes(tarea).split(/[^a-z0-9]+/).filter((p) => p.length > 3);
  const puntuar = (r: RecursoAgente): number => {
    const heno = sinTildes(`${r.nombre} ${r.descripcion} ${r.etiquetas.join(" ")}`);
    let n = 0;
    for (const p of palabras) if (heno.includes(p)) n += r.etiquetas.some((e) => sinTildes(e).includes(p)) ? 2 : 1;
    return n;
  };
  return recursos
    .filter((r) => (maquina ? disponibleEn(r, maquina) : true))
    .map((r) => ({ r, n: puntuar(r) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.r);
}

/** Qué variables de entorno le faltan a este recurso para poder usarse. */
export function faltanRequisitos(r: RecursoAgente, variablesPresentes: string[]): string[] {
  return r.requiere.filter((v) => !variablesPresentes.includes(v));
}

/** Señales observadas por el adaptador del entorno; este módulo no las inventa. */
export interface EstadoActualNavegador {
  maquina: "mac" | "nube";
  comprobacionesSuperadas: string[];
}

export interface DiagnosticoViaNavegador {
  recurso: RecursoNavegador;
  disponible: boolean;
  maquinaCompatible: boolean;
  requisitosFaltantes: string[];
}

export interface ConsultaNavegador {
  vias: DiagnosticoViaNavegador[];
  disponibles: RecursoNavegador[];
  viaPreferida: RecursoNavegador | null;
  respuesta: string;
}

/**
 * Responde qué vías están vivas a partir de comprobaciones ya realizadas.
 * La ausencia de evidencia siempre significa «no comprobada», nunca disponible.
 */
export function consultarViasNavegador(
  estado: EstadoActualNavegador,
): ConsultaNavegador {
  const vias = RECURSOS_NAVEGADOR.map((recurso): DiagnosticoViaNavegador => {
    const maquinaCompatible = disponibleEn(recurso, estado.maquina);
    const requisitosFaltantes = faltanRequisitos(
      recurso,
      estado.comprobacionesSuperadas,
    );
    return {
      recurso,
      maquinaCompatible,
      requisitosFaltantes,
      disponible: maquinaCompatible && requisitosFaltantes.length === 0,
    };
  });
  const disponibles = vias.filter((via) => via.disponible).map((via) => via.recurso);
  const respuesta = disponibles.length === 0
    ? "No hay ninguna vía de navegador comprobada como disponible ahora."
    : `Vías de navegador comprobadas ahora: ${disponibles.map((r) => r.nombre).join(", ")}.`;

  return {
    vias,
    disponibles,
    viaPreferida: disponibles[0] ?? null,
    respuesta,
  };
}

/** Todo lo declarado en este módulo, en un solo catálogo. */
export function catalogoDeclarado(): RecursoAgente[] {
  return [...RECURSOS_NAVEGADOR, ...RECURSOS_ASTRAURA, ...RECURSOS_MEMORIA, ...PROMPTS_BASE];
}
