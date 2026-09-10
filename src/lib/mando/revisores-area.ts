/**
 * Revisores continuos por área — las decisiones PURAS de la vigilancia del OS.
 *
 * Ola 301 · Tarea RV1 (2026-09-09). Por qué: Alex pidió que StarSeed OS se
 * mire a sí mismo sin parar —diseño, accesibilidad, arquitectura, código
 * muerto, rendimiento, economía del enjambre, canales, memorias y
 * descubribilidad— y que de ahí salgan TAREAS, no informes muertos. La Ola
 * 294 ya fijó el FORMATO de una sugerencia (`SugerenciaAstra` en `astra.ts`):
 * aquí NO se inventa otro, se monta encima la vigilancia por zonas, con su
 * cadencia, su papel y su turno.
 *
 * TODO ESTE ARCHIVO ES PURO: sin red, sin disco, sin `node:*` y sin
 * temporizadores. Quién lee los archivos del área, quién llama al modelo y
 * quién escribe la cola vive en `revisores-servidor.ts` (RV2).
 */

import type { SugerenciaAstra } from "@/lib/mando/astra";

/** El papel con el que mira cada revisor: decide su tono y qué NO le toca. */
export type PapelRevisor = "disenador" | "ingeniero" | "limpiador" | "economista";

/** Una zona real del OS bajo vigilancia continua. */
export interface AreaRevisada {
    id: string;
    nombre: string;
    /** Rutas reales del repositorio, relativas a la raíz (archivo o carpeta). */
    rutas: string[];
    /** Qué busca el revisor, en frases concretas y comprobables. */
    busca: string[];
    /** Cada cuántas horas vuelve a mirarse esta zona (> 0 siempre). */
    cadenciaHoras: number;
    papel: PapelRevisor;
}

/**
 * Las zonas de ESTE repositorio, no zonas genéricas. Las cadencias son
 * económicas a propósito: lo que cambia cada día (enjambre, dock) se mira
 * seguido; lo que se sedimenta (código muerto, memorias) se mira despacio,
 * porque cada pasada cuesta contexto y el objetivo es vigilar sin derrapar.
 */
