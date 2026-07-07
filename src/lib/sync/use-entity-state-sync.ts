"use client";

/*
 * useEntityStateSync — hook de conveniencia sobre entity-state.ts para
 * SECCIONES COMPARTIDAS de una entidad (grupo/página/comunidad/evento/EF/
 * partido/perfil/usuario): pizarras de grupo, escritorios compartidos, o
 * cualquier otra sección futura que varias personas o varios dispositivos
 * de la MISMA entidad deban ver reflejarse en vivo.
 *
 * NO reimplementa nada de entity-state.ts (deviceId/getEntityState/
 * setEntityState/subscribeEntityState siguen siendo el contrato único) —
 * solo empaqueta el patrón "leer valor + escuchar cambios remotos + escribir
 * con LWW" en un hook de React listo para usar en un componente:
 *
 *   const [board, setBoard, meta] = useEntityStateSync<BoardValue>(
 *     { kind: "group", id: groupSlug },
 *     "board:main",
 *     { local: myLocalDefaultBoard },
 *   );
 *
 *   // `board` refleja el último valor conocido (local mientras carga, luego
 *   // remoto); `setBoard(next)` escribe local YA (optimista) y hace push a
 *   // la nube; los cambios de OTROS dispositivos/miembros llegan solos vía
 *   // `subscribeEntityState` y actualizan `board` sin que el componente haga
 *   // nada más. `meta.rev`/`meta.updatedAt`/`meta.loading` para UI de estado.
 *
 * No sustituye la Biblioteca por entidad (src/lib/library/entity-library.ts,
 * key="library") — eso es de otro agente/capa; este hook es para CUALQUIER
 * otra key de entity_state (pizarras `board:<id>`, escritorios de grupo
 * `desktop:<id>`, o las que se definan en el futuro).
 *
 * Local-first y defensivo: sin sesión/tabla, `value` se queda en el `local`
 * inicial y `setValue` solo actualiza el estado de React (no lanza).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityRef,
} from "@/lib/sync/entity-state";

export interface UseEntityStateSyncOptions<T> {
    /** Valor local por defecto mientras se carga o si no hay sesión/fila remota aún. */
    local?: T;
    /** Si es false, no se suscribe a cambios en vivo (solo lectura/escritura puntual). Por defecto true. */
    live?: boolean;
}

export interface EntityStateSyncMeta {
    loading: boolean;
    /** Revisión (LWW) del último valor remoto conocido, o null si aún no se ha leído ninguno. */
    rev: number | null;
    updatedAt: string | null;
    /** true justo después de aplicar un cambio que vino de OTRO dispositivo/miembro. */
    lastChangeWasRemote: boolean;
}

/**
 * Hook de estado sincronizado por ENTIDAD. Devuelve [valor, setValor, meta].
 * Aditivo sobre entity-state.ts: no crea tablas ni canales nuevos.
 */
export function useEntityStateSync<T = unknown>(
    ref: EntityRef | null,
    key: string,
    options: UseEntityStateSyncOptions<T> = {},
): [T | undefined, (next: T) => void, EntityStateSyncMeta] {
    const { local, live = true } = options;
    const [value, setValue] = useState<T | undefined>(local);
    const [meta, setMeta] = useState<EntityStateSyncMeta>({
        loading: !!ref,
        rev: null,
        updatedAt: null,
        lastChangeWasRemote: false,
    });
    // Evita aplicar una respuesta de red obsoleta si ref/key cambian rápido.
    const requestSeq = useRef(0);

    // Carga inicial.
    useEffect(() => {
        if (!ref) { setMeta((m) => ({ ...m, loading: false })); return; }
        const seq = ++requestSeq.current;
        let alive = true;
        setMeta((m) => ({ ...m, loading: true }));
        void (async () => {
            const row = await getEntityState<T>(ref, key);
            if (!alive || seq !== requestSeq.current) return;
            if (row) {
                setValue(row.value);
                setMeta({ loading: false, rev: row.rev, updatedAt: row.updated_at, lastChangeWasRemote: false });
            } else {
                setMeta((m) => ({ ...m, loading: false }));
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref?.kind, ref?.id, key]);

    // Suscripción en vivo a cambios de OTROS dispositivos/miembros de la entidad.
    useEffect(() => {
        if (!ref || !live) return;
        const off = subscribeEntityState<T>(ref, key, (change) => {
            if (change.self) return; // anti-eco: nuestro propio cambio ya está aplicado localmente
            setValue(change.value);
            setMeta({ loading: false, rev: change.rev, updatedAt: change.updated_at, lastChangeWasRemote: true });
        });
        return off;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref?.kind, ref?.id, key, live]);

    const update = useCallback((next: T) => {
        setValue(next); // optimista: la UI no espera la red
        setMeta((m) => ({ ...m, lastChangeWasRemote: false }));
        if (!ref) return; // sin entidad válida, solo estado local de React
        void setEntityState<T>(ref, key, next).then((row) => {
            if (row) setMeta((m) => ({ ...m, rev: row.rev, updatedAt: row.updated_at }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref?.kind, ref?.id, key]);

    return [value, update, meta];
}
