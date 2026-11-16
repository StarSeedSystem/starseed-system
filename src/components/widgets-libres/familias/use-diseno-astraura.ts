import * as React from "react";
import { disenoValido, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";

export function useDisenoAstraura(
    widget?: { settings?: Record<string, unknown> },
    onUpdateSettings?: (patch: Record<string, unknown>) => void
): [EleccionDiseno, (e: EleccionDiseno) => void] {
    const storageKey = "starseed.widget.astraura.diseno.v1";

    const [eleccionLocal, setEleccionLocal] = React.useState<EleccionDiseno>(() => {
        if (widget?.settings && "astrauraDiseno" in widget.settings) {
            return disenoValido(widget.settings.astrauraDiseno);
        }
        if (typeof window !== "undefined") {
            try {
                const guardado = localStorage.getItem(storageKey);
                if (guardado !== null) {
                    return disenoValido(guardado);
                }
            } catch {
                // sin acceso a storage
            }
        }
        return "auto";
    });

    React.useEffect(() => {
        if (widget?.settings && "astrauraDiseno" in widget.settings) {
            const v = disenoValido(widget.settings.astrauraDiseno);
            if (v !== eleccionLocal) {
                setEleccionLocal(v);
            }
        }
    }, [widget?.settings]);

    const cambiar = React.useCallback(
        (nuevo: EleccionDiseno) => {
            const valido = disenoValido(nuevo);
            setEleccionLocal(valido);
            if (onUpdateSettings) {
                onUpdateSettings({ astrauraDiseno: valido });
            } else if (typeof window !== "undefined") {
                try {
                    localStorage.setItem(storageKey, valido);
                } catch {
                    // sin acceso a storage
                }
            }
        },
        [onUpdateSettings]
    );

    return [eleccionLocal, cambiar];
}
