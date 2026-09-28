"use client";

/**
 * presencia-contactos — puente fino hacia la presencia de la mensajería (contrato C7,
 * `usePresencia`). Devuelve solo «¿en línea?» por cuenta y limita cuántas cuentas se piden,
 * para que una libreta enorme no dispare una consulta desmedida. Si la tabla de presencia aún
 * no existe en el servidor, `usePresencia` responde vacío y aquí nadie sale «en línea».
 */

import { useMemo } from "react";

import { usePresencia } from "@/lib/mensajeria/presencia";

const MAX_CUENTAS = 150;

export function usePresenciaContactos(userIds: (string | null | undefined)[]): Record<string, boolean> {
    const clave = useMemo(() => {
        const unicos = Array.from(new Set(userIds.filter((x): x is string => Boolean(x)))).slice(0, MAX_CUENTAS);
        unicos.sort();
        return unicos.join(",");
    }, [userIds]);
    const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);
    const mapa = usePresencia(ids);
    return useMemo(() => {
        const out: Record<string, boolean> = {};
        for (const [uid, p] of Object.entries(mapa ?? {})) out[uid] = Boolean(p?.enLinea);
        return out;
    }, [mapa]);
}
