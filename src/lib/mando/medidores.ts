// src/lib/mando/medidores.ts
// -----------------------------------------------------------------------------
// Qué hay DETRÁS de cada medidor de la cabecera y qué se puede hacer con ello.
//
// POR QUÉ (2026-09-15). Los medidores decían un número y te dejaban solo: «23
// bloqueadas» y a buscarte la vida. Alex pidió que cada uno se abra y enseñe
// cuáles son, por qué, y con qué acciones — descartar, reintentar describiendo
// el cambio, publicar.
//
// Todo lo que decide vive AQUÍ y es puro. La interfaz no repite ni una regla:
// si mañana cambia qué se puede descartar, se cambia en un sitio y no en cinco.
// -----------------------------------------------------------------------------

import { ETAPAS, etapaDeFase } from "@/lib/mando/etapas";

export type ClaveMedidor =
    | "en-curso"
    | "agentes"
    | "listas"
    | "bloqueadas"
    | "sin-publicar"
    | "proveedores"
    | "memoria"
    | "disco"
    | "ola-activa";

export type ClaseAccion = "descartar" | "descartar-todas" | "reintentar" | "publicar" | "ir-a";

export interface AccionMedidor {
    clase: ClaseAccion;
    texto: string;
    /** Pestaña del Mando para `ir-a`. */
    destino?: string;
    /** Rojo + confirmación en dos pasos. Nunca se omite en algo que borra. */
    destructiva: boolean;
    /** Si está, la acción pide texto antes de poder enviarse. */
    pideTexto?: string;
}

export interface FilaMedidor {
    id: string;
    titulo: string;
    estado?: string;
    /** Avance 0-100 de ESA tarea por el camino de seis etapas. Solo donde significa algo:
     *  en curso, agentes y listas. En «bloqueadas» o «sin publicar» no se pone, porque un
     *  porcentaje ahí sería inventado. */
    porcentaje?: number;
    /** En qué etapa del camino va, con el nombre que usa `etapas.ts`. */
    etapa?: string;
    /** En castellano y en una frase: por qué esta fila está donde está. */
    porque?: string;
    desde?: string;
    quien?: string;
    acciones: AccionMedidor[];
}

export interface DetalleMedidor {
    clave: ClaveMedidor;
    titulo: string;
    resumen: string;
    filas: FilaMedidor[];
    acciones: AccionMedidor[];
    /** Media del avance de las filas que lo tienen, para la cabecera del panel. */
    porcentajeMedio?: number;
    /** Qué decir cuando no hay filas. Nunca una lista en blanco y muda. */
    vacio?: string;
}

/** Estados que ya terminaron: nada de lo que hay aquí se descarta ni se reintenta. */
export const TERMINALES = new Set(["commit", "hecho"]);

/**
 * Avance 0-100 de una tarea por el camino de seis etapas de `etapas.ts`.
 *
 * Se reutiliza ese camino a propósito: es el mismo que dibuja la barra de fases en
 * Procesos. Con dos escalas distintas, el mismo agente diría 50 % en un sitio y 33 %
 * en otro, y volveríamos a tener dos verdades sobre el mismo hecho.
 */
export function avanceDe(fase: string | undefined, estado: string | undefined): { porcentaje: number; etapa?: string } {
    const etapa = etapaDeFase(fase ?? "", estado ?? null);
    // Sin fase reconocible el trabajo aún no ha empezado: 0 %, no «desconocido».
    if (!etapa) return { porcentaje: 0 };
    const indice = ETAPAS.indexOf(etapa);
    return { porcentaje: Math.round(((indice + 1) / ETAPAS.length) * 100), etapa };
}

/** Media redondeada del avance de las filas que lo traen; 0 si ninguna lo trae. */
export function mediaDeAvance(filas: FilaMedidor[]): number {
    const conAvance = filas.filter((f) => typeof f.porcentaje === "number");
    if (conAvance.length === 0) return 0;
    return Math.round(conAvance.reduce((t, f) => t + (f.porcentaje ?? 0), 0) / conAvance.length);
}

const IR_A = (texto: string, destino: string): AccionMedidor => ({
    clase: "ir-a",
    texto,
    destino,
    destructiva: false,
});

/**
 * Acciones legales para UNA tarea según su estado.
 *
 * La regla que no se negocia: lo que ya está en main no se descarta desde un
 * panel. Un clic de más no puede deshacer trabajo integrado.
 */
export function accionesDeTarea(estado: string | undefined): AccionMedidor[] {
    if (!estado || TERMINALES.has(estado)) return [];
    return [
        { clase: "descartar", texto: "Descartar", destructiva: true },
        {
            clase: "reintentar",
            texto: "Reintentar con un cambio",
            destructiva: false,
            pideTexto: "¿Qué hay que cambiar para que salga bien esta vez?",
        },
    ];
}

