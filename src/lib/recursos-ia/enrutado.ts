/**
 * Enrutado de IA por capacidad según topología (Ola 1023R · RIA1023C). PURO.
 * Contrato: `architecture/recursos-ia-neurona.md` §2-§3. Sin `node:*`, sin `fetch`.
 */
import type {
    Capacidad,
    ConfigTopologia,
    EstadoRecursosIa,
    InventarioRecursos,
    Via,
} from "./tipos";
import { PUERTO_SERVIDOR_IA } from "./oferta-desde-asignaciones";

export interface DestinoIA {
    via: Via;
    neuronaId: string;
    baseUrl: string | null;
    motivo: string;
}

function obtenerHostNeurona(inventario: InventarioRecursos, neuronaId: string): string | null {
    const neurona = inventario.neuronas.find((n) => n.id === neuronaId);
    if (!neurona) return null;
    // Intentar obtener host de diferentes fuentes en el inventario
    // El host puede venir de detección o nombre
    if ((neurona as any).host && typeof (neurona as any).host === "string") {
        const host = (neurona as any).host.trim();
        if (host) return host;
    }
    if ((neurona as any).hostname && typeof (neurona as any).hostname === "string") {
        const host = (neurona as any).hostname.trim();
        if (host) return host;
    }
    // Si no hay host conocido, devolver null
    return null;
}

function obtenerTopologia(
    estado: EstadoRecursosIa | ConfigTopologia | undefined,
    alcance?: { tipo: string; id: string },
): ConfigTopologia | undefined {
    if (!estado) return undefined;
    // Si es ConfigTopologia directamente
    if ((estado as ConfigTopologia).topologia && !("topologias" in estado)) {
        return estado as ConfigTopologia;
    }
    // Si es EstadoRecursosIa
    const estadoIa = estado as EstadoRecursosIa;
    if (estadoIa.topologias && alcance) {
        const clave = `${alcance.tipo}:${alcance.id}`;
        if (estadoIa.topologias[clave]) return estadoIa.topologias[clave];
        // Buscar cualquier topología si no hay clave exacta
        const tops = Object.values(estadoIa.topologias);
        if (tops.length === 1) return tops[0];
    }
    if (estadoIa.topologias) {
        const tops = Object.values(estadoIa.topologias);
        if (tops.length === 1) return tops[0];
    }
    return undefined;
}

export function destinoDeIA(
    plan: PlanRecursos | ConfigTopologia | undefined,
    asignaciones: EstadoRecursosIa | Record<string, any> | undefined,
    inventario: InventarioRecursos,
    capacidad: Capacidad,
): DestinoIA {
    const topologia = obtenerTopologia(plan as any) || obtenerTopologia(asignaciones as any);

    if (!topologia) {
        // Sin topología definida, por defecto cada-neurona
        const estaNeurona = inventario.estaNeuronaId;
        return {
            via: "local",
            neuronaId: estaNeurona,
            baseUrl: null,
            motivo: "Sin topología definida; se usa la neurona local",
        };
    }

    // Nunca antena para chat (solo decisiones)
    if (topologia.topologia === "cada-neurona") {
        const neuronaId = inventario.estaNeuronaId;
        return {
            via: "local",
            neuronaId,
            baseUrl: null,
            motivo: "Topología cada-neurona: procesamiento local",
        };
    }

    if (topologia.topologia === "servidor-propio") {
        const servidorNeuronaId = topologia.servidorNeuronaId || inventario.estaNeuronaId;
        const host = obtenerHostNeurona(inventario, servidorNeuronaId);
        if (host) {
            const baseUrl = `http://${host}:${PUERTO_SERVIDOR_IA}/v1`;
            return {
                via: "malla-local",
                neuronaId: servidorNeuronaId,
                baseUrl,
                motivo: "Topología servidor-propio: servidor de IA de la neurona elegida",
            };
        } else {
            return {
                via: "malla-local",
                neuronaId: servidorNeuronaId,
                baseUrl: null,
                motivo: "Topología servidor-propio: host desconocido para el servidor de IA",
            };
        }
    }

    if (topologia.topologia === "fragmentada") {
        // Buscar asignación para esa capacidad
        let neuronaAsignada = inventario.estaNeuronaId;
        if (topologia.porCapacidad && topologia.porCapacidad[capacidad]) {
            const conf = topologia.porCapacidad[capacidad];
            if (conf.procesaEn) {
                // procesaEn puede ser un id de procesador tipo "<neuronaId>:cpu"
                const procId = conf.procesaEn;
                if (procId.includes(":")) {
                    neuronaAsignada = procId.split(":")[0];
                } else if (procId !== "auto") {
                    neuronaAsignada = procId;
                }
            }
        } else if (asignaciones && "asignaciones" in (asignaciones as any)) {
            const estadoIa = asignaciones as EstadoRecursosIa;
            // Buscar asignación relacionada con la capacidad
            for (const a of Object.values(estadoIa.asignaciones)) {
                if (a.elemento.tipo === "modelo") {
                    // Buscar por nombre o asignación genérica
                    const p = a.procesaEn;
                    if (p && p !== "auto" && p.includes(":")) {
                        neuronaAsignada = p.split(":")[0];
                        break;
                    }
                }
            }
        }
        return {
            via: "local",
            neuronaId: neuronaAsignada,
            baseUrl: null,
            motivo: "Topología fragmentada: neurona asignada a la capacidad",
        };
    }

    if (topologia.topologia === "almacen-externo") {
        const neuronaId = inventario.estaNeuronaId;
        return {
            via: "local",
            neuronaId,
            baseUrl: null,
            motivo: "Topología almacén-externo: procesamiento local con modelos externos",
        };
    }

    if (topologia.topologia === "comunal") {
        // Para comunal, generalmente usar malla/red
        const neuronaId = inventario.estaNeuronaId;
        // Asegurarse de nunca usar antena para chat
        const via = topologia.vias && topologia.vias.length > 0 ? topologia.vias[0] : "red-starseed";
        const viaFinal: Via = via === "antena" ? "red-starseed" : via;
        return {
            via: viaFinal,
            neuronaId,
            baseUrl: null,
            motivo: "Topología comunal: servidor compartido",
        };
    }

    // Por defecto
    const neuronaId = inventario.estaNeuronaId;
    return {
        via: "local",
        neuronaId,
        baseUrl: null,
        motivo: "Topología no reconocida; se usa la neurona local",
    };
}

// Necesario para importar PlanRecursos
import type { PlanRecursos } from "./tipos";
