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
 *
 * La pastilla cuenta atascadas + las que necesitan a Alex; las esperas van en el texto de al lado.
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

export type GrupoBloqueada = "cadena" | "alex" | "atascada";

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
    /** El número de la pastilla: lo que de verdad está parado (atascadas + decisiones de Alex). */
    valor: number;
    enCadena: number;
    atascadas: number;
    alex: number;
    transformadasHoy: number;
    /** Texto corto para debajo de la pastilla. */
    pastilla: string;
    /** Frase completa para la cabecera del panel. */
    texto: string;
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

export function resumirBloqueadas(
    filas: FilaMedidor[],
    revisor: EstadoRevisorBloqueadas | null | undefined,
    ahora: number,
): { resumen: ResumenBloqueadas; filas: (FilaMedidor & { grupo: GrupoBloqueada })[] } {
    const operativas = filas.filter((f) => !f.historica);
    const conGrupo = filas.map((f) => ({ ...f, grupo: f.historica ? ("atascada" as const) : grupoDeFila(f, revisor, ahora) }));
    const enCadena = conGrupo.filter((f) => !f.historica && f.grupo === "cadena");
    const alexFilas = conGrupo.filter((f) => !f.historica && f.grupo === "alex");
    const atascadas = conGrupo.filter((f) => !f.historica && f.grupo === "atascada");
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
    const valor = atascadas.length + nAlex;
    const partes: string[] = [];
    if (atascadas.length) partes.push(`${atascadas.length} atascada${atascadas.length === 1 ? "" : "s"}`);
    if (nAlex) partes.push(`${nAlex} te necesita${nAlex === 1 ? "" : "n"}`);
    if (enCadena.length)
        partes.push(`${enCadena.length} en cadena (esperan a ${cadenas.length} raíz${cadenas.length === 1 ? "" : "es"} que avanza${cadenas.length === 1 ? "" : "n"})`);
    if (transformadas.length) partes.push(`${transformadas.length} transformada${transformadas.length === 1 ? "" : "s"} hoy`);
    const texto = partes.join(" · ") || "ninguna tarea quieta: todo avanza o está hecho";
    const pastilla = valor
        ? `${enCadena.length ? `${enCadena.length} en cadena · ` : ""}ábrelo para ver por qué`
        : enCadena.length
          ? `${enCadena.length} en cadena, avanzan solas`
          : "ninguna esperando";
    return {
        filas: conGrupo,
        resumen: {
            valor,
            enCadena: enCadena.length,
            atascadas: atascadas.length,
            alex: nAlex,
            transformadasHoy: transformadas.length,
            pastilla,
            texto,
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
