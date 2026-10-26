/** Enrutado de la IA por capacidad — `destinoDeIA` (Ola 1023R · RIA1023C). PURA: sin `node:*`, sin `fetch`, sin reloj ni disco. SOP §2 y §3: la antena solo lleva mensajes y decisiones, nunca pesos. */
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";
import { NOMBRE_CAPACIDAD, type Asignacion, type Capacidad, type InventarioRecursos, type MedioAlmacen, type NeuronaRecursos, type PlanRecursos, type Procesador, type Via } from "./tipos";

/** A qué neurona/servidor va una capacidad y con qué URL HTTP se le habla (null = no hay URL). */
export interface DestinoIA { via: Via; neuronaId: string; baseUrl: string | null; motivo: string }

type Fuente = { neurona?: NeuronaRecursos; procesador?: Procesador; almacen?: MedioAlmacen };
const CAMPOS_HOST = ["host", "hostname", "maquina", "endpoint", "url"] as const;
const r = (via: Via, neuronaId: string, baseUrl: string | null, motivo: string): DestinoIA => ({ via, neuronaId, baseUrl, motivo });

/** Un host resoluble: nombre con dominio, `localhost` o una IP (v4/v6). Sin espacios ni rutas. */
const esHost = (s: string): boolean => s !== "" && s.length <= 253 && !/\s/.test(s) && /^[a-z0-9._:[\]-]+$/i.test(s) && (s.includes(".") || s.toLowerCase() === "localhost" || /^\[?[0-9a-f]*:[0-9a-f:]+\]?$/i.test(s));

/** Saca el host de una URL, de un `host:puerto` o de un nombre; nada de rutas ni credenciales. */
function hostDe(x: unknown): string | null {
    if (typeof x !== "string" || !x.trim()) return null;
    const s = x.trim();
    if (/^https?:\/\//i.test(s)) {
        try { const h = new URL(s).hostname.replace(/^\[|\]$/g, ""); return esHost(h) ? h : null; } catch { return null; }
    }
    const sinRuta = s.replace(/\/.*$/, "");
    const h = /^[^:]+:\d+$/.test(sinRuta) ? sinRuta.replace(/:\d+$/, "") : sinRuta;
    return esHost(h) ? h : null;
}

/** Host de la neurona o servidor: sus campos de host, la ruta de sus almacenes y, si no, su nombre/id. */
function hostDeFuente(f: Fuente): string | null {
    for (const x of [f.neurona, f.procesador]) {
        const reg = x as Record<string, unknown> | undefined;
        for (const campo of CAMPOS_HOST) { const h = hostDe(reg?.[campo]); if (h) return h; }
    }
    for (const a of [...(f.neurona?.almacenes ?? []), ...(f.almacen ? [f.almacen] : [])]) { const h = hostDe(a.ruta); if (h) return h; }
    for (const x of [f.neurona?.nombre, f.procesador?.nombre, f.neurona?.id, f.procesador?.id]) { const h = hostDe(x); if (h) return h; }
    return null;
}

const urlDe = (f: Fuente): string | null => { const host = hostDeFuente(f); return host ? `http://${host}:${PUERTO_SERVIDOR_IA}/v1` : null; };

/** Mejor vía permitida: la preferida del plan que la neurona publica. La antena solo para decisiones. */
function viaDe(plan: PlanRecursos, capacidad: Capacidad, local: boolean, fuentes: Fuente[]): { via: Via; alcanzable: boolean } {
    if (local) return { via: "local", alcanzable: true };
    const publicadas = new Set<Via>();
    for (const f of fuentes) { for (const v of f.neurona?.vias ?? []) publicadas.add(v); if (f.procesador) publicadas.add(f.procesador.via); if (f.almacen) publicadas.add(f.almacen.via); }
    const legales = [...publicadas].filter((v) => capacidad === "decision" || v !== "antena");
    const pref = plan.topologia.vias.filter((v) => capacidad === "decision" || v !== "antena");
    const via = pref.find((v) => legales.includes(v)) ?? legales[0] ?? pref[0] ?? "malla-local";
    return { via, alcanzable: legales.includes(via) };
}

const procesadoresDe = (inv: InventarioRecursos) => [...inv.neuronas.flatMap((n) => n.procesadores), ...inv.procesadoresSueltos];
const almacenesDe = (inv: InventarioRecursos) => [...inv.neuronas.flatMap((n) => n.almacenes), ...inv.almacenesSueltos];
const neuronaDe = (inv: InventarioRecursos, id?: string) => (id ? inv.neuronas.find((n) => n.id === id) : undefined);

/** Neurona a la que la topología fragmentada asigna ESTA capacidad: la asignación manda sobre el plan. */
function objetivoFragmentado(plan: PlanRecursos, asignaciones: Record<string, Asignacion>, inv: InventarioRecursos, capacidad: Capacidad): { neuronaId: string; procesador?: Procesador } {
    const fino = plan.topologia.porCapacidad?.[capacidad];
    const asignada = fino?.modeloId ? asignaciones[`modelo:${fino.modeloId}`] : undefined;
    const ids = [asignada?.procesaEn, fino?.procesaEn].filter((x): x is string => !!x && x !== "auto");
    for (const id of ids) {
        const p = procesadoresDe(inv).find((x) => x.id === id);
        if (p) return { neuronaId: p.neuronaId, procesador: p };
        if (neuronaDe(inv, id)) return { neuronaId: id };
    }
    const sug = plan.sugerencias.find((s) => s.capacidad === capacidad)?.procesador;
    return { neuronaId: sug?.neuronaId ?? inv.estaNeuronaId, ...(sug ? { procesador: sug } : {}) };
}

