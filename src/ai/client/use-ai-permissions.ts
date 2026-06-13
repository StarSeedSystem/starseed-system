"use client";

import { useCallback, useEffect, useState } from "react";
import {
    type AiActor,
    type AiPermissionState,
    type PermissionScope,
    loadPermissions,
    setScope as setScopeRaw,
    setComplexAccess as setComplexRaw,
    setMaxAgents as setMaxAgentsRaw,
    resetPermissions as resetRaw,
} from "./ai-permissions";

/**
 * Hook reactivo a los permisos de una IA (assistant | nexus).
 * Sincroniza entre superficies vía el evento global de cambios.
 */
export function useAiPermissions(actor: AiActor) {
    const [state, setState] = useState<AiPermissionState | null>(null);

    useEffect(() => {
        setState(loadPermissions(actor));
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent).detail as { actor?: AiActor } | undefined;
            if (!detail?.actor || detail.actor === actor) setState(loadPermissions(actor));
        };
        window.addEventListener("starseed:ai-permissions-changed", onChange);
        return () => window.removeEventListener("starseed:ai-permissions-changed", onChange);
    }, [actor]);

    const setScope = useCallback((scope: PermissionScope, value: boolean) => {
        setState(setScopeRaw(actor, scope, value));
    }, [actor]);

    const setComplexAccess = useCallback((value: boolean) => {
        setState(setComplexRaw(actor, value));
    }, [actor]);

    const setMaxAgents = useCallback((value: number) => {
        setState(setMaxAgentsRaw(actor, value));
    }, [actor]);

    const reset = useCallback(() => {
        setState(resetRaw(actor));
    }, [actor]);

    return { state, setScope, setComplexAccess, setMaxAgents, reset };
}