/** «dependencia no integrada: X (bloqueada)» → «X». */
export function dependenciaDeNota(nota: string | undefined): string[] {
    const m = /dependencia no integrada:\s*(.+)$/i.exec(nota ?? "");
    if (!m) return [];
    return m[1]
        .split(",")
        .map((t) => t.trim().replace(/\s*\(.*$/, ""))
        .filter(Boolean);
}

/**
 * Por qué está bloqueada esta tarea, dicho para una persona.
 *
 * El caso que importa: si su dependencia YA está integrada, la tarea no está
 * esperando nada — está esperando a que alguien se dé cuenta. Decirlo cambia lo
 * que haces con ella.
 */
export function porqueBloqueada(
    nota: string | undefined,
    estadoDe: (id: string) => string | undefined,
): string {
    const deps = dependenciaDeNota(nota);
    if (deps.length === 0) return nota?.trim() || "bloqueada sin motivo anotado";
    const abiertas = deps.filter((d) => !TERMINALES.has(estadoDe(d) ?? ""));
    if (abiertas.length === 0) {
        return `${deps.join(", ")} ya está integrada: esto puede desbloquearse`;
    }
    return `espera a ${abiertas.join(", ")}`;
}

/** El id como palabra entera dentro de los asuntos de commit de `main`. */
export function idEnAsuntos(id: string, asuntos: string): boolean {
    if (!id) return false;
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9])${escapado}([^A-Za-z0-9]|$)`, "m").test(asuntos);
}

/** Estados con los que el vigilante NO relanza nada solo: aquí tampoco cuentan como listas. */
const ABIERTOS = new Set(["pendiente", ""]);

/**
 * Las que el enjambre cogería AHORA si se le suelta. Es la misma regla que
 * `scripts/puente/vigilante_logica.seleccionar_pendientes`, y tiene que serlo: si
 * aquí se usara otra, el medidor diría 78 listas mientras el vigilante coge 4, y
 * no habría forma de saber cuál de los dos miente.
 *
 * Tres filtros, los tres del vigilante:
 *   1. solo colas FUENTE — `cola-auto-*` son copias de ejecución que el propio
 *      enjambre genera al relanzar, no demanda nueva;
 *   2. sin estado que lo impida (bloqueada, rechazada, commit… no se relanzan);
 *   3. fuera lo que ya figura en un commit de `main`, aunque nadie actualizara su
 *      estado. Eso es lo que inflaba la cuenta: 74 tareas de olas viejas, hechas y
 *      publicadas hace semanas, sin entrada en progreso.json.
 */
export function ejecutablesDeColas(
    colas: { id: string; titulo?: string; ola?: string; cola?: string }[],
    progreso: Record<string, { estado?: string } | undefined>,
    asuntosDeMain: string,
): { id: string; titulo: string; ola?: string }[] {
    const vistos = new Set<string>();
    const salida: { id: string; titulo: string; ola?: string }[] = [];
    for (const t of colas) {
        if (!t.id || vistos.has(t.id)) continue;
        if ((t.cola ?? "").startsWith("auto-")) continue;
        vistos.add(t.id);
        if (!ABIERTOS.has(progreso[t.id]?.estado ?? "")) continue;
        if (idEnAsuntos(t.id, asuntosDeMain)) continue;
        salida.push({ id: t.id, titulo: t.titulo ?? "", ola: t.ola });
    }
    return salida;
}

export interface DatosMedidores {
    progreso: Record<string, { estado?: string; nota?: string; t?: string; modelo?: string }>;
    titulos: Record<string, string>;
    latidos: { tarea: string; fase: string; modelo: string; minutos: number; donde: string; proveedor?: string }[];
    commitsSinPublicar: { sha: string; asunto: string; fecha?: string }[];
    ejecutables: { id: string; titulo: string; ola?: string }[];
    proveedores: { id: string; estado: string; motivo?: string }[];
    olaActiva?: string;
    /** ¿Hay orquestador vivo? ¿Está el enjambre en pausa? Sin esto, «13 listas y 0 agentes»
     *  no se puede explicar, y un número sin explicación parece una avería aunque no lo sea. */
    enjambreVivo?: boolean;
    enjambrePausado?: boolean;
    disco?: { libreGb: number; usadoPct: number };
    memoria?: { libreMb: number; swapMb: number };
}

const vacios: DatosMedidores = {
    progreso: {},
    titulos: {},
    latidos: [],
    commitsSinPublicar: [],
    ejecutables: [],
    proveedores: [],
};

/** El detalle completo de un medidor: filas, porqués y acciones. */
export function detalleDeMedidor(clave: ClaveMedidor, datos: Partial<DatosMedidores>): DetalleMedidor {
    const d = { ...vacios, ...datos };
    const estadoDe = (id: string) => d.progreso[id]?.estado;
    const titulo = (id: string) => d.titulos[id] || id;

    switch (clave) {
        case "bloqueadas": {
            const filas: FilaMedidor[] = Object.entries(d.progreso)
                .filter(([, v]) => v?.estado === "bloqueada" || v?.estado === "bloqueante")
                .map(([id, v]) => ({
                    id,
                    titulo: titulo(id),
                    estado: v.estado,
                    porque:
                        v.estado === "bloqueante"
                            ? "agotó los reintentos gratuitos: necesita una persona"
                            : porqueBloqueada(v.nota, estadoDe),
                    desde: v.t,
                    acciones: accionesDeTarea(v.estado),
                }))
                .sort((a, b) => a.id.localeCompare(b.id));
            const listas = filas.filter((f) => f.porque?.includes("puede desbloquearse")).length;
            return {
                clave,
                titulo: "Bloqueadas",
                resumen:
                    filas.length === 0
                        ? "nada esperando"
                        : `${filas.length} esperando${listas > 0 ? ` · ${listas} ya pueden desbloquearse` : ""}`,
                filas,
                acciones: filas.length
                    ? [{ clase: "descartar-todas", texto: "Descartar todas", destructiva: true }]
                    : [],
                vacio: "Ninguna tarea espera a otra: lo que queda o está en marcha o está hecho.",
            };
        }

        case "sin-publicar": {
            const filas: FilaMedidor[] = d.commitsSinPublicar.map((c) => ({
                id: c.sha.slice(0, 8),
                titulo: c.asunto,
                estado: "sin publicar",
                desde: c.fecha,
                // Un commit no se tira desde un panel: solo se publica o se deja.
                acciones: [],
            }));
            return {
                clave,
                titulo: "Sin publicar",
                resumen: filas.length === 0 ? "todo publicado" : `${filas.length} commits esperando`,
                filas,
                acciones: filas.length
                    ? [{ clase: "publicar", texto: "Publicar en origin/main", destructiva: false }]
                    : [],
                vacio: "No hay nada sin publicar: la rama está igual que el remoto.",
            };
        }

        case "en-curso":
        case "agentes": {
            const filas: FilaMedidor[] = d.latidos.map((l) => {
                const avance = avanceDe(l.fase, estadoDe(l.tarea));
                return {
                    id: l.tarea,
                    titulo: titulo(l.tarea),
                    estado: l.fase,
                    porcentaje: avance.porcentaje,
                    etapa: avance.etapa,
                    quien: `${l.proveedor ?? l.modelo.split("/")[0]} · ${l.modelo.split("/").slice(-1)[0]} en ${l.donde}`,
                    desde: `${l.minutos} min`,
                    porque: l.minutos > 45 ? "lleva mucho sin cambiar de fase" : undefined,
                    acciones: [],
                };
            });
            // Un `en_curso` sin latido es un estado rancio, y verlo es media reparación.
            const rancias = Object.entries(d.progreso)
                .filter(([id, v]) => v?.estado === "en_curso" && !d.latidos.some((l) => l.tarea === id))
                .map(([id, v]) => ({
                    id,
                    titulo: titulo(id),
                    estado: "en_curso sin agente",
                    // 0 % y no «a medias»: si nadie late por ella, no está avanzando nada.
                    porcentaje: 0,
                    porque: "figura en curso pero ningún agente late por ella: estado rancio",
                    desde: v.t,
                    acciones: accionesDeTarea(v.estado),
                }));
            const todas = [...rancias, ...filas];
            const medio = mediaDeAvance(todas);
            return {
                clave,
                titulo: clave === "agentes" ? "Agentes trabajando" : "Tareas en curso",
                resumen:
                    filas.length === 0
                        ? "ningún agente escribiendo"
                        : `${filas.length} escribiendo · ${medio} % de avance medio${rancias.length ? ` · ${rancias.length} rancias` : ""}`,
                filas: todas,
                porcentajeMedio: medio,
                acciones: [IR_A("Ver la ramificación", "procesos")],
                vacio: "Ningún agente está escribiendo ahora mismo.",
            };
        }

        case "listas": {
            // Por qué NO las está cogiendo nadie, que es la pregunta de verdad cuando ves
            // «13 listas · 0 agentes». Son tres situaciones distintas y hasta ahora las tres
            // se veían igual: un número en rojo.
            const porQueNadieLasCoge = d.enjambrePausado
                ? "el enjambre está EN PAUSA: nadie las va a coger hasta que se reanude"
                : d.enjambreVivo
                  ? "el enjambre está vivo y las va cogiendo por tandas, según los trabajadores libres"
                  : "no hay orquestador vivo; el vigilante lo relanza solo en menos de 90 s";
            const filas: FilaMedidor[] = d.ejecutables.map((t) => ({
                id: t.id,
                titulo: t.titulo,
                estado: "lista",
                // 0 % de seis etapas: definida y sin empezar. Con la barra al lado se ve
                // de un vistazo lo que queda por delante de cada una.
                porcentaje: 0,
                porque: t.ola ? `de la ola ${t.ola} · ${porQueNadieLasCoge}` : porQueNadieLasCoge,
                acciones: accionesDeTarea("pendiente"),
            }));
            return {
                clave,
                titulo: "Listas para trabajar",
                resumen:
                    filas.length === 0
                        ? "sin trabajo ejecutable"
                        : `${filas.length} se pueden coger ya · 0 % avanzadas · ${porQueNadieLasCoge}`,
                filas,
                porcentajeMedio: 0,
                acciones: [IR_A("Ver procesos", "procesos")],
                vacio: "No queda trabajo ejecutable: todo lo definido está integrado, bloqueado o esperándote.",
            };
        }

        case "proveedores": {
            const filas: FilaMedidor[] = d.proveedores.map((p) => ({
                id: p.id,
                titulo: p.id,
                estado: p.estado,
                porque: p.motivo,
                acciones: [],
            }));
            const malos = filas.filter((f) => f.estado !== "vivo").length;
            return {
                clave,
                titulo: "Flota de proveedores",
                resumen: `${filas.length - malos} vivos · ${malos} sin cupo o caídos`,
                filas,
                acciones: [IR_A("Ver la flota", "flota")],
                vacio: "No hay pasarelas declaradas en esta máquina.",
            };
        }

        case "disco":
            return {
                clave,
                titulo: "Disco",
                resumen: d.disco ? `${d.disco.libreGb} GB libres · ${d.disco.usadoPct} % usado` : "sin dato",
                filas: [],
                acciones: [IR_A("Ver almacenamiento", "neurona")],
                vacio: "Lo primero que se puede retirar son los worktrees de tareas ya cerradas.",
            };

        case "memoria":
            return {
                clave,
                titulo: "Memoria",
                resumen: d.memoria ? `${d.memoria.libreMb} MB libres · swap ${d.memoria.swapMb} MB` : "sin dato",
                filas: [],
                acciones: [IR_A("Ver la neurona", "neurona")],
                vacio: "El swap alto con el enjambre vivo es normal; con el enjambre parado, no.",
            };

        case "ola-activa":
        default:
            return {
                clave: "ola-activa",
                titulo: "Ola activa",
                resumen: d.olaActiva || "ninguna",
                filas: [],
                acciones: [IR_A("Ver olas e informes", "olas")],
                vacio: "Ninguna ola en marcha.",
            };
    }
}

export interface ConfiguracionMedidores {
    ocultos: ClaveMedidor[];
    orden: ClaveMedidor[];
    filasMaximas: number;
}

export const ORDEN_POR_DEFECTO: ClaveMedidor[] = [
    "ola-activa",
    "en-curso",
    "agentes",
    "listas",
    "bloqueadas",
    "sin-publicar",
    "proveedores",
    "memoria",
    "disco",
];

export function configuracionPorDefecto(): ConfiguracionMedidores {
    return { ocultos: [], orden: [...ORDEN_POR_DEFECTO], filasMaximas: 40 };
}

/** Recorta el detalle a lo que cabe, diciendo cuántas quedan fuera. */
export function aplicarConfiguracion(detalle: DetalleMedidor, cfg: ConfiguracionMedidores): DetalleMedidor {
    if (detalle.filas.length <= cfg.filasMaximas) return detalle;
    const sobran = detalle.filas.length - cfg.filasMaximas;
    return {
        ...detalle,
        filas: detalle.filas.slice(0, cfg.filasMaximas),
        resumen: `${detalle.resumen} · se muestran ${cfg.filasMaximas}, hay ${sobran} más`,
    };
}

/** Los medidores visibles, en el orden pedido y sin perder ninguno por el camino. */
export function medidoresVisibles(cfg: ConfiguracionMedidores): ClaveMedidor[] {
    const pedidos = cfg.orden.filter((c) => !cfg.ocultos.includes(c));
    const olvidados = ORDEN_POR_DEFECTO.filter((c) => !cfg.orden.includes(c) && !cfg.ocultos.includes(c));
    return [...pedidos, ...olvidados];
}
