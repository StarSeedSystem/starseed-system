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
import { obtenerIdsBloqueados, type FilaContable } from "@/lib/mando/conteo-operativo";

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
    enlace?: string;
    acciones: AccionMedidor[];
    /** True si pertenece a una ola cerrada (histórica), false o undefined si es operativa. */
    historica?: boolean;
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
    /** Número de tareas en la sección histórica de olas cerradas. */
    historicas?: number;
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

// -----------------------------------------------------------------------------
// Avance que SÍ se mueve dentro de la etapa (p324A · 2026-09-16)
// -----------------------------------------------------------------------------

const ETAPAS_CAMINO = ["escribiendo", "verificando", "probando", "revisando", "visto bueno", "integrada"] as const;

/** Segundos típicos por etapa (de los topes de atasco en etapas.ts). */
const TIEMPO_TIPICO_SEG: Record<string, number> = {
    escribiendo: 25 * 60,
    verificando: 20 * 60,
    probando: 20 * 60,
    revisando: 15 * 60,
    "visto bueno": 20 * 60,
    integrada: 0,
};

export interface DatosAvance {
    etapa: string;
    segundosEnEtapa: number;
    porcentajePrevio?: number;
    /** El «ahora» entra como parámetro: la función nunca mira el reloj del sistema. */
    ahora?: number;
}

/**
 * Porcentaje combinado: base de etapa + fracción dentro de la etapa según
 * segundos transcurridos frente a un tiempo típico. Puro: sin fechas del
 * sistema, sin disco, sin red.
 */
