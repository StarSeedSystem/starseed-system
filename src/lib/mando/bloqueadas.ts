/**
 * «Bloqueadas» sin mezclar esperas normales con atascos de verdad (OPB1011, 2026-10-10).
 *
 * Alex: «hay demasiadas tareas bloqueadas en MetaGenesis». Medido ese día: el medidor decía 40 y
 * las 40 eran ESPERAS de dos cadenas (35 de la Protomolécula detrás de cinco raíces). Un número así
 * no dice nada: lo que hay que mirar es si las raíces avanzan, qué se transformó y qué necesita una
 * decisión suya. Este módulo PURO (va al navegador: nada de `node:*`) reparte las filas en:
 *
 *   · «En cadena»       — esperan a X, que va por Y. Se mueven solas cuando X llega a main.
 *   · «Transformadas hoy» — lo que el revisor automático hizo y por qué (scripts/puente/revisor_bloqueadas.py).
 *   · «Necesitan a Alex» — UNA decisión con sus botones (rehacer / descartar).
 *   · «Atascadas»       — lo que nadie ha movido todavía: lo único que de verdad es un problema.
 *   · «Sin resolver»    — (2026-10-20) fallidas y rechazadas de los últimos 3 días que nadie ha
 *                         retomado: la misma regla que el medidor «Fallidas».
 *
 * (2026-10-20) Alex, varias veces: «es diferente la info de Bloqueadas y rechazadas en Ramificación
 * que el medidor del pulso». Eran dos cálculos: la sección contaba lo que tenía rama en las 4 olas
 * cargadas (2 rechazadas viejas) y el medidor toda espera (178). Ahora hay UN cálculo: la pastilla,
 * el medidor y la sección de Ramificación enseñan las mismas filas (atascadas + te necesitan + sin
 * resolver) y las esperas de una cadena van en su propio medidor, «En cadena».
 */

import type { FilaMedidor } from "./medidores";

/** Una cadena: N tareas que esperan a la misma raíz. */
export interface CadenaRevisor {
    raiz: string;
    titulo_raiz?: string;
    va_por?: string;
    esperan: string[];
    n?: number;
}

export interface TransformadaRevisor {
    t?: string;
    tid?: string;
    accion?: string;
    motivo?: string;
    clase?: string;
    resultado?: string;
    jev?: string;
    medio?: string;
}

export interface PreguntaAlex {
    pregunta?: string;
    opciones?: string[];
    motivo?: string;
    desde?: string;
    titulo?: string;
}

/** Lo que escribe el revisor en `starseed_memory_root/olas/revisor-bloqueadas.json`. */
export interface EstadoRevisorBloqueadas {
    t?: string;
    medio?: string;
    cola_viva?: string | null;
    cadenas?: CadenaRevisor[];
    en_cadena?: Record<string, { espera_a?: string[]; va_por?: string; raiz?: string; raiz_va_por?: string }>;
    transformadas_hoy?: TransformadaRevisor[];
    necesitan_alex?: Record<string, PreguntaAlex>;
    cuentas?: Record<string, number>;
    resumen?: string;
}

/** «sin-resolver»: fallida o rechazada reciente que nadie ha retomado (no espera a otra tarea). */
export type GrupoBloqueada = "cadena" | "alex" | "atascada" | "sin-resolver";

/** Una foto del revisor más vieja que esto ya no describe el presente. */
export const REVISOR_FRESCO_MS = 15 * 60 * 1000;

export function revisorFresco(revisor: EstadoRevisorBloqueadas | null | undefined, ahora: number): boolean {
    if (!revisor?.t) return false;
    const t = Date.parse(revisor.t);
    return Number.isFinite(t) && ahora - t < REVISOR_FRESCO_MS && ahora - t > -REVISOR_FRESCO_MS;
}

/** «espera a 2 tarea(s) que siguen vivas» o el porqué de `fichaDeBloqueada` para una espera viva. */
const ESPERA_VIVA = /(siguen vivas|espera normal|esperando a que se integre|en cola|en curso)/i;

/**
 * El grupo de una fila de «Bloqueadas». Manda lo que sabe el revisor (si su foto es fresca); si
 * no, se deduce de la propia fila: una espera viva es cadena, «sin salida» o «bloqueante» es atasco.
 */
