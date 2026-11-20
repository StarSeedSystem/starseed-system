export type IdCanalEspecializado = "principal" | "general" | "audiovisual";

export type IdPestanaDireccion =
    | "todo"
    | "direccion"
    | "conversacion"
    | "informes"
    | "enjambre"
    | "usos";

export type CategoriaHerramientaCanal =
    | "diseno"
    | "audiovisual"
    | "sintesis"
    | "alcance"
    | "orquestacion"
    | "eficiencia"
    | "almacenamiento";

export interface HerramientaCanal {
    id: string;
    nombre: string;
    categoria: CategoriaHerramientaCanal;
    regla?: string;
}

export interface AccionRapidaCanal {
    id: string;
    etiqueta: string;
    plantilla: string;
    descripcion: string;
}

export interface PerfilCanalEspecializado {
    id: IdCanalEspecializado;
    nombre: string;
    nombreCorto: string;
    descripcion: string;
    botTelegram: string;
    botNombre: string;
    puenteAstraura: "genesis" | "hermes-avisos" | "peticiones";
    sesionHermesTitulo: string;
    rol: string;
    capacidades: string[];
    herramientas: HerramientaCanal[];
    reglasClave: string[];
    accionesRapidas: AccionRapidaCanal[];
    tono: "violet" | "sky" | "emerald";
}

export interface PerfilPestanaDireccion {
    id: IdPestanaDireccion;
    titulo: string;
    enfoque: string;
    herramientas: string[];
    atajos: { etiqueta: string; plantilla: string }[];
}

export const ORDEN_CANALES_ESPECIALIZADOS: readonly IdCanalEspecializado[] = [
    "principal",
    "general",
    "audiovisual",
] as const;

