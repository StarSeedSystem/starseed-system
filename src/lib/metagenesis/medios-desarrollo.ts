/**
 * medios-desarrollo — catálogo puro de medios y entornos activos de MetaGenesis (2026-11-27).
 * Unifica la neurona actual desde donde se abre la app, neuronas activas de la cuenta/malla,
 * servidores Oracle/nube de ejecución y los entornos de desarrollo y producción. Puro, ≤120 líneas.
 */
import { aparatosDe, colorAparatoDe, idUnicoPorDefecto } from "@/lib/neurons/aparatos-de-neurona";
import { abiertoEnLaMac, esAppNativaLocal } from "@/lib/metagenesis/remoto";
import type { EstadoAutonomo } from "@/lib/metagenesis/remoto-nodos";
import type { Neuron } from "@/lib/neurons/neurons";

export type TipoMedioDesarrollo = "actual" | "neurona-mesh" | "oracle" | "mac" | "nube" | "produccion";

export interface MedioDesarrollo {
    id: string;
    nombre: string;
    tipo: TipoMedioDesarrollo;
    activo: boolean;
    lider?: boolean;
    detalle: string;
    etiquetas: string[];
    color?: string;
}

export interface EntradaMediosDesarrollo {
    origenPagina: string;
    hostname: string;
    puerto?: string;
    nombreActual?: string;
    idUnicoActual?: string;
    plataformaActual?: string;
    neuronas: readonly Neuron[];
    estadoAutonomo: EstadoAutonomo | null;
}

function tipoDeNodo(medio: string): TipoMedioDesarrollo {
    if (medio === "oracle-a1") return "oracle";
    if (medio === "mac") return "mac";
    return "nube";
}

/** Construye la lista unificada de medios activos de desarrollo y producción (con o sin la Mac). Pura. */
export function construirMediosDesarrollo(e: EntradaMediosDesarrollo): MedioDesarrollo[] {
    const lista: MedioDesarrollo[] = [];
    const esLocalMac = abiertoEnLaMac(e.hostname, e.puerto);
    const esNativa = esAppNativaLocal(e.hostname, e.puerto);
    const modoMedio = esLocalMac ? "Genesis local :9002" : esNativa ? "App nativa" : "Web / Producción";

    lista.push({
        id: "medio:actual",
        nombre: e.nombreActual?.trim() || "Esta neurona",
        tipo: "actual",
        activo: true,
        detalle: `${modoMedio}${e.plataformaActual ? ` · ${e.plataformaActual}` : ""}${e.idUnicoActual ? ` · @${e.idUnicoActual}` : ""}`,
        etiquetas: ["Sesión actual", modoMedio, "Sin depender de la Mac"],
    });

    const nodos = e.estadoAutonomo?.nodos ?? [];
    for (const n of nodos) {
        lista.push({
            id: `nodo:${n.nodo}`,
            nombre: n.etiqueta,
            tipo: tipoDeNodo(n.medio),
            activo: n.vivo,
            lider: n.lider && n.vivo,
            detalle: `${n.medio} · ${n.orquestadores.length ? `${n.orquestadores.length} orquestador(es)` : "disponible"}`,
            etiquetas: [n.lider && n.vivo ? "Dirige ahora" : n.vivo ? "En línea" : "En reposo", n.modo === "seco" ? "Prueba" : "Producción"],
        });
    }

    if (!nodos.some((n) => n.medio === "oracle-a1")) {
        lista.push({
            id: "entorno:oracle-a1",
            nombre: "Oracle A1 (servidor 24/7)",
            tipo: "oracle",
            activo: Boolean(e.estadoAutonomo),
            detalle: "Nodo autónomo de respaldo y colas de MetaGenesis fuera de la Mac.",
            etiquetas: ["Oracle Cloud", "Autónomo"],
        });
    }

    for (const n of e.neuronas) {
        if (n.isThisDevice) continue;
        const aps = aparatosDe(n.capabilities);
        const ap = aps[0];
        const alias = ap ? `@${ap.idUnico || idUnicoPorDefecto(ap)}` : "";
        const caps = [
            n.capabilities.ollama ? "Ollama" : "",
            n.capabilities.hermesInstalled || n.capabilities.bridge?.mode === "external-hermes" ? "Hermes" : "",
            n.capabilities.meshDeviceId || n.capabilities.lanas ? "Malla P2P" : "",
        ].filter(Boolean);
        lista.push({
            id: `neurona:${n.id}`,
            nombre: n.name + (alias ? ` (${alias})` : ""),
            tipo: "neurona-mesh",
            activo: Boolean(n.online),
            color: ap ? colorAparatoDe(ap) : undefined,
            detalle: `${n.capabilities.platform || n.kind} · ${n.online ? "Activa en la cuenta" : "Sin conexión"}`,
            etiquetas: caps.length ? caps : ["Neurona de cuenta"],
        });
    }

    lista.push({
        id: "entorno:bus-autonomo",
        nombre: "Bus autónomo y producción StarSeed",
        tipo: "produccion",
        activo: true,
        detalle: `Origen ${e.origenPagina || "web"} conectado por Supabase + orden firmada.`,
        etiquetas: ["Vercel / Web", "Supabase", esLocalMac ? "Local + Nube" : "Multientorno"],
    });

    return lista;
}