export const AREAS_REVISADAS: readonly AreaRevisada[] = [
    {
        id: "interfaz-diseno",
        nombre: "Interfaz y diseño",
        rutas: ["src/components", "design-system/starseed-system", "src/app/globals.css"],
        busca: [
            "Coherencia con Crystal Liquid Glass y con la Trinity: nada de vidrios, sombras ni radios inventados fuera de los tokens.",
            "Jerarquía visual: qué se lee primero en cada pantalla y si eso es lo importante.",
            "Movimiento con sentido (entradas, transiciones) y respeto a `prefers-reduced-motion`.",
            "Estados vacíos y de error escritos como habla StarSeed, nunca un hueco en blanco ni un «Error».",
        ],
        cadenciaHoras: 24,
        papel: "disenador",
    },
    {
        id: "accesibilidad",
        nombre: "Accesibilidad",
        rutas: ["src/components/a11y", "src/components/settings", "src/app/layout.tsx"],
        busca: [
            "Foco visible y devuelto al sitio correcto tras abrir y cerrar capas.",
            "Contraste real del texto sobre vidrio, que es donde el diseño translúcido se rompe.",
            "`aria-*` y roles correctos: nombre accesible en todo control que solo sea un icono.",
            "Orden de tabulación y trampas de foco en diálogos, docks y menús.",
        ],
        cadenciaHoras: 48,
        papel: "disenador",
    },
    {
        id: "arquitectura",
        nombre: "Arquitectura",
        rutas: ["src/lib", "src/ai"],
        busca: [
            "Acoplamientos que no deberían existir y capas saltadas entre `src/lib`, `src/components` y `src/app`.",
            "Módulos de servidor colados en el cliente: `node:*`, `fs`, claves o `process.env` en algo que se importa desde un componente.",
            "Lógica pura mezclada con efectos, que es lo que impide probarla.",
            "Dos módulos haciendo lo mismo con nombres distintos.",
        ],
        cadenciaHoras: 24,
        papel: "ingeniero",
    },
    {
        id: "codigo-muerto",
        nombre: "Código muerto",
        rutas: ["src/components", "src/lib", "src/app"],
        busca: [
            "Exports que nadie importa y funciones que ya no llama nadie.",
            "Componentes huérfanos: existen, compilan y no los renderiza ninguna pantalla.",
            "Rutas que no enlaza ni el OmniDock ni el catálogo de apps.",
            "Restos de olas anteriores: archivos `-old`, `-v2`, copias y ramas de código apagadas por una bandera que ya no se toca.",
        ],
        cadenciaHoras: 72,
        papel: "limpiador",
    },
    {
        id: "rendimiento",
        nombre: "Rendimiento",
        rutas: ["src/app", "src/components", "next.config.ts"],
        busca: [
            "Paquetes pesados importados enteros para usar una función.",
            "Vistas grandes sin `dynamic`, que entran en el primer paquete sin hacer falta.",
            "Imágenes sin optimizar y sin tamaño declarado.",
            "Renders y llamadas repetidas: efectos que se disparan en cada pintado. La Mac de 8 GB manda.",
        ],
        cadenciaHoras: 48,
        papel: "ingeniero",
    },
    {
        id: "enjambre-economia",
        nombre: "Enjambre y economía",
        rutas: ["scripts/enjambre", "memory/orquestacion-economica.md"],
        busca: [
            "Trabajo caro hecho por modelos de pago cuando lo hacía igual uno de coste cero.",
            "Colas que se relanzan enteras en vez de reanudar solo lo que falta.",
            "Tareas que pisan los mismos archivos y acaban en conflicto entre trabajadores.",
            "Techos de gasto y de paralelismo que no se comprueban ANTES de llamar.",
        ],
        cadenciaHoras: 12,
        papel: "economista",
    },
    {
        id: "canales-contenido",
        nombre: "Canales y contenido",
        rutas: ["src/lib/canales", "src/components/canales"],
        busca: [
            "Singularidad del contenido: una pieza se referencia, jamás se duplica.",
            "La voz de StarSeed en textos de interfaz, avisos y plantillas de publicación.",
            "Canales sin dueño claro, sin descripción o sin camino de entrada desde el feed.",
            "Publicación y feed acoplados a un proveedor concreto en vez de al modelo del OS.",
        ],
        cadenciaHoras: 72,
        papel: "disenador",
    },
    {
        id: "memorias-privacidad",
        nombre: "Memorias y privacidad",
        rutas: ["src/lib/memory-vault.ts", "src/lib/memory-sync", "memory/principles.md"],
        busca: [
            "Datos personales que salen de la máquina sin que nadie lo haya dicho.",
            "Dualidad cuenta/perfil respetada: qué es privado por defecto y qué es público a propósito.",
            "Memorias que crecen sin poda y acaban entrando enteras en cada contexto.",
            "Claves, tokens o rutas de casa filtradas a un archivo de memoria o a un registro.",
        ],
        cadenciaHoras: 72,
        papel: "ingeniero",
    },
    {
        id: "descubribilidad",
        nombre: "Descubribilidad",
        rutas: ["src/lib/dock/dock-defaults.ts", "src/app/(app)", "CLAUDE.md"],
        busca: [
            "La regla dorada del §11 del CLAUDE.md: una ruta que no está en el OmniDock ni en el catálogo de apps NO EXISTE para quien usa el OS.",
            "Pantallas terminadas en olas pasadas a las que hoy no se llega desde ningún sitio.",
            "Entradas del dock que apuntan a rutas que ya no existen.",
            "Nombres e iconos que no dicen lo que la pantalla hace de verdad.",
        ],
        cadenciaHoras: 36,
        papel: "limpiador",
    },
];

