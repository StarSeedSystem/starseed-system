"use client";

/**
 * EntityConnectivityConfig — Señales y conectividad POR ENTIDAD (Adenda 100).
 * ============================================================================
 * Envuelve el panel compartido `ConnectivityConfigPanel` (modo portable) para
 * una entidad concreta (página / grupo / comunidad …) y PERSISTE la config en
 * `entity_state` bajo la clave "connectivity" (LWW + sync realtime como el resto
 * de secciones de entidad). Reutiliza el mismo panel Crystal Liquid Glass que
 * usan la cuenta, los chats y las personalidades de Astraura.
 *
 * Contrato:
 *   · Lee al montar (getEntityState) y normaliza con normalizeConnectivityConfig.
 *   · Guarda en cada cambio (setEntityState) sin bloquear la UI.
 *   · SSR-safe y DEFENSIVO: nunca lanza; ante cualquier fallo se queda con la
 *     config por defecto (todo lo público encendido · bien común).
 */

import { useEffect, useState } from "react";
import { ConnectivityConfigPanel } from "@/components/connectivity/connectivity-config-panel";
import {
    type ConnectivityConfig,
    DEFAULT_CONNECTIVITY_CONFIG,
    normalizeConnectivityConfig,
} from "@/ai/astraura/mesh";
import { getEntityState, setEntityState, type EntityRef, type EntityKind } from "@/lib/sync/entity-state";

const CONNECTIVITY_KEY = "connectivity";

/** Etiqueta de contexto legible según el tipo de entidad. */
function contextLabelForKind(kind: EntityKind): string {
    switch (kind) {
        case "page":
            return "esta página";
        case "group":
            return "este grupo";
        case "community":
            return "esta comunidad";
        default:
            return "esta entidad";
    }
}

export interface EntityConnectivityConfigProps {
    entityRef: EntityRef;
}

export function EntityConnectivityConfig({ entityRef }: EntityConnectivityConfigProps) {
    const [cfg, setCfg] = useState<ConnectivityConfig>(DEFAULT_CONNECTIVITY_CONFIG);

    // Lectura inicial desde la nube (entity_state). Nunca lanza; si no hay fila
    // o falla, se mantiene la config por defecto. Guarda contra desmontaje.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const row = await getEntityState<ConnectivityConfig>(entityRef, CONNECTIVITY_KEY);
                if (cancelled) return;
                if (row) setCfg(normalizeConnectivityConfig(row.value));
            } catch {
                /* defensivo: se queda con DEFAULT_CONNECTIVITY_CONFIG */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [entityRef.kind, entityRef.id]);

    const handleChange = (next: ConnectivityConfig) => {
        setCfg(next);
        try {
            void setEntityState(entityRef, CONNECTIVITY_KEY, next).catch(() => {});
        } catch {
            /* defensivo: la UI ya refleja el cambio; el guardado es best-effort */
        }
    };

    return (
        <ConnectivityConfigPanel
            mode="portable"
            compact
            title="Señales y conectividad"
            contextLabel={contextLabelForKind(entityRef.kind)}
            value={cfg}
            onChange={handleChange}
        />
    );
}

export default EntityConnectivityConfig;
