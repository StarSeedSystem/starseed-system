"use client";

/*
 * shared-desktop-space — modo COLABORATIVO de un escritorio compartido
 * (os_spaces kind='desktop', SOP §11). Se activa cuando /escritorios se abre
 * con `?space=<id>`: en vez de anclar el doc local al PERFIL activo
 * (profile-desktops.ts), lo ancla al ESPACIO compartido — mismo patrón
 * (localStorage `starseed.desktops.v1` sigue siendo lo que DesktopCanvas
 * renderiza; aquí solo se decide de dónde viene/adónde va ese doc).
 *
 * Al entrar en modo espacio:
 *  · Se guarda (best-effort, en memoria de sesión) el doc local previo para
 *    poder restaurarlo al salir del modo espacio (nunca se pierde el
 *    escritorio personal).
 *  · Se carga el doc del espacio a `starseed.desktops.v1` (acepta invitación
 *    pendiente al abrir).
 *  · Cambios locales → updateSpaceDoc con debounce; cambios remotos de otros
 *    colaboradores → se aplican al instante (misma clave, mismo evento
 *    'starseed:desktops' que ya escucha desktop-store.ts).
 *
 * useProfileDesktopsSync() se DESACTIVA mientras haya un espacio abierto
 * (ver el guard `hasOpenSpace()` que expone este módulo) para evitar que dos
 * dueños del mismo localStorage se pisen entre sí.
 */

import { useEffect, useRef, useState } from "react";
import { normalizeState, type DesktopsState } from "@/components/desktop/desktop-store";
import { getSpace, updateSpaceDoc, subscribeSpace, acceptSpaceInvite, type Space } from "@/lib/spaces/spaces";

const LS_KEY = "starseed.desktops.v1";
const DESKTOPS_EVENT = "starseed:desktops";
const PUSH_DEBOUNCE_MS = 900;

let openSpaceId: string | null = null;
/** Evento despachado cada vez que se abre/cierra un espacio compartido (profile-desktops.ts se re-evalúa). */
export const SPACE_TOGGLE_EVENT = "starseed:desktop-space-toggle";

function setOpenSpaceId(id: string | null): void {
    if (openSpaceId === id) return;
    openSpaceId = id;
    if (typeof window !== "undefined") {
        try {
            window.dispatchEvent(new Event(SPACE_TOGGLE_EVENT));
        } catch {
            /* noop */
        }
    }
}

/** ¿Hay un espacio compartido abierto en este momento? (consultado por profile-desktops.ts). */
export function hasOpenSpace(): boolean {
    return openSpaceId !== null;
}

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readLocalRaw(): string {
    if (!isClient()) return "";
    try {
        return localStorage.getItem(LS_KEY) ?? "";
    } catch {
        return "";
    }
}

function writeLocal(doc: DesktopsState): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(doc));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    try {
        window.dispatchEvent(new Event(DESKTOPS_EVENT));
    } catch {
        /* noop */
    }
}

export interface SharedDesktopSpaceState {
    /** El espacio abierto, o null si no hay ninguno / aún cargando. */
    space: Space | null;
    loading: boolean;
    /** true si el espacio existe pero el visitante no tiene acceso de edición (RLS lo tratará como solo-lectura). */
    title: string | null;
}

/**
 * Hook de montaje único en DesktopCanvas: si `spaceId` es no-nulo, entra en
 * modo colaborativo (restaura al desmontar). Si es null, no-op total (el
 * comportamiento normal de escritorios por perfil sigue intacto).
 */
export function useSharedDesktopSpace(spaceId: string | null): SharedDesktopSpaceState {
    const [space, setSpace] = useState<Space | null>(null);
    const [loading, setLoading] = useState(!!spaceId);
    const savedLocalRaw = useRef<string | null>(null);
    const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!spaceId) {
            setOpenSpaceId(null);
            return;
        }
        let alive = true;
        setOpenSpaceId(spaceId);
        savedLocalRaw.current = readLocalRaw(); // preserva el escritorio personal actual

        setLoading(true);
        void acceptSpaceInvite(spaceId); // best-effort: invited→member al abrir
        void getSpace(spaceId).then((sp) => {
            if (!alive) return;
            setSpace(sp);
            setLoading(false);
            if (sp) {
                const normalized = normalizeState(sp.doc);
                if (normalized) writeLocal(normalized);
            }
        });

        const unsubRemote = subscribeSpace(spaceId, (sp) => {
            if (!alive) return;
            setSpace(sp);
            const normalized = normalizeState(sp.doc);
            if (normalized) writeLocal(normalized);
        });

        const schedulePush = () => {
            if (pushTimer.current) clearTimeout(pushTimer.current);
            pushTimer.current = setTimeout(() => {
                const raw = readLocalRaw();
                if (!raw) return;
                try {
                    const parsed = JSON.parse(raw);
                    void updateSpaceDoc(spaceId, parsed);
                } catch {
                    /* doc local corrupto: no empujamos basura */
                }
            }, PUSH_DEBOUNCE_MS);
        };
        const onLocalChange = () => schedulePush();
        const onStorage = (e: StorageEvent) => {
            if (e.key === LS_KEY || e.key === null) schedulePush();
        };
        window.addEventListener(DESKTOPS_EVENT, onLocalChange);
        window.addEventListener("storage", onStorage);

        return () => {
            alive = false;
            setOpenSpaceId(null);
            unsubRemote();
            window.removeEventListener(DESKTOPS_EVENT, onLocalChange);
            window.removeEventListener("storage", onStorage);
            if (pushTimer.current) clearTimeout(pushTimer.current);
            // Restaura el escritorio personal previo (el del perfil activo).
            if (savedLocalRaw.current && isClient()) {
                try {
                    localStorage.setItem(LS_KEY, savedLocalRaw.current);
                    window.dispatchEvent(new Event(DESKTOPS_EVENT));
                } catch {
                    /* noop */
                }
            }
        };
    }, [spaceId]);

    return { space, loading, title: space?.title ?? null };
}