/** Una hora en milisegundos: la unidad en la que se miden todas las cadencias. */
const HORA_MS = 3_600_000;

/** Cadencia segura: el catálogo es válido, pero una llamada externa puede no serlo. */
function cadenciaDe(area: AreaRevisada): number {
    return Number.isFinite(area.cadenciaHoras) && area.cadenciaHoras > 0 ? area.cadenciaHoras : 24;
}

/** Horas transcurridas desde una marca ISO; `null` si la marca no es utilizable. */
function horasDesde(iso: string, ahora: Date): number | null {
    if (typeof iso !== "string" || iso.trim().length === 0) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    // Un reloj adelantado (marca en el futuro) cuenta como recién revisada, no
    // como negativa: es preferible mirar de más tarde que barrer en bucle.
    return Math.max(0, (ahora.getTime() - t) / HORA_MS);
}

/**
 * ¿Toca revisar esta área? Siempre devuelve el PORQUÉ, porque la vigilancia se
 * enseña en el Mando y «no toca» sin motivo no le sirve a nadie. Un área que
 * nunca se ha revisado (marca vacía o ilegible) toca siempre: es la primera vez.
 */
export function tocaRevisar(
    area: AreaRevisada,
    ultimaRevisionIso: string,
    ahora: Date = new Date(),
): { toca: boolean; motivo: string } {
    if (!Number.isFinite(ahora.getTime())) {
        return { toca: false, motivo: `No se puede decidir el turno de «${area.nombre}»: la hora actual no es válida.` };
    }
    const cadencia = cadenciaDe(area);
    const horas = horasDesde(ultimaRevisionIso, ahora);
    if (horas === null) {
        return { toca: true, motivo: `«${area.nombre}» no se ha revisado nunca: toca mirarla por primera vez.` };
    }
    if (horas >= cadencia) {
        return {
            toca: true,
            motivo: `«${area.nombre}» se revisó hace ${horas.toFixed(1)} h y su cadencia es de ${cadencia} h: toca.`,
        };
    }
    const faltan = cadencia - horas;
    return {
        toca: false,
        motivo: `«${area.nombre}» se revisó hace ${horas.toFixed(1)} h de ${cadencia} h de cadencia: faltan ${faltan.toFixed(1)} h.`,
    };
}

/**
 * El turno: de todas las áreas que ya han vencido, la MÁS ATRASADA respecto de
 * su propia cadencia (retraso relativo, no horas absolutas), para que rotar sea
 * automático y ninguna zona se quede sin mirar por tener cadencia larga. `null`
 * si no ha vencido ninguna: entonces no se gasta ni un token.
 */
export function siguienteArea(
    areas: readonly AreaRevisada[],
    ultimas: Record<string, string>,
    ahora: Date = new Date(),
): AreaRevisada | null {
    let elegida: AreaRevisada | null = null;
    let mejorRetraso = -1;
    for (const area of areas) {
        const iso = typeof ultimas[area.id] === "string" ? ultimas[area.id] : "";
        if (!tocaRevisar(area, iso, ahora).toca) continue;
        const cadencia = cadenciaDe(area);
        const horas = horasDesde(iso, ahora);
        // Nunca revisada = retraso infinito: entra antes que cualquier vencida.
        const retraso = horas === null ? Number.POSITIVE_INFINITY : horas / cadencia;
        if (retraso > mejorRetraso) {
            mejorRetraso = retraso;
            elegida = area;
        }
    }
    return elegida;
}

/**
 * La identidad de cada papel. No es adorno: un revisor con papel de limpiador
 * y otro con papel de diseñador miran el MISMO archivo y ven cosas distintas,
 * y eso es justo lo que se quiere de una vigilancia por zonas.
 */
