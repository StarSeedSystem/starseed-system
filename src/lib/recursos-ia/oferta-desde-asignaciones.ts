/**
 * OfertaNeurona de esta neurona, construida a partir de SU inventario y sus asignaciones de
 * Recursos de IA (Ola 1023R · RIA1023F). SOP `architecture/recursos-ia-neurona.md`: §2
 * (topología «servidor-propio», puerto 4480) y §3 (reglas duras de privacidad).
 *
 * PURA: nada de red, disco ni procesos; el instante viene del inventario o de `ahora`.
 * El tipo devuelto es `OfertaNeurona` de `src/lib/recursos/oferta.ts`, tal cual. Codificación:
 * - `computo`: sumas de los procesadores DISPONIBLES de esta neurona; `motores` = sus runtimes.
 * - `almacen`: espacio libre de sus almacenes disponibles (GB → MB) y sus ids como volúmenes.
 * - `apps`: los modelos que sirve, como `{ id: modeloId, version: procesadorId }`. Cuando presta
 *   su servidor propio de IA añade `{ id: "servidor-ia", version: "4480" }`.
 * - `presta.cuenta|grupos|publico`: el alcance de su topología «servidor-propio». Alcance privado
 *   → solo la cuenta; grupo/comunidad → su id en `grupos`; `publico` SOLO con visibilidad pública
 *   a propósito: nada privado sale con alcance público.
 */
import { VIA_REFERENCIA, type EstadoRecursosIa, type InventarioRecursos } from "./tipos";
import type { OfertaNeurona } from "../recursos/oferta";

export const PUERTO_SERVIDOR_IA = 4480;

/** Alcance con el que esta neurona presta sus recursos. */
export type AlcancePresta = { cuenta: boolean; grupos: string[]; publico: boolean };

/** La neurona del inventario de la que sale la oferta (la «esta neurona»). */
function neuronaLocal(inventario: InventarioRecursos) {
    return inventario.neuronas.find((n) => n.id === inventario.estaNeuronaId);
}

/**
 * ¿Esta neurona es el servidor propio de su cuenta? Solo cuenta la topología
 * «servidor-propio» que la nombre explícitamente en `servidorNeuronaId`. PURA.
 */
export function esServidorPropio(estado: EstadoRecursosIa, neuronaId: string): boolean {
    return Object.values(estado.topologias).some(
        (c) => c.topologia === "servidor-propio" && c.servidorNeuronaId === neuronaId,
    );
}

