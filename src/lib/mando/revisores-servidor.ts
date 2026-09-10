/**
 * Revisores continuos por área — la parte que toca disco y modelos (solo servidor).
 *
 * Ola 301 · Tarea RV2 (2026-09-09). Por qué: RV1 dejó en `revisores-area.ts`
 * las decisiones PURAS (qué área toca, qué se le pide al revisor, cómo se
 * fusionan sus sugerencias y cómo se convierten en tarea). Aquí vive lo demás:
 * el estado en `starseed_memory_root/mando/revisores.json`, la llamada al
 * modelo del papel director y el paso de sugerencia aprobada a cola del enjambre.
 *
 * NADA ARRANCA SOLO DESDE ESTE MÓDULO: no hay `setInterval`, ni temporizadores,
 * ni efectos al importarlo. Quien dispara `barridoRevisores()` es la interfaz
 * del Mando o una tarea programada; quien aprueba una sugerencia y quien lanza
 * la cola resultante es una persona. La vigilancia deja COLA, no hechos
 * consumados: cada sugerencia nace `propuesta` y ahí se queda sola.
 *
 * Economía: un barrido mira UNA sola área (la más atrasada), nunca más. Se
 * prefiere siempre un modelo de coste cero; si el único posible es de pago se
 * comprueba `dentroDePresupuesto` ANTES de llamar y se niega con el motivo si
 * no cabe. Jamás se escriben claves ni valores de entorno en el archivo ni en
 * la respuesta: lo que venga del proveedor pasa por `redactarSecretos`.
 */

import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
    AREAS_REVISADAS,
    aTareaDeCola,
    fusionarSugerencias,
    promptRevisorArea,
    siguienteArea,
    tocaRevisar,
    type AreaRevisada,
} from "@/lib/mando/revisores-area";
import {
    costeEstimado,
    dentroDePresupuesto,
    parsearSugerencias,
    techoAstraPorDefecto,
    type SugerenciaAstra,
} from "@/lib/mando/astra";
import { estimarTokens, recortarAlPresupuesto, redactarSecretos } from "@/lib/mando/astra-contexto";
import { listarModelos, llamarModelo, type ModeloDisponible } from "@/lib/mando/modelos-disponibles";
import { raizDelProyecto } from "@/lib/mando/raiz";

/** Estado de una sugerencia. Nace `propuesta`; solo una persona la mueve. */
export type EstadoSugerencia = "propuesta" | "aprobada" | "descartada";

/** Lo que quedó de la última pasada del revisor de un área. */
export interface RevisionArea {
    area: string;
    /** Momento ISO de la última revisión (lo que alimenta `tocaRevisar`). */
    ultima: string;
    modelo: string;
    /** Coste en USD de esa pasada (0 con modelos de coste cero). */
    coste: number;
    motivo: string;
    sugerencias: SugerenciaAstra[];
}

/** El archivo `mando/revisores.json` entero, ya normalizado. */
export interface EstadoRevisores {
    vigilancia: boolean;
    /** Día (AAAA-MM-DD) al que pertenece `gastadoHoyUsd`; cambia y se reinicia. */
    dia: string;
    gastadoHoyUsd: number;
    areas: Record<string, RevisionArea>;
    estados: Record<string, EstadoSugerencia>;
}

/** Lo que devuelve un barrido: una sola área, con su cuenta y su porqué. */
export interface ResultadoBarrido {
    area: string;
    nuevas: number;
    total: number;
    coste: number;
    motivo: string;
}

/** Una tarea de cola tal y como la fabrica RV1 (misma forma, sin duplicar el tipo). */
type TareaRevision = ReturnType<typeof aTareaDeCola>;