const VOZ_DEL_PAPEL: Record<PapelRevisor, string> = {
    disenador:
        "Eres el diseñador que cuida la identidad visual de StarSeed: Crystal Liquid Glass, la Trinity y los tokens del design system. Te duele lo incoherente, lo ilegible y lo que no dice nada.",
    ingeniero:
        "Eres el ingeniero que sostiene la estructura de StarSeed OS: capas, acoplamientos, límites entre servidor y cliente, y coste real de cada render. Prefieres una función pura y probada a cualquier cosa lista.",
    limpiador:
        "Eres quien borra lo que ya no sirve sin romper nada. Antes de proponer un borrado compruebas quién lo usa y lo dices; si no puedes comprobarlo, no lo propones.",
    economista:
        "Eres quien vigila que el enjambre trabaje sin arruinarse: modelos de coste cero primero, techos comprobados antes de llamar y ni un token gastado dos veces en lo mismo.",
};

/**
 * Escala común para que dos áreas puntúen con la misma vara. La prioridad
 * orientativa coincide con Astra: impacto pesa doble; esfuerzo y riesgo restan.
 */
const GUIA_PUNTUACION = [
    "Impacto: 1 = retoque local casi imperceptible; 3 = mejora clara de un flujo; 5 = corrige una invariante, seguridad o una capacidad central del OS.",
    "Esfuerzo: 1 = cambio aislado y comprobable; 3 = varios puntos coordinados; 5 = rediseño transversal o migración.",
    "Riesgo: 1 = cambio reversible y contenido; 3 = puede afectar un flujo vecino; 5 = toca datos, identidad, privacidad, despliegue o compatibilidad.",
    "Prioridad orientativa = impacto × 2 − esfuerzo − riesgo. No infles valores para forzar el orden.",
] as const;

/**
 * El encargo del revisor de un área. PURA: recibe el contexto ya armado (lo
 * lee RV2) y devuelve las dos mitades del prompt. Exige lo mismo que Astra en
 * la Ola 294 —citar archivo y línea, no repetir lo que ya existe y responder
 * JSON estricto con la forma de `SugerenciaAstra[]`— porque la salida de todos
 * los revisores entra por el mismo `parsearSugerencias`.
 */
export function promptRevisorArea(area: AreaRevisada, contexto: string): { system: string; user: string } {
    const system = [
        VOZ_DEL_PAPEL[area.papel],
        `Ahora mismo revisas el área «${area.nombre}» (id=${area.id}) de StarSeed OS, y solo esa: lo que veas fuera de ella no es tuyo.`,
        "AUDITAS Y PROPONES, nunca escribes código a granel: de eso se encarga la flota gratuita del enjambre.",
        "Cada sugerencia cita SIEMPRE el archivo y la línea exactos (formato `ruta/archivo.ts:NNN`) en `evidencia`; una sugerencia sin cita no vale y no la envías.",
        "No propones NADA que ya exista en el contexto que te dan: primero compruebas si ya está hecho, y si lo está, callas.",
        "Prefieres pocas sugerencias ciertas a muchas plausibles: si el área está bien, lo dices devolviendo una lista vacía.",
        "Puntúas impacto, esfuerzo y riesgo con enteros de 1 a 5 usando la escala incluida en el encargo; no confundes impacto alto con esfuerzo alto.",
        "Respetas la Tríada Ideológica del proyecto (ontocracia, ciberdelia, transhumanismo comunista) y las invariantes del §6 del CLAUDE.md.",
        `Respondes ÚNICAMENTE con JSON válido, sin texto antes ni después: una lista con la forma de SugerenciaAstra[]. Cada elemento tiene id, ambito (exactamente "${area.id}"), titulo, porque, evidencia (citas con archivo y línea), impacto (1-5), esfuerzo (1-5), riesgo (1-5), archivos (rutas relativas del repositorio) y propuestaDeTarea ({titulo, archivos, prompt} o null).`,
    ].join(" ");

    const user = [
        `ÁREA: ${area.nombre} (id=${area.id}, papel=${area.papel}, cadencia=${area.cadenciaHoras} h).`,
        `RUTAS BAJO TU VIGILANCIA: ${area.rutas.join(", ")}.`,
        "",
        "QUÉ BUSCAS AQUÍ:",
        ...area.busca.map((b) => `- ${b}`),
        "",
        "CÓMO PUNTÚAS LO QUE ENCUENTRAS:",
        ...GUIA_PUNTUACION.map((criterio) => `- ${criterio}`),
        "",
        "CONTEXTO (fragmentos reales del repositorio, ya recortados):",
        contexto,
        "",
        `Devuelve solo el JSON con la lista de sugerencias del área «${area.nombre}». Si no hay nada que mejorar, devuelve [].`,
    ].join("\n");

    return { system, user };
}