/** Suma de gigas de una medida opcional (no numérica, infinita o ≤ 0 → 0). PURA. */
function gigas(x: number | undefined): number {
    return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Alcance de la prestación del servidor propio de esta neurona: privado → solo la cuenta;
 * grupo/comunidad → su id en `grupos`; `publico` solo con visibilidad pública a propósito.
 * Sin servidor propio no presta a nadie (cuenta false, sin grupos, nunca público). PURA.
 */
export function alcancePresta(estado: EstadoRecursosIa, neuronaId: string): AlcancePresta {
    const out: AlcancePresta = { cuenta: false, grupos: [], publico: false };
    if (!esServidorPropio(estado, neuronaId)) return out;
    for (const c of Object.values(estado.topologias)) {
        if (c.topologia !== "servidor-propio" || c.servidorNeuronaId !== neuronaId) continue;
        const { tipo, id, visibilidad } = c.alcance;
        if (tipo === "grupo" || tipo === "comunidad") {
            if (!out.grupos.includes(id)) out.grupos.push(id);
        } else {
            out.cuenta = true;
        }
        if (visibilidad === "publica") out.publico = true;
    }
    return out;
}

/** Ids de los procesadores y almacenes disponibles de ESTA neurona. PURA. */
export function idsLocales(inventario: InventarioRecursos): { procesadores: Set<string>; almacenes: Set<string> } {
    const n = neuronaLocal(inventario);
    return {
        procesadores: new Set((n?.procesadores ?? []).filter((p) => p.disponible).map((p) => p.id)),
        almacenes: new Set((n?.almacenes ?? []).filter((m) => m.disponible).map((m) => m.id)),
    };
}

/**
 * Qué modelos sirve esta neurona y por qué procesador: los que su inventario dice INSTALADOS
 * (procesador o almacén de esta neurona; sin destino conocido, la neurona que lo inventaría) y
 * los ASIGNADOS por el plan de Recursos de IA a un procesador de esta neurona. La asignación
 * puede corregir dónde se sirve lo ya instalado. PURA.
 */
export function modelosServidos(inventario: InventarioRecursos, estado: EstadoRecursosIa): OfertaNeurona["apps"] {
    const { procesadores, almacenes } = idsLocales(inventario);
    const out = new Map<string, string>();
    for (const m of inventario.modelosInstalados ?? []) {
        const enEsta =
            (m.procesadorId ? procesadores.has(m.procesadorId) : false) ||
            (m.almacenId ? almacenes.has(m.almacenId) : false) ||
            (!m.procesadorId && !m.almacenId);
        if (enEsta) out.set(m.modeloId, m.procesadorId ?? m.almacenId ?? "auto");
    }
    for (const a of Object.values(estado.asignaciones)) {
        if (a.elemento.tipo !== "modelo") continue;
        const p = a.procesaEn;
        if (p && p !== "auto" && procesadores.has(p)) out.set(a.elemento.id, p);
    }
    return [...out].map(([id, version]) => ({ id, version }));
}

/**
 * La oferta completa de esta neurona. Sin las piezas del inventario (neurona no listada) sale con
 * cómputo y almacén en ceros y con lo que las asignaciones y la topología sí dicen. PURA.
 */
export function ofertaDesdeAsignaciones(
    inventario: InventarioRecursos,
    estado: EstadoRecursosIa,
    ahora?: Date,
): OfertaNeurona {
    const neurona = neuronaLocal(inventario);
    const presta = alcancePresta(estado, inventario.estaNeuronaId);
    const prestendo = presta.cuenta || presta.grupos.length > 0 || presta.publico;
    const procesadores = (neurona?.procesadores ?? []).filter((p) => p.disponible);
    const almacenes = (neurona?.almacenes ?? []).filter((m) => m.disponible);
    const apps = modelosServidos(inventario, estado);
    if (prestendo) apps.push({ id: "servidor-ia", version: String(PUERTO_SERVIDOR_IA) });
    const ramLibreMb = Math.round(procesadores.reduce((s, p) => s + gigas(p.ramLibreGb), 0) * 1024);
    const vramMb = procesadores.reduce((s, p) => s + gigas(p.vramGb), 0);
    const t = ahora ? ahora.getTime() : Date.parse(inventario.generado) || 0;
    return {
        nodoId: inventario.estaNeuronaId,
        cuentaId: "",
        medio: neurona?.tipo ?? "neurona",
        computo: {
            nucleos: procesadores.reduce((s, p) => s + gigas(p.nucleos), 0),
            ramLibreMb,
            gpu: procesadores.some((p) => p.tipo === "gpu" || p.tipo === "webgpu" || gigas(p.vramGb) > 0),
            vramMb: vramMb > 0 ? Math.round(vramMb * 1024) : undefined,
            motores: [...new Set(procesadores.flatMap((p) => p.runtimes))],
        },
        almacen: {
            prestaMb: Math.round(almacenes.reduce((s, m) => s + gigas(m.libreGb), 0) * 1024),
            volumenes: almacenes.map((m) => m.id),
        },
        apps,
        enlaces: { latenciaMs: Object.fromEntries((neurona?.vias ?? []).map((v) => [v, VIA_REFERENCIA[v].latenciaMs])) },
        energia: { enUso: false },
        presta: {
            ...presta,
            topes: {
                cpuPct: 100,
                ramMb: ramLibreMb,
                discoMb: Math.round(almacenes.reduce((s, m) => s + gigas(m.libreGb), 0) * 1024),
                soloCargando: false,
            },
        },
        t,
    };
}
