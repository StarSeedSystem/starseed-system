// Conector del almacén del Mando (contrato §7): las rutas leen a través de
// `AlmacenMando`; aquí se elige con `elegirAlmacen` y se construye el local
// con los lectores REALES de hoy (lector-local), sin moverlos ni cambiarlos.
import { crearAlmacenLocal, elegirAlmacen, type AlmacenMando, type ProgresoMando } from "./almacen";
import type { TareaOla as TareaProtocolo, EventoMando } from "./protocolo";
import type { TareaOla as TareaPanel } from "./tipos";
import { leerColas, leerProgreso, leerEventosDelBus, medirAgentes } from "./lector-local";

/** Tarea del panel que además cumple la forma del protocolo: viaja entera por el almacén. */
type TareaConectada = TareaProtocolo & { descripcion?: string; cola?: string };

function aProtocolo(t: TareaPanel): TareaConectada {
    return {
        id: t.id,
        ola: t.ola,
        titulo: t.titulo,
        depende: t.dependencias,
        archivos: t.archivos ?? [],
        prompt: "",
        ...(t.descripcion ? { descripcion: t.descripcion } : {}),
        ...(t.cola ? { cola: t.cola } : {}),
    };
}

/** Del almacén (§7) de vuelta a la forma que consumen hoy las tarjetas del Mando. */
export function tareaDesdeAlmacen(t: TareaProtocolo): TareaPanel {
    const extra = t as TareaConectada;
    return {
        id: t.id,
        ola: t.ola,
        titulo: t.titulo,
        dependencias: t.depende,
        archivos: t.archivos,
        ...(extra.descripcion ? { descripcion: extra.descripcion } : {}),
        ...(extra.cola ? { cola: extra.cola } : {}),
    };
}

/** Del progreso real (`Record<string, unknown>`) a la forma compacta, sin perder campos extra. */
function aProgresoMando(p: Record<string, unknown>): ProgresoMando {
    const salida: ProgresoMando = {};
    for (const [id, bruto] of Object.entries(p)) {
        if (typeof bruto !== "object" || bruto === null) continue;
        const entrada = bruto as Record<string, unknown>;
        if (typeof entrada.estado !== "string") continue;
        salida[id] = entrada as unknown as { estado: string; avance?: number };
    }
    return salida;
}

function aEventoMando(e: { t: string; tipo: string; tarea?: string; texto: string }): EventoMando | null {
    const ms = Date.parse(e.t);
    if (!Number.isFinite(ms) || !e.tipo || !e.texto) return null;
    return { t: ms, tipo: e.tipo, texto: e.texto, ...(e.tarea ? { tarea: e.tarea } : {}) };
}

/**
 * Elige y construye el almacén para esta petición (§1.10/§7). Devuelve `null`
 * cuando tocaría el almacén `supabase` (ola F2, aún encolada): la ruta decide
 * cómo responder; jamás lee Supabase por sorpresa.
 */
export function almacenPara(opciones: {
    banderaTodos: boolean;
    esLocal: boolean;
    ambitoId?: string;
}): AlmacenMando | null {
    const tipo = elegirAlmacen(opciones);
    if (tipo === "supabase") return null; // almacén Supabase: ola F2, encolada
    return crearAlmacenLocal({
        tareas: async () => (await leerColas()).map(aProtocolo),
        progreso: async () => aProgresoMando(await leerProgreso()),
        eventos: async (_desde?: string, limite?: number) =>
            (await leerEventosDelBus(limite ?? 40))
                .map(aEventoMando)
                .filter((e): e is EventoMando => e !== null)
                .filter((e) => _desde === undefined || e.t >= Number(_desde)),
        medidores: () => medirAgentes(),
    });
}