export const PERFILES_CANALES: Record<IdCanalEspecializado, PerfilCanalEspecializado> = {
    principal: {
        id: "principal",
        nombre: "Dirección principal",
        nombreCorto: "Principal",
        descripcion:
            "Canal presidente sincronizado entre MetaGenesis, Astraura › Genesis, Hermes, Antigravity y Telegram Maggacortex.",
        botTelegram: "@starseed_neurocortex_bot",
        botNombre: "Maggacortex",
        puenteAstraura: "genesis",
        sesionHermesTitulo: "Dirección MetaGenesis",
        rol: "Estrategia, arquitectura, relevo del Director presidente, medidores y economía de modelos.",
        capacidades: [
            "Cadena automática de dirección (Claude, Hermes, Antigravity, Codex y flota gratuita)",
            "Supervisión de medidores en vivo, salud de nodos y decisiones con Jev y Laya/Colibrí",
            "Descarga verificada hacia Maggabox P2P y respaldo en Google Drive sin saturar la Mac",
            "Autorización de pasos manuales, publicaciones y contratos entre olas",
        ],
        herramientas: [
            { id: "jev", nombre: "Jev (veredictos.py)", categoria: "eficiencia" },
            { id: "laya", nombre: "Laya / Colibrí (:4480)", categoria: "eficiencia" },
            { id: "maggabox", nombre: "Maggabox P2P (starseed-nodo-1)", categoria: "almacenamiento" },
            { id: "drive", nombre: "Espejo Drive", categoria: "almacenamiento" },
            { id: "grafo", nombre: "GitNexus (grafo-codigo)", categoria: "orquestacion" },
            { id: "presidente", nombre: "Director presidente", categoria: "orquestacion" },
        ],
        reglasClave: [
            "Cada respuesta aquí se espeja en Astraura › Genesis, Hermes y Telegram Maggacortex.",
            "Usar la pirámide gratuita y Jev antes de escalar a modelos de pago.",
        ],
        accionesRapidas: [
            {
                id: "diagnostico-principal",
                etiqueta: "Estado integral",
                plantilla:
                    "Dame un resumen ejecutivo del estado actual de MetaGenesis, olas activas, medidores críticos y uso de disco entre Mac y Maggabox.",
                descripcion: "Diagnóstico completo desde la dirección principal.",
            },
            {
                id: "revisar-jev",
                etiqueta: "Auditar bloqueadas (Jev)",
                plantilla:
                    "Analiza con veredictos.py (Jev) las tareas bloqueadas o atascadas y propón qué aprobar, soltar o reasignar sin gastar cuota.",
                descripcion: "Triaje económico con Jev.",
            },
            {
                id: "aliviar-maggabox",
                etiqueta: "Aliviar almacenamiento",
                plantilla:
                    "Revisa qué artefactos pesados conviene mover al almacenamiento P2P de Maggabox o Google Drive con verificación SHA-256.",
                descripcion: "Descarga segura hacia Maggabox.",
            },
        ],
        tono: "violet",
    },
    general: {
        id: "general",
        nombre: "Dirección general",
        nombreCorto: "General",
        descripcion:
            "Sala operativa del enjambre sincronizada con Hermes y Telegram de enlaces operativos.",
        botTelegram: "@starseed_puente_bot",
        botNombre: "Enlace operativo de dirección",
        puenteAstraura: "hermes-avisos",
        sesionHermesTitulo: "StarSeed · Enlace general de dirección (chat oficial)",
        rol: "Operación del orquestador único, olas, puertas de verificación, worktrees y nodos.",
        capacidades: [
            "Control de colas, olas, aprobaciones y liberaciones con starseed-puente",
            "Supervisión de puertas: npx tsc --noEmit, Vitest y compilación remota en Oracle A1",
            "Saneamiento de sesiones (SES1113), límites de Supabase y limpieza segura de worktrees",
            "Comandos operativos rápidos: /estado, /agentes, /olas, /cola, /puertas, /aprobar",
        ],
        herramientas: [
            { id: "puente", nombre: "starseed-puente", categoria: "orquestacion" },
            { id: "orquestador", nombre: "starseed-enjambre.py", categoria: "orquestacion" },
            { id: "sanador", nombre: "Sanador SES1113", categoria: "eficiencia" },
            { id: "worktrees", nombre: "limpieza_worktrees.py", categoria: "almacenamiento" },
            { id: "supabase", nombre: "Vigilancia Supabase", categoria: "eficiencia" },
            { id: "reconstruir-a1", nombre: "reconstruir_mando.py (A1)", categoria: "orquestacion" },
        ],
        reglasClave: [
            "Un solo orquestador vivo a la vez y cero compilaciones pesadas en la Mac de 8 GB.",
            "Cualquier integración fuera del orquestador debe notificarse con starseed-puente integrada.",
        ],
        accionesRapidas: [
            {
                id: "estado-cola",
                etiqueta: "/estado del enjambre",
                plantilla: "/estado · Resume agentes escribiendo, tareas listas para aprobar y estado de puertas.",
                descripcion: "Consulta viva de agentes y puertas.",
            },
            {
                id: "limpiar-wt",
                etiqueta: "Revisar worktrees",
                plantilla: "Inspecciona worktrees integrados o cerrados en starseed-wt que se puedan limpiar de forma segura.",
                descripcion: "Auditoría de worktrees limpios.",
            },
            {
                id: "compilar-a1",
                etiqueta: "Compilar en A1",
                plantilla: "Verifica que tsc y vitest estén en verde y programa la compilación remota en el nodo A1.",
                descripcion: "Reconstrucción remota segura.",
            },
        ],
        tono: "sky",
    },
    audiovisual: {
        id: "audiovisual",
        nombre: "Producción audiovisual, diseño y promoción",
        nombreCorto: "Audiovisual y diseño",
        descripcion:
            "Estudio especializado en diseño profesional, vídeo, síntesis multiformato y promoción/contactos sincronizado con @StarSeed_Design_bot, Hermes, MetaGenesis y Astraura › Genesis.",
        botTelegram: "@StarSeed_Design_bot",
        botNombre: "Síntesis de producción StarSeed",
        puenteAstraura: "peticiones",
        sesionHermesTitulo:
            "StarSeed · Producción Audiovisual, Diseño y Promoción (@StarSeed_Design_bot)",
        rol: "Dirección de arte, DESIGN.md/Stitch, vídeo/motion/3D, NotebookLM (9 formatos) y difusión/contactos ALC1113.",
        capacidades: [
            "Diseño profesional: Stitch MCP, DESIGN.md, awesome-design-md, enhance-prompt, react:components, shadcn-ui y frontend-slides",
            "Producción audiovisual: Higgsfield (seedance-2.0 / veo-3, siempre como propuesta hasta aprobación), HyperFrames (claude-video-studio), Remotion y mac-blender",
            "Síntesis e investigación: NotebookLM (infografía, audio, vídeo, presentación, mapa mental, informe, cuestionario, tarjetas, tabla y Deep Research) y Google Drive",
            "Promoción y contactos (alcance): campañas ALC1113 / ALC-NICK-1116, borradores de contactos, MetaGeminis y publicación en canales con aprobación explícita",
        ],
        herramientas: [
            { id: "stitch", nombre: "Stitch MCP + DESIGN.md", categoria: "diseno" },
            { id: "awesome-design", nombre: "awesome-design-md + enhance-prompt", categoria: "diseno" },
            {
                id: "higgsfield",
                nombre: "Higgsfield (seedance-2.0 / veo-3)",
                categoria: "audiovisual",
                regla: "Solo borrador/propuesta hasta aprobación explícita de Maggasukha",
            },
            { id: "motion", nombre: "HyperFrames + Remotion + frontend-slides", categoria: "audiovisual" },
            { id: "blender", nombre: "mac-blender (3D)", categoria: "audiovisual" },
            { id: "notebooklm", nombre: "NotebookLM (9 formatos + Deep Research)", categoria: "sintesis" },
            { id: "drive-prod", nombre: "Drive producción (6 carpetas)", categoria: "sintesis" },
            {
                id: "alcance",
                nombre: "Promoción y contactos (ALC1113)",
                categoria: "alcance",
                regla: "Cero envíos sin aprobación explícita ni registro SHA-256",
            },
            { id: "metageminis", nombre: "MetaGeminis y PanelCanales", categoria: "alcance" },
        ],
        reglasClave: [
            "Higgsfield nunca ejecuta créditos sin aprobación previa (higgsfield_aprobado.py) ni genera el símbolo de StarSeed.",
            "Promoción y contactos (ALC1113): ningún mensaje sale a destinatarios externos sin aprobación explícita y SHA-256 en alcance.",
            "Deep Research aplica límite max_fuentes=25 y descarta temas marcados en temas_descartados.json.",
        ],
        accionesRapidas: [
            {
                id: "sistema-design",
                etiqueta: "Design System / Stitch",
                plantilla:
                    "Diseña una propuesta en formato DESIGN.md + prompt Stitch mejorado (sin imitar marcas ajenas y conservando el símbolo y tokens de StarSeed) para: ",
                descripcion: "Abre flujo de diseño profesional y Stitch.",
            },
            {
                id: "guion-audiovisual",
                etiqueta: "Propuesta de vídeo / Higgsfield",
                plantilla:
                    "Prepara guion técnico, storyboard por escenas y estimación de presupuesto (sin ejecutar aún; esperando aprobación de Maggasukha) para el vídeo: ",
                descripcion: "Guion y propuesta audiovisual controlada.",
            },
            {
                id: "campana-alcance",
                etiqueta: "Borrador de promoción / contactos",
                plantilla:
                    "Redacta un borrador de difusión y lista de contactos candidatos (protocolo ALC1113, sin enviar nada hasta recibir aprobación explícita) sobre: ",
                descripcion: "Campaña de alcance y difusión.",
            },
            {
                id: "pieza-notebooklm",
                etiqueta: "Síntesis NotebookLM",
                plantilla:
                    "Genera en NotebookLM (@StarSeed_Design_bot) usando las fuentes vigentes de StarSeed una pieza en formato [infografía | vídeo | presentación | audio | informe] sobre: ",
                descripcion: "Encargo multiformato en el A1.",
            },
        ],
        tono: "emerald",
    },
};

