"use client";

/**
 * «Recursos de IA» en vivo (hook) + registro del servidor propio como modelo propio (RIA1023D):
 * con la topología «servidor-propio» Astraura lo conoce por `addCustomModel`/`updateCustomModel`
 * (endpoint = `destinoDeIA(...).baseUrl`); al irse a otra topología se quita SÓLO el marcado.
 * SOP: `architecture/recursos-ia-neurona.md` §2 y §6.
 */
import { useCallback, useEffect, useState } from "react";

import {
    addCustomModel,
    listCustomModels,
    removeCustomModel,
    updateCustomModel,
    NOTAS_SERVIDOR_PROPIO,
    type CustomModel,
} from "@/ai/astraura/custom-models";
import { guardarEstado, leerEstado } from "./asignaciones";
import { destinoDeIA } from "./enrutado";
import { CLAVE_RECURSOS_IA, EVENTO_RECURSOS_IA, type EstadoRecursosIa } from "./tipos";
import type { Asignacion, ConfigTopologia, InventarioRecursos } from "./tipos";

/** Estado de recursos de IA en vivo (se actualiza al cambiar en esta pestaña, en otra o al llegar de la cuenta). */
export function useRecursosIa(): [EstadoRecursosIa, (cambio: (e: EstadoRecursosIa) => EstadoRecursosIa) => void] {
    const [estado, setEstado] = useState<EstadoRecursosIa>(() => leerEstado());
    useEffect(() => {
        const releer = () => setEstado(leerEstado());
        const almacen = (ev: StorageEvent) => {
            if (ev.key === CLAVE_RECURSOS_IA) releer();
        };
        window.addEventListener(EVENTO_RECURSOS_IA, releer);
        window.addEventListener("storage", almacen);
        return () => {
            window.removeEventListener(EVENTO_RECURSOS_IA, releer);
            window.removeEventListener("storage", almacen);
        };
    }, []);
    const cambiar = useCallback((cambio: (e: EstadoRecursosIa) => EstadoRecursosIa) => {
        const nuevo = cambio(leerEstado());
        guardarEstado(nuevo);
        setEstado(nuevo);
        void sincronizarAlCambiar(nuevo);
    }, []);
    return [estado, cambiar];
}

/* ── RIA1023D · el servidor propio de IA como modelo propio ───────────────────── */

/** Lo que debería estar registrado en `custom-models.v1` por una topología «servidor-propio». */
export interface ObjetivoServidorPropio {
    name: string;
    endpoint: string;
}

/** Lo que hay que hacerle al registro de modelos propios para que refleje la topología. */
export type DecisionServidorPropio =
    | { accion: "registrar" }
    | { accion: "nada" }
    | { accion: "quitar"; ids: string[] }
    | { accion: "actualizar"; id: string; objetivo: ObjetivoServidorPropio; sobran?: string[] };

/** Los modelos propios de IA marcados por Recursos de IA (sólo ellos entran y salen). PURA. */
export function modelosMarcados(lista: CustomModel[] = listCustomModels()): CustomModel[] {
    return lista.filter((m) => m.notes === NOTAS_SERVIDOR_PROPIO && m.kind === "llm");
}

/**
 * Qué modelo propio debería existir por esta topología, o `null` (otra topología, o «servidor-propio»
 * sin dirección conocida todavía: la malla la publicará). PURA: usa `destinoDeIA` (RIA1023C).
 */
export function objetivoServidorPropio(
    plan: ConfigTopologia,
    asignaciones: Record<string, Asignacion>,
    inventario: InventarioRecursos,
): ObjetivoServidorPropio | null {
    if (plan.topologia !== "servidor-propio") return null;
    const destino = destinoDeIA(plan, asignaciones, inventario, "texto");
    if (!destino.baseUrl) return null;
    const servidora = destino.neuronaId ? inventario.neuronas.find((n) => n.id === destino.neuronaId) : undefined;
    const nombre = servidora?.nombre || destino.neuronaId || "";
    return {
        name: nombre ? `Servidor propio de IA · ${nombre}` : "Servidor propio de IA",
        endpoint: destino.baseUrl,
    };
}

/** Decide sin tocar nada: registrar, actualizar, quitar (sólo los marcados) o nada. PURA. */
export function decidirServidorPropio(
    objetivo: ObjetivoServidorPropio | null,
    marcados: Pick<CustomModel, "id" | "name" | "endpoint">[],
): DecisionServidorPropio {
    const [primero, ...sobran] = marcados;
    const idsSobran = sobran.map((m) => m.id);
    if (!objetivo) return primero ? { accion: "quitar", ids: marcados.map((m) => m.id) } : { accion: "nada" };
    if (!primero) return { accion: "registrar" };
    if (primero.endpoint === objetivo.endpoint && primero.name === objetivo.name) {
        return idsSobran.length ? { accion: "quitar", ids: idsSobran } : { accion: "nada" };
    }
    return { accion: "actualizar", id: primero.id, objetivo, ...(idsSobran.length ? { sobran: idsSobran } : {}) };
}

/** Aplica la decisión sobre el registro: `addCustomModel`/`updateCustomModel`/`removeCustomModel`. */
export function sincronizarServidorPropio(
    estado: EstadoRecursosIa,
    inventario: InventarioRecursos,
    modelos: CustomModel[] = listCustomModels(),
): DecisionServidorPropio {
    let objetivo: ObjetivoServidorPropio | null = null;
    for (const plan of Object.values(estado.topologias)) {
        objetivo = objetivoServidorPropio(plan, estado.asignaciones, inventario);
        if (objetivo) break;
    }
    const decision = decidirServidorPropio(objetivo, modelosMarcados(modelos));
    if (decision.accion === "registrar" && objetivo) {
        addCustomModel({
            name: objetivo.name,
            kind: "llm",
            access: "local",
            endpoint: objetivo.endpoint,
            notes: NOTAS_SERVIDOR_PROPIO,
        });
    } else if (decision.accion === "actualizar" && objetivo) {
        updateCustomModel(decision.id, {
            name: objetivo.name,
            endpoint: objetivo.endpoint,
            kind: "llm",
            access: "local",
            notes: NOTAS_SERVIDOR_PROPIO,
        });
        for (const id of decision.sobran ?? []) removeCustomModel(id);
    } else if (decision.accion === "quitar") {
        for (const id of decision.ids) removeCustomModel(id);
    }
    return decision;
}

/**
 * Lo que dispara el hook al cambiar el estado. La detección va a demanda (import perezoso):
 * sólo si hay una topología «servidor-propio» guardada o un modelo marcado por retirar.
 * Si el estado cambió otra vez mientras se detectaba, la última llamada manda.
 */
let ordenSync = 0;
async function sincronizarAlCambiar(estado: EstadoRecursosIa): Promise<void> {
    const orden = ++ordenSync;
    const hayPropia = Object.values(estado.topologias).some((c) => c.topologia === "servidor-propio");
    if (!hayPropia && !modelosMarcados().length) return;
    try {
        const { detectarEstaNeurona, inventarioDesde } = await import("./deteccion");
        const esta = await detectarEstaNeurona();
        if (!esta || orden !== ordenSync) return; // sin neurona o cambió otra vez: la última manda
        sincronizarServidorPropio(estado, inventarioDesde({ estaNeurona: esta }));
    } catch {
        // sin inventario no hay destino conocido: el registro queda como está
    }
}


