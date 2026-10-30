"use client";

/**
 * useRecursosIa — estado de recursos de IA en vivo (RIA1023D): se actualiza al cambiar en esta
 * pestaña, en otra o al llegar de la cuenta. Con la topología «servidor-propio» el servidor propio
 * de IA (Hono, puerto 4480, SOP §6) se registra como modelo propio de Astraura con `endpoint` =
 * `destinoDeIA(...).baseUrl` y `notes: "recursos-ia:servidor-propio"`; al cambiar a otra topología
 * se quita (solo el marcado); con `baseUrl` null no se registra nada. Decisión PURA, el gancho aplica.
 */

import { useCallback, useEffect, useState } from "react";

import { addCustomModel, listCustomModels, removeCustomModel, updateCustomModel, type CustomModel } from "@/ai/astraura/custom-models";

import { guardarEstado, leerEstado } from "./asignaciones";
import { destinoDeIA } from "./enrutado";
import { detectarInventario } from "./deteccion";
import { CLAVE_RECURSOS_IA, EVENTO_RECURSOS_IA, type ConfigTopologia, type EstadoRecursosIa, type InventarioRecursos } from "./tipos";

/** `notes` con el que se reconoce el modelo propio del servidor propio de IA. */
export const MARCADOR_SERVIDOR_PROPIO = "recursos-ia:servidor-propio";

export type AccionRegistro = "registrar" | "actualizar" | "quitar" | "nada";

/** Qué hacer con el registro del servidor propio: la acción, sobre qué modelo y con qué datos. */
export interface DecisionServidorPropio {
    accion: AccionRegistro;
    /** Id del modelo propio marcado (null si aún no existe). */
    modeloId: string | null;
    /** Datos del registro (null si la acción no escribe). */
    registro: { name: string; endpoint: string; notes: string } | null;
    /** El `baseUrl` de `destinoDeIA(...)` con el que se decidió (null si no hay dirección). */
    baseUrl: string | null;
    /** En palabras de la persona: qué pasó y por qué. */
    motivo: string;
}

/** Decisión PURA (sin efectos ni `node:*`) sobre el registro; capacidad de referencia «texto». */
export function decidirServidorPropio(config: ConfigTopologia | undefined, inventario: InventarioRecursos | null, modelos: CustomModel[]): DecisionServidorPropio {
    const marcado = modelos.find((m) => m.kind === "llm" && m.access === "local" && m.notes === MARCADOR_SERVIDOR_PROPIO) ?? null;
    if (!config || config.topologia !== "servidor-propio") {
        return marcado
            ? { accion: "quitar", modeloId: marcado.id, registro: null, baseUrl: null, motivo: "La topología ya no es «servidor propio»: se quita el registro marcado y nada más." }
            : { accion: "nada", modeloId: null, registro: null, baseUrl: null, motivo: "Sin registro del servidor propio que vigilar." };
    }
    const baseUrl = inventario ? destinoDeIA(config, {}, inventario, "texto").baseUrl : null;
    if (!baseUrl) return { accion: "nada", modeloId: marcado?.id ?? null, registro: null, baseUrl: null, motivo: "Sin dirección a la que escribir (baseUrl null): no se registra nada." };
    const servidora = inventario?.neuronas.find((n) => n.id === config.servidorNeuronaId) ?? null;
    const name = `Servidor propio de IA · ${servidora ? servidora.nombre || servidora.id : config.servidorNeuronaId ?? ""}`;
    const registro = { name, endpoint: baseUrl, notes: MARCADOR_SERVIDOR_PROPIO };
    if (!marcado) return { accion: "registrar", modeloId: null, registro, baseUrl, motivo: "Topología «servidor propio»: entra como modelo propio de Astraura." };
    if (marcado.endpoint !== baseUrl || marcado.name !== name) {
        return { accion: "actualizar", modeloId: marcado.id, registro, baseUrl, motivo: "La servidora o su dirección cambiaron: se actualiza el registro marcado." };
    }
    return { accion: "nada", modeloId: marcado.id, registro: null, baseUrl, motivo: "El registro marcado ya concuerda con la topología." };
}

/** Decide y aplica con `addCustomModel`/`updateCustomModel`/`removeCustomModel` (localStorage; nunca lanza). */
export function sincronizarServidorPropio(config: ConfigTopologia | undefined, inventario: InventarioRecursos | null): DecisionServidorPropio {
    const d = decidirServidorPropio(config, inventario, listCustomModels());
    if (d.accion === "quitar" && d.modeloId) removeCustomModel(d.modeloId);
    if (d.accion === "registrar" && d.registro) {
        addCustomModel({ name: d.registro.name, kind: "llm", access: "local", endpoint: d.registro.endpoint, notes: d.registro.notes });
    }
    if (d.accion === "actualizar" && d.modeloId && d.registro) updateCustomModel(d.modeloId, { name: d.registro.name, endpoint: d.registro.endpoint, notes: d.registro.notes });
    return d;
}

/** El estado de la cuenta: sin ninguna topología «servidor-propio» ⇒ quitar; las demás, en orden por clave. */
export function sincronizarEstadoServidorPropio(estado: EstadoRecursosIa, inventario: InventarioRecursos | null): DecisionServidorPropio {
    const propios = Object.values(estado.topologias).filter((c) => c?.topologia === "servidor-propio");
    if (propios.length === 0) return sincronizarServidorPropio(undefined, inventario);
    let ultima: DecisionServidorPropio | null = null;
    for (const c of propios) ultima = sincronizarServidorPropio(c, inventario);
    return ultima ?? sincronizarServidorPropio(undefined, inventario);
}

/** Vigencia del inventario recordado: no volver a detectar por cada pestaña que monta el gancho. */
const VIGENCIA_INVENTARIO_MS = 5 * 60_000;

let inventarioRecordado: { inv: InventarioRecursos; en: number } | null = null;
let deteccionEnVuelo: Promise<InventarioRecursos | null> | null = null;

/** Inventario para decidir: el recordado si está fresco; si no, UNA detección compartida (best-effort). */
function inventarioParaRegistrar(): Promise<InventarioRecursos | null> {
    if (inventarioRecordado && Date.now() - inventarioRecordado.en < VIGENCIA_INVENTARIO_MS) return Promise.resolve(inventarioRecordado.inv);
    if (deteccionEnVuelo) return deteccionEnVuelo;
    deteccionEnVuelo = detectarInventario({})
        .then((inv) => {
            inventarioRecordado = { inv, en: Date.now() };
            return inv;
        })
        .catch(() => null)
        .finally(() => {
            deteccionEnVuelo = null;
        });
    return deteccionEnVuelo;
}
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
    }, []);
    useEffect(() => {
        let vivo = true;
        if (!Object.values(estado.topologias).some((c) => c?.topologia === "servidor-propio")) {
            // Llegó de la cuenta o de otra pestaña: quitar el registro marcado si existía.
            sincronizarEstadoServidorPropio(estado, null);
            return undefined;
        }
        void inventarioParaRegistrar().then((inv) => {
            if (vivo && inv) sincronizarEstadoServidorPropio(estado, inv);
        });
        return () => {
            vivo = false;
        };
    }, [estado]);
    return [estado, cambiar];
}