export function grupoDeFila(
    fila: Pick<FilaMedidor, "id" | "estado" | "porque" | "historica">,
    revisor: EstadoRevisorBloqueadas | null | undefined,
    ahora: number,
): GrupoBloqueada {
    if (revisor?.necesitan_alex?.[fila.id]) return "alex";
    const fresco = revisorFresco(revisor, ahora);
    if (fresco && revisor?.en_cadena?.[fila.id]) return "cadena";
    const estado = String(fila.estado ?? "");
    if (/sin salida|bloqueante/i.test(estado)) return "atascada";
    if (estado.startsWith("bloqueada") && ESPERA_VIVA.test(String(fila.porque ?? ""))) return "cadena";
    return "atascada";
}

export interface ResumenBloqueadas {
    /** El número de la pastilla y de Ramificación: atascadas + decisiones de Alex + sin resolver. */
    valor: number;
    enCadena: number;
    atascadas: number;
    alex: number;
    /** (2026-10-20) Fallidas y rechazadas de 3 días sin resolver, y cuántas ya tienen quién las rehaga. */
    sinResolver: number;
    sinResolverEnMarcha: number;
    transformadasHoy: number;
    /** Texto corto para debajo de la pastilla. */
    pastilla: string;
    /** Frase completa para la cabecera del panel (solo lo que está parado). */
    texto: string;
    /** Frase del medidor «En cadena»: «N esperan a M tareas que avanzan · se desbloquean solas». */
    textoCadena: string;
    cadenas: CadenaRevisor[];
    transformadas: TransformadaRevisor[];
    preguntas: (PreguntaAlex & { id: string })[];
    /** ¿La foto del revisor es de los últimos 15 min? Si no, se dice. */
    revisorAlDia: boolean;
    revisorDesde?: string;
    revisorMedio?: string;
}

