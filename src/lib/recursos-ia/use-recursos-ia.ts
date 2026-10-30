"use client";

import { useCallback, useEffect, useState } from "react";

import {
    registrarServidorPropioModelo,
    quitarServidorPropioModelo,
    type CustomModel,
} from "@/ai/astraura/custom-models";
import { guardarEstado, leerEstado } from "./asignaciones";
import { destinoDeIA } from "./enrutado";
import {
    CLAVE_RECURSOS_IA,
    EVENTO_RECURSOS_IA,
    type EstadoRecursosIa,
    type InventarioRecursos,
} from "./tipos";

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
    return [estado, cambiar];
}

/** Destino del servidor propio que hoy tiene dirección conocida (lazo local), con su neurona. PURO. */
export function destinoServidorPropio(
    estado: EstadoRecursosIa,
    inventario: InventarioRecursos | null,
): { baseUrl: string; neuronaId: string; nombre: string } | null {
    if (!inventario) return null;
    const planes = Object.values(estado.topologias)
        .filter((c) => c.topologia === "servidor-propio")
        .sort((a, b) => `${a.alcance.tipo}:${a.alcance.id}`.localeCompare(`${b.alcance.tipo}:${b.alcance.id}`));
    for (const plan of planes) {
        const destino = destinoDeIA(plan, estado.asignaciones, inventario, "texto");
        if (!destino.baseUrl || !destino.neuronaId) continue;
        const neurona = inventario.neuronas.find((n) => n.id === destino.neuronaId);
        return {
            baseUrl: destino.baseUrl,
            neuronaId: destino.neuronaId,
            nombre: neurona?.nombre || neurona?.id || destino.neuronaId,
        };
    }
    return null;
}

/**
 * Refleja la topología «servidor-propio» en un modelo propio de Astraura (RIA1023D): lo registra
 * o actualiza si `destinoDeIA` da un `baseUrl`; lo quita (solo el marcado) al cambiar de topología.
 * Sin inventario no decide: devolver `null` deja intacto lo que hubiera.
 */
export function sincronizarServidorPropioModelo(
    estado: EstadoRecursosIa,
    inventario: InventarioRecursos | null,
): CustomModel | null {
    const hayServidorPropio = Object.values(estado.topologias).some((c) => c.topologia === "servidor-propio");
    if (!hayServidorPropio) {
        quitarServidorPropioModelo();
        return null;
    }
    if (!inventario) return null;
    const destino = destinoServidorPropio(estado, inventario);
    if (!destino) {
        quitarServidorPropioModelo();
        return null;
    }
    return registrarServidorPropioModelo({
        nombre: `Servidor propio de IA · ${destino.nombre}`,
        endpoint: destino.baseUrl,
    });
}

/** Mantiene el modelo «Servidor propio de IA» en sincronía con la topología elegida. */
export function useServidorPropioModelo(estado: EstadoRecursosIa, inventario: InventarioRecursos | null): void {
    useEffect(() => {
        sincronizarServidorPropioModelo(estado, inventario);
    }, [estado, inventario]);
}