export function avanceCombinado(datos: DatosAvance): number {
    const indice = ETAPAS_CAMINO.indexOf(datos.etapa as (typeof ETAPAS_CAMINO)[number]);
    if (indice === -1) return datos.porcentajePrevio ?? 0;
    if (datos.etapa === "integrada") return 100;

    const base = Math.round(((indice + 1) / ETAPAS_CAMINO.length) * 100);
    const siguienteBase = Math.round(((indice + 2) / ETAPAS_CAMINO.length) * 100);

    const tipico = TIEMPO_TIPICO_SEG[datos.etapa] ?? 0;
    let fraccion = 0;
    if (tipico > 0 && datos.segundosEnEtapa > 0) {
        fraccion = Math.min(datos.segundosEnEtapa / tipico, 1);
    }

    // Nunca más allá del inicio de la etapa siguiente: la fracción no supera 1.
    let rango = siguienteBase - base;
    // La última etapa antes de integrada nunca llega al 100 % antes de tiempo.
    if (datos.etapa === "visto bueno") rango = rango * 0.99;

    let porcentaje = base + Math.round(fraccion * rango);

    // Nunca retroceder.
    if (datos.porcentajePrevio !== undefined && porcentaje < datos.porcentajePrevio) {
        porcentaje = datos.porcentajePrevio;
    }
    // Nunca llegar al 100 % antes de estar integrada.
    if (datos.etapa !== "integrada" && porcentaje >= 100) porcentaje = 99;

    return porcentaje;
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

/** Coincidencia histórica por palabra entera; no basta para afirmar integración. */
/** Bytes de log escritos, en palabras. Es la prueba de que un agente esta vivo de verdad. */
export function bytesLegibles(bytes?: number): string | undefined {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return undefined;
    const n = Number(bytes);
    if (n < 1024) return `${n} B escritos`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB escritos`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB escritos`;
}

export function idEnAsuntos(id: string, asuntos: string): boolean {
    if (!id) return false;
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9])${escapado}([^A-Za-z0-9]|$)`, "m").test(asuntos);
}

/**
 * La misma marca de integración que reconoce el vigilante: el id debe ir al
 * inicio del asunto o después de `·`, y justo antes de `:`. Una mención suelta
 * en un asunto de reparto no demuestra que la tarea esté integrada.
 */
export function idIntegradoEnAsuntos(id: string, asuntos: string): boolean {
    if (!id) return false;
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patron = new RegExp(`(?:^|·\\s*)${escapado}\\s*:`);
    return asuntos.split(/\r?\n/).some((asunto) => patron.test(asunto));
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
        if (idIntegradoEnAsuntos(t.id, asuntosDeMain)) continue;
        salida.push({ id: t.id, titulo: t.titulo ?? "", ola: t.ola });
    }
    return salida;
}

export interface DatosMedidores {
    progreso: Record<string, { estado?: string; nota?: string; t?: string; modelo?: string }>;
    titulos: Record<string, string>;
    /** (2026-09-21) `quietoSegundos`, `bytesLog`, `cola` y `medio` los leia ya
     *  `leerLatidos` y la ruta los tiraba, asi que el medidor de agentes no tenia con que
     *  distinguirse del de tareas. Sin ellos no se puede decir si un agente escribe o
     *  lleva rato callado, que es la unica pregunta interesante sobre un agente. */
    latidos: {
        tarea: string;
        fase: string;
        modelo: string;
        minutos: number;
        donde: string;
        proveedor?: string;
        quietoSegundos?: number;
        bytesLog?: number;
        cola?: string;
        medio?: string;
    }[];
    commitsSinPublicar: { sha: string; asunto: string; fecha?: string }[];
    ejecutables: { id: string; titulo: string; ola?: string }[];
    /** Asuntos recientes de `main`; ausente si Git no pudo leerse. */
    asuntosDeMain?: string | null;
    proveedores: { id: string; estado: string; motivo?: string }[];
    olaActiva?: string;
    /** ¿Hay orquestador vivo? ¿Está el enjambre en pausa? Sin esto, «13 listas y 0 agentes»
     *  no se puede explicar, y un número sin explicación parece una avería aunque no lo sea. */
    enjambreVivo?: boolean;
    enjambrePausado?: boolean;
    disco?: { libreGb: number; usadoPct: number };
    memoria?: { libreMb: number; swapMb: number };
    /** Fila operativa opcional de tareas activas en colas. */
    fila?: FilaContable[];
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
export function detalleDeMedidor(
    clave: ClaveMedidor,
    datos: Partial<DatosMedidores>,
    ahora?: number,
): DetalleMedidor {
    const d = { ...vacios, ...datos };
    const estadoDe = (id: string) => d.progreso[id]?.estado;
    const titulo = (id: string) => d.titulos[id] || id;

    switch (clave) {
        case "bloqueadas": {
            const idsBloqueadosOperativos = d.fila
                ? obtenerIdsBloqueados(d.fila, d.latidos)
                : null;

            const todasBloqueadasProgreso = Object.entries(d.progreso)
                .filter(([, v]) => v?.estado === "bloqueada" || v?.estado === "bloqueante");

            const filasOperativas: FilaMedidor[] = [];
            const filasHistoricas: FilaMedidor[] = [];

            if (idsBloqueadosOperativos !== null && d.fila) {
                const idsProgresoProcesados = new Set<string>();

                for (const [id, v] of todasBloqueadasProgreso) {
                    if (idsBloqueadosOperativos.has(id)) {
                        idsProgresoProcesados.add(id);
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado: v.estado,
                            porque:
                                v.estado === "bloqueante"
                                    ? "agotó los reintentos gratuitos: necesita una persona"
                                    : porqueBloqueada(v.nota, estadoDe),
                            desde: v.t,
                            acciones: accionesDeTarea(v.estado),
                            historica: false,
                        });
                    } else if (!d.fila.some((t) => t.id === id)) {
                        filasHistoricas.push({
                            id,
                            titulo: titulo(id),
                            estado: `${v.estado} (ola cerrada)`,
                            porque:
                                v.estado === "bloqueante"
                                    ? "de ola cerrada · agotó reintentos"
                                    : `de ola cerrada · ${porqueBloqueada(v.nota, estadoDe)}`,
                            desde: v.t,
                            acciones: accionesDeTarea(v.estado),
                            historica: true,
                        });
                    }
                }

                for (const id of idsBloqueadosOperativos) {
                    if (!idsProgresoProcesados.has(id)) {
                        const tareaFila = d.fila.find((t) => t.id === id);
                        const estado = "bloqueada";
                        const porque = tareaFila?.dependenciasPendientes?.length
                            ? `espera a ${tareaFila.dependenciasPendientes.join(", ")}`
                            : "bloqueada en cola activa";
                        filasOperativas.push({
                            id,
                            titulo: titulo(id),
                            estado,
                            porque,
                            acciones: accionesDeTarea(estado),
                            historica: false,
                        });
                    }
                }
            } else {
                for (const [id, v] of todasBloqueadasProgreso) {
                    filasOperativas.push({
                        id,
                        titulo: titulo(id),
                        estado: v.estado,
                        porque:
                            v.estado === "bloqueante"
                                ? "agotó los reintentos gratuitos: necesita una persona"
                                : porqueBloqueada(v.nota, estadoDe),
                        desde: v.t,
                        acciones: accionesDeTarea(v.estado),
                        historica: false,
                    });
                }
            }

            filasOperativas.sort((a, b) => a.id.localeCompare(b.id));
            filasHistoricas.sort((a, b) => a.id.localeCompare(b.id));

            const totalOperativas = filasOperativas.length;
            const totalHistoricas = filasHistoricas.length;
            const listas = filasOperativas.filter((f) => f.porque?.includes("puede desbloquearse")).length;

            const todasFilas = [...filasOperativas, ...filasHistoricas];

            let resumenText = "";
            if (totalOperativas === 0) {
                resumenText = totalHistoricas > 0 ? `0 esperando · ${totalHistoricas} de olas cerradas` : "nada esperando";
            } else {
                resumenText = `${totalOperativas} esperando${listas > 0 ? ` · ${listas} ya pueden desbloquearse` : ""}${
                    totalHistoricas > 0 ? ` · ${totalHistoricas} de olas cerradas` : ""
                }`;
            }

            return {
                clave,
                titulo: "Bloqueadas",
                resumen: resumenText,
                filas: todasFilas,
                historicas: totalHistoricas,
                acciones: todasFilas.length
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

        // (2026-09-21) Estos DOS medidores compartian rama —`case "en-curso": case "agentes":`—
        // y por construccion enseñaban exactamente las mismas filas. Alex: «en las ventanas de
        // tareas en curso y de agentes son los mismos datos». Son dos preguntas distintas y
        // ahora se responden distinto:
        //   · Tareas en curso  -> el TRABAJO: que tarea es, en que fase va y cuanto lleva hecho.
        //   · Agentes trabajando -> el TRABAJADOR: que modelo, en que medio, desde cuando y si
        //     de verdad esta escribiendo o lleva rato callado.
        // El mismo latido alimenta las dos, pero cada una enseña su lado.
        case "agentes": {
            const filas: FilaMedidor[] = d.latidos.map((l) => {
                const proveedor = l.proveedor ?? l.modelo.split("/")[0];
                const modelo = l.modelo.split("/").slice(-1)[0];
                const quieto = l.quietoSegundos ?? null;
                // «Escribiendo» solo si ha tocado el log hace poco. Un agente que lleva cinco
                // minutos sin escribir un byte no esta trabajando, esta pensando o colgado, y
                // llamarle «escribiendo» es justo lo que impide verlo.
                const callado = quieto !== null && quieto > 180;
                return {
                    id: `${proveedor} · ${modelo}`,
                    titulo: `${proveedor} · ${modelo} en ${l.donde}`,
                    estado: callado ? "callado" : "escribiendo",
                    // El avance del agente es el de su tarea: es lo unico que ha avanzado.
                    porcentaje: avanceDe(l.fase, estadoDe(l.tarea)).porcentaje,
                    etapa: `trabaja en ${l.tarea}`,
                    quien: l.cola ? `cola ${l.cola}` : l.medio ?? l.donde,
                    desde: `${l.minutos} min`,
                    porque: callado
                        ? `sin escribir desde hace ${Math.round((quieto ?? 0) / 60)} min`
                        : bytesLegibles(l.bytesLog),
                    acciones: [],
                };
            });
            const callados = filas.filter((f) => f.estado === "callado").length;
            const medioAg = mediaDeAvance(filas);
            return {
                clave,
                titulo: "Agentes trabajando",
                resumen:
                    filas.length === 0
                        ? "ningún agente escribiendo"
                        : `${filas.length} ${filas.length === 1 ? "agente" : "agentes"}${
                              callados ? ` · ${callados} sin escribir` : ""
                          } · ${new Set(d.latidos.map((l) => l.donde)).size} medio(s)`,
                filas,
                porcentajeMedio: medioAg,
                acciones: [IR_A("Ver la ramificación", "procesos")],
                vacio: "Ningún agente está escribiendo ahora mismo.",
            };
        }

        case "en-curso": {
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
                    porcentaje: 0,
                    porque: "figura en curso pero ningún agente late por ella: estado rancio",
                    desde: v.t,
                    acciones: accionesDeTarea(v.estado),
                }));
            const todas = [...rancias, ...filas];
            const medio = mediaDeAvance(todas);
            return {
                clave,
                titulo: "Tareas en curso",
                resumen:
                    filas.length === 0
                        ? "ninguna tarea en curso"
                        : `${filas.length} en marcha · ${medio} % de avance medio${rancias.length ? ` · ${rancias.length} rancias` : ""}`,
                filas: todas,
                porcentajeMedio: medio,
                acciones: [IR_A("Ver la ramificación", "procesos")],
                vacio: "Ninguna tarea en curso ahora mismo.",
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
            const asuntosDeMain = d.asuntosDeMain;
            const asuntosDisponibles = typeof asuntosDeMain === "string";
            // Sin una lectura fiable no se adivina: ocultar trabajo válido sería
            // peor que mostrarlo y avisar con claridad de que falta comprobar Git.
            const ejecutables = asuntosDisponibles
                ? d.ejecutables.filter((t) => !idIntegradoEnAsuntos(t.id, asuntosDeMain))
                : d.ejecutables;
            const avisoGit = asuntosDisponibles
                ? ""
                : " · no se pudieron leer los asuntos de Git; no se filtró por commits";
            const filas: FilaMedidor[] = ejecutables.map((t) => ({
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
                resumen: (
                    filas.length === 0
                        ? "sin trabajo ejecutable"
                        : `${filas.length} se pueden coger ya · 0 % avanzadas · ${porQueNadieLasCoge}`
                ) + avisoGit,
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