export const PERFILES_PESTANAS_DIRECCION: Record<IdPestanaDireccion, PerfilPestanaDireccion> = {
    todo: {
        id: "todo",
        titulo: "Vista unificada",
        enfoque: "Supervisión completa de mensajes, decisiones, informes y actividad del enjambre.",
        herramientas: ["Hilo sincronizado", "Jev", "Maggacortex", "Medidores"],
        atajos: [
            {
                etiqueta: "Resumen del hilo",
                plantilla: "Resume los acuerdos abiertos y el siguiente paso prioritario en este canal.",
            },
        ],
    },
    direccion: {
        id: "direccion",
        titulo: "Decisiones de dirección",
        enfoque: "Órdenes de arquitectura, aprobaciones críticas y criterio del Director presidente.",
        herramientas: ["Director presidente", "Contratos de ola", "Aprobación humana"],
        atajos: [
            {
                etiqueta: "Fijar prioridad",
                plantilla: "Establece la prioridad de esta hora y qué debe aprobarse antes de continuar.",
            },
        ],
    },
    conversacion: {
        id: "conversacion",
        titulo: "Diálogo directo",
        enfoque: "Intercambio vivo entre Alex y los directores activos sin ruido de logs.",
        herramientas: ["Maggacortex", "Hermes", "Antigravity", "Astraura"],
        atajos: [
            {
                etiqueta: "Consultar al director",
                plantilla: "¿Cuál es la decisión recomendada y qué riesgos ves ahora mismo?",
            },
        ],
    },
    informes: {
        id: "informes",
        titulo: "Informes y síntesis",
        enfoque: "Síntesis diarias, aprendizaje entre olas y auditorías verificadas.",
        herramientas: ["aprendizaje-olas.md", "Síntesis diaria", "NotebookLM"],
        atajos: [
            {
                etiqueta: "Lectura de hallazgos",
                plantilla: "Destaca los hallazgos repetidos y qué corrección estructural falta por cerrar.",
            },
        ],
    },
    enjambre: {
        id: "enjambre",
        titulo: "Actividad del enjambre",
        enfoque: "Ejecución de trabajadores, bloqueadas y movimiento en las colas.",
        herramientas: ["Orquestador", "Veredictos Jev", "Estado de worktrees"],
        atajos: [
            {
                etiqueta: "Desbloquear cola",
                plantilla: "Revisa qué trabajadores están detenidos o bloqueados y cómo destrabarlos.",
            },
        ],
    },
    usos: {
        id: "usos",
        titulo: "Cuotas, recursos y ahorro",
        enfoque: "Presupuesto de modelos, consumo de Supabase, almacenamiento Mac/Maggabox y salud.",
        herramientas: ["Jev ($/día)", "Laya (:4480)", "Maggabox P2P", "Supabase"],
        atajos: [
            {
                etiqueta: "Auditoría de gasto",
                plantilla: "Reporta cuota restante, gasto diario de Jev y espacio libre entre Mac y Maggabox.",
            },
        ],
    },
};

export function perfilDeCanal(id: IdCanalEspecializado): PerfilCanalEspecializado {
    return PERFILES_CANALES[id];
}

export function perfilDePestana(vista: IdPestanaDireccion): PerfilPestanaDireccion {
    return PERFILES_PESTANAS_DIRECCION[vista];
}

export function canalesEspecializadosOrdenados(): PerfilCanalEspecializado[] {
    return ORDEN_CANALES_ESPECIALIZADOS.map((id) => PERFILES_CANALES[id]);
}

export function canalPorPuenteAstraura(
    puente: string | null | undefined,
): PerfilCanalEspecializado | null {
    if (!puente) return null;
    return (
        Object.values(PERFILES_CANALES).find((perfil) => perfil.puenteAstraura === puente) ?? null
    );
}