const RAÍZ = raizDelProyecto();
const ARCHIVO = path.join(RAÍZ, "starseed_memory_root", "mando", "revisores.json");
const OLAS = path.join(RAÍZ, "starseed_memory_root", "olas");
/** Contexto por área: 40.000 caracteres ≈ 10.000 tokens (estimación de `astra-contexto`). */
const MAX_CARACTERES = 40_000;
/** Tope por archivo leído, para que un solo módulo gordo no se coma el contexto. */
const MAX_POR_ARCHIVO = 6_000;
/** Archivos que un revisor mira dentro de una carpeta (los demás son ruido). */
const EXTENSIONES = [".ts", ".tsx", ".md"];
/** Modelo de pago del papel director (Ola 294 · Astra): último recurso, nunca el primero. */
const DIRECTOR_DE_PAGO = "gpt-6-astra";

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}
function listaTexto(v: unknown): string[] {
    return Array.isArray(v) ? v.map((x) => texto(x)).filter((x) => x.length > 0) : [];
}
function numero(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Fecha corta AAAA-MM-DD: el día del gasto y el nombre de la cola de revisión. */
function fechaCorta(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Escritura atómica (`.tmp` + rename): nadie lee nunca un archivo a medias. */
async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(`${ruta}.tmp`, contenido, "utf-8");
    await rename(`${ruta}.tmp`, ruta);
}

/**
 * Lee el estado de la vigilancia. Si el archivo no existe todavía NO es un
 * error: significa que aún no se ha revisado nada, y se devuelve el estado
 * vacío. Las sugerencias del disco se normalizan con `parsearSugerencias`
 * (Ola 294) para no tener dos normalizadores del mismo formato.
 */
export async function estadoRevisores(): Promise<EstadoRevisores> {
    let crudo: unknown = null;
    try {
        crudo = JSON.parse(await readFile(ARCHIVO, "utf-8")) as unknown;
    } catch {
        return { vigilancia: false, dia: "", gastadoHoyUsd: 0, areas: {}, estados: {} };
    }
    const d = objeto(crudo);
    const areas: Record<string, RevisionArea> = {};
    for (const [id, valor] of Object.entries(objeto(d.areas))) {
        const a = objeto(valor);
        areas[id] = {
            area: id,
            ultima: texto(a.ultima),
            modelo: texto(a.modelo),
            coste: numero(a.coste),
            motivo: texto(a.motivo),
            sugerencias: parsearSugerencias(JSON.stringify(Array.isArray(a.sugerencias) ? a.sugerencias : [])),
        };
    }
    const estados: Record<string, EstadoSugerencia> = {};
    for (const [id, valor] of Object.entries(objeto(d.estados))) {
        const e = texto(valor);
        if (e === "propuesta" || e === "aprobada" || e === "descartada") estados[id] = e;
    }
    return { vigilancia: d.vigilancia === true, dia: texto(d.dia), gastadoHoyUsd: numero(d.gastadoHoyUsd), areas, estados };
}

/** Guarda el estado entero, olvidando los estados de sugerencias que ya no existen. */
async function guardarEstado(estado: EstadoRevisores): Promise<void> {
    const vivos = new Set<string>();
    for (const r of Object.values(estado.areas)) for (const s of r.sugerencias) vivos.add(s.id);
    const estados: Record<string, EstadoSugerencia> = {};
    for (const [id, e] of Object.entries(estado.estados)) if (vivos.has(id)) estados[id] = e;
    await escribirAtomico(ARCHIVO, `${JSON.stringify({ ...estado, estados }, null, 2)}\n`);
}

/** Enciende o apaga la vigilancia. Apagarla NO borra nada de lo ya sugerido. */
export async function guardarVigilancia(activa: boolean): Promise<EstadoRevisores> {
    const estado = await estadoRevisores();
    estado.vigilancia = activa === true;
    await guardarEstado(estado);
    return estado;
}

/** Sugerencias vivas: las que siguen en estado `propuesta` esperando visto bueno. */
export function sugerenciasVivas(estado: EstadoRevisores): Array<{ area: string; sugerencia: SugerenciaAstra }> {
    const vivas: Array<{ area: string; sugerencia: SugerenciaAstra }> = [];
    for (const r of Object.values(estado.areas)) {
        for (const s of r.sugerencias) {
            if ((estado.estados[s.id] ?? "propuesta") === "propuesta") vivas.push({ area: r.area, sugerencia: s });
        }
    }
    return vivas;
}

/** Última revisión de cada área, en la forma que espera `siguienteArea`. */
function ultimasPorArea(estado: EstadoRevisores): Record<string, string> {
    const ultimas: Record<string, string> = {};
    for (const [id, r] of Object.entries(estado.areas)) ultimas[id] = r.ultima;
    return ultimas;
}

/** Qué área tocaría revisar ahora mismo y por qué (null si ninguna ha vencido). */
export function areaQueToca(estado: EstadoRevisores, ahora = new Date()): { area: string; nombre: string; motivo: string } | null {
    const area = siguienteArea(AREAS_REVISADAS, ultimasPorArea(estado), ahora);
    if (!area) return null;
    const { motivo } = tocaRevisar(area, estado.areas[area.id]?.ultima ?? "", ahora);
    return { area: area.id, nombre: area.nombre, motivo };
}

/** Bloques de texto de una ruta del área: un archivo, o los de una carpeta. */
async function bloquesDeRuta(relativa: string): Promise<Array<{ ruta: string; texto: string; peso: number }>> {
    const limpia = relativa.replace(/^\.?\//, "").replace(/\/$/, "");
    // Rutas siempre relativas a `raizDelProyecto()`, nunca a `process.cwd()`
    // directo: es la regla del Mando para no arrastrar el árbol al bundle.
    const absoluta = path.join(RAÍZ, limpia);
    const bloques: Array<{ ruta: string; texto: string; peso: number }> = [];
    const añadir = async (rutaAbs: string, rutaRel: string): Promise<void> => {
        try {
            const bruto = await readFile(rutaAbs, "utf-8");
            // Redactar ANTES de medir: lo que se mide es lo que se enviará.
            const seguro = redactarSecretos(bruto);
            const recorte = seguro.length > MAX_POR_ARCHIVO ? `${seguro.slice(0, MAX_POR_ARCHIVO)}\n…` : seguro;
            if (recorte.trim().length > 0) bloques.push({ ruta: rutaRel, texto: recorte, peso: recorte.length });
        } catch {
            // Archivo ilegible o borrado entre el listado y la lectura: se salta.
        }
    };
    try {
        const info = await stat(absoluta);
        if (info.isFile()) {
            await añadir(absoluta, limpia);
            return bloques;
        }
        const entradas = (await readdir(absoluta, { withFileTypes: true }))
            .filter((e) => e.isFile() && EXTENSIONES.includes(path.extname(e.name)))
            .map((e) => e.name)
            .sort();
        // Tope de 12 archivos por carpeta: el revisor necesita una muestra
        // representativa, no el árbol entero (economía de tokens).
        for (const nombre of entradas.slice(0, 12)) await añadir(path.join(absoluta, nombre), `${limpia}/${nombre}`);
    } catch {
        // Ruta ausente: se anota fuera, con el resto de fuentes.
    }
    return bloques;
}

/** Contexto del área: sus rutas, sin secretos y recortadas al presupuesto. */
async function contextoDeArea(area: AreaRevisada): Promise<string> {
    const bloques: Array<{ ruta: string; texto: string; peso: number }> = [];
    for (const ruta of area.rutas) bloques.push(...(await bloquesDeRuta(ruta)));
    const elegidos = recortarAlPresupuesto(bloques, Math.floor(MAX_CARACTERES / 4));
    const partes: string[] = [`# Contexto del área ${area.nombre} (${area.id})`];
    if (elegidos.length === 0) partes.push("\n(Ninguna de las rutas del área tiene archivos legibles ahora mismo.)");
    for (const e of elegidos) partes.push(`\n## ${e.ruta}\n\n${e.texto}`);
    return partes.join("\n");
}

/**
 * Elige el modelo del papel director. Primero, cualquiera de COSTE CERO que no
 * esté caído ni sin clave, prefiriendo los de papel `revisor`/`general` (los que
 * auditan, no los que escriben a granel). Solo si no queda ninguno se propone el
 * de pago, y entonces quien llama TIENE que pasar por `dentroDePresupuesto`.
 * PURA: recibe el catálogo ya leído, no lo consulta.
 */
export function elegirModeloDirector(modelos: readonly ModeloDisponible[]): { id: string; gratis: boolean } {
    const sano = (m: ModeloDisponible): boolean => m.salud !== "caido" && m.salud !== "sin-clave";
    const gratis = modelos.filter((m) => m.gratis && sano(m));
    const preferido = gratis.find((m) => m.papel === "revisor" || m.papel === "general") ?? gratis[0];
    return preferido ? { id: preferido.id, gratis: true } : { id: DIRECTOR_DE_PAGO, gratis: false };
}

/** Gasto acumulado del día en curso; si el archivo es de ayer, hoy se empieza en 0. */
function gastadoHoy(estado: EstadoRevisores, ahora: Date): number {
    return estado.dia === fechaCorta(ahora) ? estado.gastadoHoyUsd : 0;
}

/**
 * Una pasada de la vigilancia: elige UNA sola área (la más atrasada), le arma
 * el contexto, llama al revisor, fusiona lo que diga con lo que ya había y lo
 * guarda. Nunca revisa dos áreas: es economía, no fuerza bruta. Todas las
 * sugerencias quedan en estado `propuesta`; ninguna se convierte en tarea aquí.
 */
export async function barridoRevisores(ahora = new Date()): Promise<ResultadoBarrido> {
    const estado = await estadoRevisores();
    const pendiente = areaQueToca(estado, ahora);
    const total = () => sugerenciasVivas(estado).length;
    if (!pendiente) {
        return { area: "", nuevas: 0, total: total(), coste: 0, motivo: "Ninguna área ha agotado su cadencia: no toca revisar nada todavía." };
    }
    const area = AREAS_REVISADAS.find((a) => a.id === pendiente.area);
    if (!area) return { area: pendiente.area, nuevas: 0, total: total(), coste: 0, motivo: `El área «${pendiente.area}» ya no está en el catálogo de revisores.` };

    const contexto = await contextoDeArea(area);
    const { system, user } = promptRevisorArea(area, contexto);
    const modelo = elegirModeloDirector(await listarModelos());
    // Salida estimada en 2.500 tokens: es el techo que se le pide al modelo.
    const coste = costeEstimado(modelo.id, estimarTokens(`${system}\n${user}`), 2_500);
    if (!modelo.gratis) {
        const permiso = dentroDePresupuesto(gastadoHoy(estado, ahora), coste, techoAstraPorDefecto());
        if (!permiso.ok) {
            return {
                area: area.id,
                nuevas: 0,
                total: total(),
                coste: 0,
                motivo: `No hay ningún revisor de coste cero disponible y el de pago (${modelo.id}) no cabe. ${permiso.motivo}`,
            };
        }
    }

    let bruto = "";
    try {
        bruto = (
            await llamarModelo(
                modelo.id,
                [
                    { rol: "system", texto: system },
                    { rol: "user", texto: user },
                ],
                { maxTokens: 2_500, timeoutMs: 120_000 },
            )
        ).texto;
    } catch (e) {
        // `redactarSecretos` también sobre el error: un proveedor puede devolver
        // la petición entera, y de ahí no puede salir jamás una clave.
        const detalle = redactarSecretos(e instanceof Error ? e.message : "el proveedor no respondió");
        return { area: area.id, nuevas: 0, total: total(), coste: 0, motivo: `El revisor de ${area.nombre} no pudo hablar con ${modelo.id}: ${detalle}` };
    }

    const previas = estado.areas[area.id]?.sugerencias ?? [];
    const conocidas = new Set(previas.map((s) => s.id));
    const fusionadas = fusionarSugerencias(previas, parsearSugerencias(bruto));
    const nuevas = fusionadas.filter((s) => !conocidas.has(s.id));
    const motivo = `${pendiente.motivo} Revisada con ${modelo.id}${modelo.gratis ? " (coste cero)" : ` (${coste.toFixed(4)} USD)`}: ${nuevas.length} sugerencias nuevas, todas en estado «propuesta».`;

    estado.areas[area.id] = { area: area.id, ultima: ahora.toISOString(), modelo: modelo.id, coste, motivo, sugerencias: fusionadas };
    for (const s of fusionadas) if (!estado.estados[s.id]) estado.estados[s.id] = "propuesta";
    if (!modelo.gratis) {
        estado.gastadoHoyUsd = gastadoHoy(estado, ahora) + coste;
        estado.dia = fechaCorta(ahora);
    }
    await guardarEstado(estado);
    return { area: area.id, nuevas: nuevas.length, total: total(), coste: modelo.gratis ? 0 : coste, motivo };
}

/** Busca una sugerencia viva por id y dice de qué área es. */
function buscarSugerencia(estado: EstadoRevisores, id: string): { area: string; sugerencia: SugerenciaAstra } | null {
    for (const r of Object.values(estado.areas)) {
        for (const s of r.sugerencias) if (s.id === id) return { area: r.area, sugerencia: s };
    }
    return null;
}

/** Lee la cola de revisión del día si ya existe (para fusionar por id, no pisarla). */
async function leerColaRevision(ruta: string): Promise<TareaRevision[]> {
    const previas: TareaRevision[] = [];
    try {
        const crudo = JSON.parse(await readFile(ruta, "utf-8")) as unknown;
        if (!Array.isArray(crudo)) return previas;
        for (const t of crudo) {
            const o = objeto(t);
            if (!texto(o.id)) continue;
            previas.push({
                id: texto(o.id),
                ola: texto(o.ola),
                titulo: texto(o.titulo),
                archivos: listaTexto(o.archivos),
                depende: listaTexto(o.depende),
                modelo: texto(o.modelo),
                prompt: texto(o.prompt),
            });
        }
    } catch {
        // Todavía no hay cola de hoy para esta área: se creará ahora.
    }
    return previas;
}

/**
 * Visto bueno humano: convierte una sugerencia en tarea del enjambre con
 * `aTareaDeCola` y la deja en `starseed_memory_root/olas/cola-revision-<area>-<fecha>.json`,
 * fusionando por id si esa cola ya existía. Devuelve la ruta y el comando,
 * pero NO lanza nada: lanzar sigue siendo decisión de una persona.
 */
export async function aprobarSugerencia(id: string): Promise<{ ok: boolean; archivo: string; comando: string; motivo: string }> {
    const estado = await estadoRevisores();
    const hallada = buscarSugerencia(estado, id);
    if (!hallada) return { ok: false, archivo: "", comando: "", motivo: `No hay ninguna sugerencia con id «${id}».` };

    const tarea = aTareaDeCola(hallada.sugerencia, `Ola 301 · revisión continua de ${hallada.area}`);
    const nombre = `cola-revision-${hallada.area}-${fechaCorta(new Date())}.json`;
    const ruta = path.join(OLAS, nombre);
    const tareas = await leerColaRevision(ruta);
    const i = tareas.findIndex((t) => t.id === tarea.id);
    if (i >= 0) tareas[i] = tarea;
    else tareas.push(tarea);
    await escribirAtomico(ruta, `${JSON.stringify(tareas, null, 2)}\n`);

    estado.estados[id] = "aprobada";
    await guardarEstado(estado);
    const relativa = path.join("starseed_memory_root", "olas", nombre);
    return {
        ok: true,
        archivo: relativa,
        comando: `python3 ~/.local/bin/starseed-enjambre.py ${relativa} --workers 1`,
        motivo: `«${tarea.titulo}» ya está en ${relativa} (${tareas.length} tareas). Lánzala cuando quieras: la vigilancia no lanza nada sola.`,
    };
}

/** Descarta una sugerencia: deja de contar como viva y no vuelve a proponerse sola. */
export async function descartarSugerencia(id: string): Promise<{ ok: boolean; motivo: string }> {
    const estado = await estadoRevisores();
    if (!buscarSugerencia(estado, id)) return { ok: false, motivo: `No hay ninguna sugerencia con id «${id}».` };
    estado.estados[id] = "descartada";
    await guardarEstado(estado);
    return { ok: true, motivo: `Sugerencia «${id}» descartada; sigue en el archivo del área como memoria de lo ya visto.` };
}