/**
 * Normaliza un texto para comparar: sin tildes, en minúsculas y sin signos.
 * Por qué: dos revisores distintos escriben «Añadir foco visible al Dock» y
 * «anadir foco visible al dock» pensando en lo mismo, y eso NO son dos tareas.
 */
function normalizar(texto: string): string {
    return (typeof texto === "string" ? texto : "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** Identidad de una sugerencia: su área, sus archivos y su título normalizado. */
function claveDeSugerencia(s: SugerenciaAstra): string {
    const archivos = (Array.isArray(s.archivos) ? s.archivos : []).map((a) => normalizar(a)).sort().join(",");
    return `${normalizar(s.ambito)}|${archivos}|${normalizar(s.titulo)}`;
}

/**
 * Une lo que ya se había propuesto con lo que acaba de decir el revisor. Si una
 * sugerencia ya estaba, se queda la REDACCIÓN MÁS RECIENTE (el revisor puede
 * haber afinado la evidencia) pero se CONSERVA EL ID VIEJO: los estados
 * («propuesta», «aprobada», «descartada») que guarda RV2 van por id, y cambiarlo
 * resucitaría como nueva algo que una persona ya había descartado.
 */
export function fusionarSugerencias(previas: SugerenciaAstra[], nuevas: SugerenciaAstra[]): SugerenciaAstra[] {
    const salida: SugerenciaAstra[] = [];
    const porClave = new Map<string, number>();

    for (const s of Array.isArray(previas) ? previas : []) {
        const clave = claveDeSugerencia(s);
        const i = porClave.get(clave);
        if (i === undefined) {
            porClave.set(clave, salida.length);
            salida.push(s);
        } else {
            salida[i] = { ...s, id: salida[i].id };
        }
    }

    for (const s of Array.isArray(nuevas) ? nuevas : []) {
        const clave = claveDeSugerencia(s);
        const i = porClave.get(clave);
        if (i === undefined) {
            porClave.set(clave, salida.length);
            salida.push(s);
        } else {
            salida[i] = { ...s, id: salida[i].id };
        }
    }

    return salida;
}

/** Tope duro de archivos por tarea: la regla del repositorio es «≤ 3 archivos». */
const MAX_ARCHIVOS_POR_TAREA = 3;

/**
 * Modelo por defecto de la tarea resultante: escritor de COSTE CERO. Una
 * sugerencia aprobada la escribe la flota gratuita; el modelo de pago audita,
 * no teclea (Ola 294 · Astra).
 */
const MODELO_ESCRITOR_GRATIS = "nim/deepseek-ai/deepseek-v4-pro-0813";

/** Ruta canónica dentro del repositorio; rechaza escapes y rutas del sistema. */
function rutaRelativaSegura(ruta: string): string | null {
    const candidata = (typeof ruta === "string" ? ruta : "").trim().replace(/\\/g, "/");
    if (
        candidata.length === 0 ||
        candidata.startsWith("/") ||
        /^[A-Za-z]:(?:\/|$)/.test(candidata) ||
        candidata.includes("://") ||
        candidata.includes("\0")
    ) {
        return null;
    }
    const segmentos = candidata.split("/").filter((segmento) => segmento !== "" && segmento !== ".");
    if (segmentos.length === 0 || segmentos.some((segmento) => segmento === "..")) return null;
    return segmentos.join("/");
}

/** Huella corta y determinista para que dos ids parecidos no pisen una cola. */
function huellaEstable(texto: string): string {
    let hash = 2_166_136_261;
    for (let i = 0; i < texto.length; i += 1) {
        hash ^= texto.charCodeAt(i);
        hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(36);
}

/** Identificador de tarea legible, estable y resistente a colisiones triviales. */
function idDeTarea(id: string): string {
    const origen = typeof id === "string" ? id.trim() : "";
    const base = normalizar(origen).replace(/ /g, "-").slice(0, 36);
    return `rev-${base.length > 0 ? base : "sugerencia"}-${huellaEstable(origen)}`;
}

/**
 * Convierte una sugerencia APROBADA en tarea del enjambre. Pura: devuelve el
 * objeto, no lo escribe (eso es de RV2) ni lo lanza (eso es de una persona).
 * La evidencia entra ENTERA en el prompt: es lo único que permite al escritor
 * ir al archivo y a la línea sin volver a auditar todo el repositorio.
 */
export function aTareaDeCola(
    s: SugerenciaAstra,
    ola: string,
): { id: string; ola: string; titulo: string; archivos: string[]; depende: string[]; modelo: string; prompt: string } {
    const propuesta = s.propuestaDeTarea;
    const brutos = [...(propuesta ? propuesta.archivos : []), ...(Array.isArray(s.archivos) ? s.archivos : [])];
    const vistos = new Set<string>();
    const archivos: string[] = [];
    for (const a of brutos) {
        const limpio = rutaRelativaSegura(a);
        if (limpio === null || vistos.has(limpio)) continue;
        vistos.add(limpio);
        // Se corta en 3 a propósito: una tarea que toca más archivos no la puede
        // revisar nadie de un vistazo y choca con el resto del enjambre.
        if (archivos.length >= MAX_ARCHIVOS_POR_TAREA) break;
        archivos.push(limpio);
    }

    const titulo = (propuesta && propuesta.titulo.trim().length > 0 ? propuesta.titulo : s.titulo).trim();
    const evidencia = Array.isArray(s.evidencia) ? s.evidencia : [];
    const prompt = [
        `OLA: ${ola}`,
        `TÍTULO: ${titulo}`,
        `ARCHIVOS: ${archivos.join(", ")}`,
        "",
        `POR QUÉ: ${s.porque}`,
        "",
        "EVIDENCIA (archivo y línea que citó el revisor del área):",
        ...(evidencia.length > 0 ? evidencia.map((e) => `- ${e}`) : ["- (el revisor no citó ninguna línea; compruébalo antes de tocar nada)"]),
        "",
        ...(propuesta && propuesta.prompt.trim().length > 0 ? [`ENCARGO DEL REVISOR:\n${propuesta.prompt.trim()}`, ""] : []),
        "REGLAS DEL REPOSITORIO: toca como mucho 3 archivos y solo los listados arriba.",
        "Escribe por trozos: nunca una sola escritura de más de 120 líneas.",
        "Si escribes lógica, que sea en funciones PURAS con su test en `src/lib/__tests__/` (vitest con `globals: false`: importa describe/it/expect).",
        "TypeScript estricto, sin `any`; comentarios en español explicando el porqué.",
        "No ejecutes `npx tsc` suelto ni `next build`: usa `bash scripts/enjambre/tsc-turno.sh`.",
        `Impacto ${s.impacto}/5, esfuerzo ${s.esfuerzo}/5, riesgo ${s.riesgo}/5.`,
    ].join("\n");

    return { id: idDeTarea(s.id), ola, titulo, archivos, depende: [], modelo: MODELO_ESCRITOR_GRATIS, prompt };
}