function hoyLocal(ahora: number): string {
    const d = new Date(ahora);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Cadenas a partir de las filas cuando el revisor no tiene foto fresca: agrupa por la primera
 *  dependencia que la ficha nombra («Espera a» → id). */
function cadenasDeFilas(filas: FilaMedidor[]): CadenaRevisor[] {
    const grupos = new Map<string, string[]>();
    for (const f of filas) {
        const dato = f.ficha?.find((x) => /espera a/i.test(x.etiqueta));
        const raiz = (dato?.valor ?? "").split(/[\s,·(]/)[0] || "?";
        grupos.set(raiz, [...(grupos.get(raiz) ?? []), f.id]);
    }
    return [...grupos.entries()]
        .map(([raiz, esperan]) => ({ raiz, esperan: esperan.sort(), n: esperan.length }))
        .sort((a, b) => (b.n ?? 0) - (a.n ?? 0) || a.raiz.localeCompare(b.raiz));
}

/** ¿La fila sin resolver ya tiene quién la rehaga (una sucesora viva o la escalera del director)? */
export function enReparacion(f: Pick<FilaMedidor, "porque">): boolean {
    return /^la rehace |escalera/.test(String(f.porque ?? ""));
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Reparte las filas en grupos y cuenta. `sinResolver` son las fallidas y rechazadas recientes que
 * nadie ha retomado (`filasSinResolver` en `medidores.ts`); una que ya esté entre las filas de
 * espera NO se cuenta dos veces: manda la fila de espera.
 */
export function resumirBloqueadas(
    filas: FilaMedidor[],
    revisor: EstadoRevisorBloqueadas | null | undefined,
    ahora: number,
    sinResolver: FilaMedidor[] = [],
): { resumen: ResumenBloqueadas; filas: (FilaMedidor & { grupo: GrupoBloqueada })[] } {
    const operativas = filas.filter((f) => !f.historica);
    const vistas = new Set(filas.map((f) => f.id));
    const extra = sinResolver.filter((f) => {
        if (vistas.has(f.id)) return false;
        vistas.add(f.id);
        return true;
    });
    // Una fallida por la que el revisor ya pregunta a Alex cuenta como «te necesita», no dos veces.
    const conGrupo: (FilaMedidor & { grupo: GrupoBloqueada })[] = [
        ...filas.map((f) => ({ ...f, grupo: f.historica ? ("atascada" as const) : grupoDeFila(f, revisor, ahora) })),
        ...extra.map((f) => ({
            ...f,
            historica: false,
            grupo: revisor?.necesitan_alex?.[f.id] ? ("alex" as const) : ("sin-resolver" as const),
        })),
    ];
    const enCadena = conGrupo.filter((f) => !f.historica && f.grupo === "cadena");
    const alexFilas = conGrupo.filter((f) => !f.historica && f.grupo === "alex");
    const atascadas = conGrupo.filter((f) => !f.historica && f.grupo === "atascada");
    const noResueltas = conGrupo.filter((f) => f.grupo === "sin-resolver");
    const enMarcha = noResueltas.filter(enReparacion).length;
    const fresco = revisorFresco(revisor, ahora);
    const hoy = hoyLocal(ahora);
    const transformadas = (revisor?.transformadas_hoy ?? [])
        .filter((r) => String(r.t ?? "").startsWith(hoy) && r.accion !== "priorizar" && r.accion !== "en_cadena")
        .slice()
        .reverse();
    const preguntas = Object.entries(revisor?.necesitan_alex ?? {}).map(([id, p]) => ({ id, ...p }));
    const idsAlex = new Set([...alexFilas.map((f) => f.id), ...preguntas.map((p) => p.id)]);
    const cadenas =
        fresco && revisor?.cadenas?.length
            ? revisor.cadenas.filter((c) => c.esperan?.some((id) => enCadena.some((f) => f.id === id)) || !operativas.length)
            : cadenasDeFilas(enCadena);
    const nAlex = idsAlex.size;
    const valor = atascadas.length + nAlex + noResueltas.length;
    const partes: string[] = [];
    if (atascadas.length) partes.push(plural(atascadas.length, "atascada", "atascadas"));
    if (nAlex) partes.push(plural(nAlex, "te necesita", "te necesitan"));
    if (noResueltas.length)
        partes.push(
            `${plural(noResueltas.length, "fallida o rechazada sin resolver", "fallidas o rechazadas sin resolver")}${
                enMarcha ? ` (${enMarcha} ya con quién la rehaga)` : ""
            }`,
        );
    // El primer número del texto es el de la pastilla: lo leen así MetaGenesis y el vigía
    // (`nodo_metagenesis_logica._numero`). Con más de un tipo de problema va delante el total.
    if (partes.length > 1) partes[0] = `${valor} parada${valor === 1 ? "" : "s"}: ${partes[0]}`;
    if (transformadas.length) partes.push(plural(transformadas.length, "transformada hoy", "transformadas hoy"));
    const raices = plural(cadenas.length, "tarea que avanza", "tareas que avanzan");
    const textoCadena = enCadena.length
        ? `${enCadena.length} ${enCadena.length === 1 ? "espera" : "esperan"} a ${raices} · ${
              enCadena.length === 1 ? "se desbloquea sola" : "se desbloquean solas"
          } cuando su dependencia llega a main`
        : "ninguna tarea espera a otra";
    const texto =
        (valor ? partes.join(" · ") : ["nada parado", ...partes].join(" · ")) +
        (enCadena.length ? ` · ${enCadena.length} en cadena, en su propio medidor` : "");
    const cortas: string[] = [];
    if (atascadas.length) cortas.push(plural(atascadas.length, "atascada", "atascadas"));
    if (nAlex) cortas.push(plural(nAlex, "te necesita", "te necesitan"));
    if (noResueltas.length) cortas.push(`${noResueltas.length} sin resolver`);
    const pastilla = valor ? `${cortas.join(" · ")} · ábrelo para ver por qué` : "nada parado";
    return {
        filas: conGrupo,
        resumen: {
            valor,
            enCadena: enCadena.length,
            atascadas: atascadas.length,
            alex: nAlex,
            sinResolver: noResueltas.length,
            sinResolverEnMarcha: enMarcha,
            transformadasHoy: transformadas.length,
            pastilla,
            texto,
            textoCadena,
            cadenas,
            transformadas,
            preguntas,
            revisorAlDia: fresco,
            revisorDesde: revisor?.t,
            revisorMedio: revisor?.medio,
        },
    };
}

/** Las acciones del revisor, dichas para una persona. */
export const NOMBRE_ACCION: Record<string, string> = {
    ya_hecha: "ya estaba hecha",
    fusionar: "fusionada",
    relajar: "dependencia soltada",
    trasladar: "enlistada",
    reintentar: "reintentada sin gastar intento",
    reintegrar: "vuelve a integrarse",
    reescribir: "reescrita con el contexto de hoy",
    reasignar: "reasignada",
    dividir: "dividida",
    ceder: "cede a su sucesora",
    reabrir: "vuelta a la tanda",
    instalar_dependencias: "dependencias instaladas",
    pedir_a_alex: "te pregunta",
};

/** Quién es la fila de «Transformadas hoy»: una tarea o, sin id, el entorno (p. ej. npm). */
export function sujetoDeTransformada(x: Pick<TransformadaRevisor, "tid" | "accion">): string {
    const tid = String(x.tid ?? "").trim();
    if (tid) return tid;
    return x.accion === "priorizar" ? "la tanda" : "el entorno";
}

export interface CausaBloqueada {
    clave: string;
    titulo: string;
    filas: FilaMedidor[];
    /** La acción automática que ya la está tratando, si la hay. */
    accion?: string;
}

/** La causa de una fila, agrupable aunque cambien ids o cifras. La clave sirve de id. */
export function causaDeFila(f: Pick<FilaMedidor, "estado" | "porque">): { clave: string; titulo: string } {
    const estado = String(f.estado ?? "").trim();
    const bruto = String(f.porque ?? "").replace(/\s+/g, " ").trim();
    const sinCausa = estado.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "sin-estado";
    if (!bruto) return { clave: `sin-causa-${sinCausa}`, titulo: estado ? `${estado}: sin causa anotada` : "Causa sin anotar" };
    const reglas: Array<[RegExp, string, string]> = [
        [/^la rehace\b/i, "reparacion-en-marcha", "Ya con una reparación automática en marcha"],
        [/^la escalera del director\b/i, "escalera-director", "La escalera del director la está reintentando"],
        [/no existen?|NO EXISTE/i, "dependencia-fantasma", "Espera a tareas que no existen"],
        [/no se van? a integrar/i, "dependencia-muerta", "Espera a tareas que no se van a integrar solas"],
        [/necesita una persona/i, "necesita-persona", "Necesita una persona"],
        [/no toc[oó]|sin cambios|no cambi[oó]/i, "sin-cambios", "El intento no tocó sus archivos"],
    ];
    for (const [patron, clave, titulo] of reglas) if (patron.test(bruto)) return { clave, titulo };
    const titulo = bruto.split(/(?:\s·|\s—|:\s)/)[0]?.trim() || bruto;
    return { clave: titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "causa", titulo };
}

/** La reparación que ya trata una fila: sucesora, escalera o acción del revisor. */
export function accionAutomaticaDeFila(
    f: Pick<FilaMedidor, "id" | "porque" | "ficha">,
    transformadas: readonly TransformadaRevisor[] = [],
): string | null {
    const porque = String(f.porque ?? "").trim();
    const rehace = /^la rehace\s+([^\s(]+)(?:\s*\(([^)]+)\))?/i.exec(porque);
    if (rehace) return `La rehace ${rehace[1]}${rehace[2] ? ` (${rehace[2]})` : ""}`;
    const escalera = /^la escalera del director\b[^·—]*/i.exec(porque);
    if (escalera) return escalera[0].trim();
    const accion = transformadas.find((x) => x.tid === f.id && x.accion)?.accion;
    if (accion) return `El revisor automático: ${NOMBRE_ACCION[accion] ?? accion}`;
    return f.ficha?.find((d) => /repar|automátic|revisor|sucesor/i.test(d.etiqueta))?.valor?.trim() || null;
}

/** Agrupa las filas por causa, de la que más tareas tiene a la que menos. */
export function agruparPorCausa(
    filas: readonly FilaMedidor[],
    transformadas: readonly TransformadaRevisor[] = [],
): CausaBloqueada[] {
    const mapa = new Map<string, CausaBloqueada>();
    for (const fila of filas) {
        const { clave, titulo } = causaDeFila(fila);
        const grupo = mapa.get(clave);
        if (grupo) grupo.filas.push(fila);
        else mapa.set(clave, { clave, titulo, filas: [fila] });
    }
    const grupos = [...mapa.values()];
    for (const grupo of grupos) {
        const acciones = [...new Set(grupo.filas.map((f) => accionAutomaticaDeFila(f, transformadas)).filter((a): a is string => Boolean(a)))];
        grupo.accion = acciones.length ? `${acciones.slice(0, 2).join(" · ")}${acciones.length > 2 ? ` · y ${acciones.length - 2} más` : ""}` : undefined;
    }
    return grupos.sort((a, b) => b.filas.length - a.filas.length || a.titulo.localeCompare(b.titulo));
}

/** Opciones legales del botón «Necesitan a Alex». Cualquier otra cosa no viaja al servidor. */
export const OPCIONES_ALEX = ["rehacer", "descartar"] as const;
export type OpcionAlex = (typeof OPCIONES_ALEX)[number];

export function esOpcionAlex(x: unknown): x is OpcionAlex {
    return typeof x === "string" && (OPCIONES_ALEX as readonly string[]).includes(x);
}

/** Un id de tarea que se puede pasar a un proceso sin riesgo. */
export function idDeTareaValido(id: unknown): id is string {
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}