/** A qué servidor de IA va cada capacidad según la topología del plan. PURA. */
export function destinoDeIA(plan: PlanRecursos, asignaciones: Record<string, Asignacion>, inventario: InventarioRecursos, capacidad: Capacidad): DestinoIA {
    const top = plan.topologia;
    const esta = inventario.estaNeuronaId;
    const nombre = NOMBRE_CAPACIDAD[capacidad];
    if (top.topologia === "cada-neurona") return r("local", esta, null, `«${nombre}» se procesa en esta neurona con sus propios modelos (cada-neurona).`);
    if (top.topologia === "servidor-propio") {
        const id = top.servidorNeuronaId ?? esta;
        const n = neuronaDe(inventario, id);
        if (!n) return r("malla-local", id, null, `La neurona servidor «${id}» no está en el inventario: no hay a quién pedir «${nombre}».`);
        if (!n.online) return r("malla-local", n.id, null, `«${n.nombre}» no está online: no se le puede pedir «${nombre}» ahora.`);
        const { via, alcanzable } = viaDe(plan, capacidad, n.id === esta, [{ neurona: n }]);
        const baseUrl = !alcanzable || via === "antena" ? null : urlDe({ neurona: n });
        return r(via, n.id, baseUrl, baseUrl ? `«${nombre}» va al servidor propio de «${n.nombre}» por ${via}.` : `«${n.nombre}» no publica un host usable: no se puede formar la URL de su servidor de IA (puerto ${PUERTO_SERVIDOR_IA}).`);
    }
    if (top.topologia === "almacen-externo") {
        const medio = almacenesDe(inventario).find((a) => a.id === top.almacenExternoId);
        if (!medio) return r("local", esta, null, `El almacén externo «${top.almacenExternoId ?? "sin id"}» no está en el inventario; «${nombre}» se queda en esta neurona.`);
        const duena = neuronaDe(inventario, medio.neuronaId);
        const id = medio.neuronaId ?? esta;
        const local = id === esta || duena?.esEsta === true;
        const { via, alcanzable } = viaDe(plan, capacidad, local, [{ neurona: duena, almacen: medio }]);
        const baseUrl = local || !alcanzable || via === "antena" ? null : urlDe({ neurona: duena, almacen: medio });
        const motivo = local ? `Los modelos de «${nombre}» viven en «${medio.etiqueta}» y procesa esta neurona.` : baseUrl ? `«${nombre}» se procesa en «${duena?.nombre ?? id}», donde está conectado «${medio.etiqueta}», por ${via}.` : `«${medio.etiqueta}» está en «${duena?.nombre ?? id}», pero no se conoce su host o no hay vía válida para «${nombre}».`;
        return r(via, id, baseUrl, motivo);
    }
    if (top.topologia === "fragmentada") {
        const obj = objetivoFragmentado(plan, asignaciones, inventario, capacidad);
        const n = neuronaDe(inventario, obj.neuronaId);
        const local = obj.neuronaId === esta || n?.esEsta === true;
        const { via, alcanzable } = viaDe(plan, capacidad, local, [{ neurona: n, procesador: obj.procesador }]);
        const baseUrl = local || !alcanzable || via === "antena" ? null : urlDe({ neurona: n, procesador: obj.procesador });
        const destino = n?.nombre ?? obj.neuronaId;
        const motivo = local ? `«${nombre}» está asignada a esta neurona (fragmentada).` : baseUrl ? `«${nombre}» está asignada a «${destino}» por ${via}.` : `«${nombre}» está asignada a «${destino}», pero no se conoce su host o no hay vía válida.`;
        return r(via, obj.neuronaId, baseUrl, motivo);
    }
    const sug = plan.sugerencias.find((s) => s.capacidad === capacidad)?.procesador;
    const proc = sug ?? inventario.procesadoresSueltos.find((p) => p.disponible && (capacidad === "decision" || p.via !== "antena"));
    if (!proc) return r("malla-local", esta, null, `No hay ningún servidor comunal que pueda servir «${nombre}».`);
    const local = proc.neuronaId === esta;
    const { via, alcanzable } = viaDe(plan, capacidad, local, [{ procesador: proc }]);
    const baseUrl = local || !alcanzable || via === "antena" ? null : urlDe({ procesador: proc });
    const motivo = baseUrl ? `«${nombre}» se sirve desde el servidor comunal «${proc.nombre}» por ${via}.` : `«${nombre}» va al servidor comunal «${proc.nombre}», pero no se conoce su host o no hay vía válida.`;
    return r(via, proc.neuronaId, baseUrl, motivo);
}
