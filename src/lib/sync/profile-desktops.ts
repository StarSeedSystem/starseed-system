"use client";

/*
 * profile-desktops — ESCRITORIOS ANCLADOS A PERFIL (SOP §10).
 * ═══════════════════════════════════════════════════════════════════════════
 * El doc local `starseed.desktops.v1` (desktop-store.ts) se ancla al PERFIL
 * ACTIVO: cada perfil de la cuenta tiene su propio conjunto de escritorios,
 * espejado en `entity_state(profile:<activeProfileId>, 'desktops')` con
 * realtime bidireccional (LWW por rev, anti-eco por deviceId — contrato de
 * src/lib/sync/entity-state.ts, sin reimplementarlo).
 *
 * Comportamiento:
 *  · Al cambiar de perfil activo (evento 'starseed:profile'): se guarda el
 *    doc actual bajo el perfil ANTERIOR (best-effort) y se carga el doc del
 *    perfil NUEVO en localStorage (sustituyendo `starseed.desktops.v1`),
 *    disparando el evento 'starseed:desktops' para que desktop-store.ts/
 *    desktop-canvas.tsx se refresquen solos (no se toca ese archivo).
 *  · Escrituras locales del doc de escritorios (mientras un perfil está
 *    activo) se reflejan a la nube con debounce, igual que el resto del
 *    sistema de sync (patrón realtime-sync.ts).
 *  · Cambios remotos de OTRO dispositivo con el MISMO perfil activo llegan
 *    vía subscribeEntityState y se aplican en vivo.
 *  · MIGRACIÓN NO DESTRUCTIVA: la primera vez que se resuelve un perfil
 *    activo y NO existe todavía entity_state(profile:<id>,'desktops') pero SÍ
 *    hay un doc local con escritorios, ese doc local se copia como semilla
 *    del perfil (los escritorios actuales del usuario NUNCA se pierden).
 *  · Respeta la config de sync por perfiles (sync-profiles-config.ts): si el
 *    perfil activo está excluido o la sección 'desktops' está deshabilitada
 *    en este tipo de dispositivo, el espejo a la nube se omite (el doc local
 *    sigue funcionando, solo no via ja a entity_state).
 *
 * Montaje: un solo hook `useProfileDesktopsSync()` en desktop-canvas.tsx (o
 * en la página /escritorios), junto a `useDesktopsBackup()` existente. No
 * sustituye ese respaldo de cuenta (user_settings.prefs.desktops) — coexiste
 * (ámbitos distintos: cuenta vs. perfil).
 */

import { useEffect, useRef, useState } from "react";
import {
    getEntityState,
    setEntityState,
    subscribeEntityState,
    deviceId,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { normalizeState, type DesktopsState } from "@/components/desktop/desktop-store";
import {
    activeProfileId,
    PROFILE_ACTIVE_EVENT,
    ensureDefaultProfile,
} from "@/lib/profiles/profiles";
import { shouldSyncKey } from "@/lib/sync/sync-profiles-config";
import { hasOpenSpace, SPACE_TOGGLE_EVENT } from "@/lib/sync/shared-desktop-space";

const LS_KEY = "starseed.desktops.v1";
const DESKTOPS_EVENT = "starseed:desktops";
const PUSH_DEBOUNCE_MS = 1500;

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readLocalDoc(): DesktopsState | null {
    if (!isClient()) return null;
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        return normalizeState(JSON.parse(raw));
    } catch {
        return null;
    }
}

function writeLocalDoc(doc: DesktopsState, emit = true): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(doc));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    if (emit) {
        try {
            window.dispatchEvent(new Event(DESKTOPS_EVENT));
        } catch {
            /* noop */
        }
    }
}

function profileRef(profileId: string): EntityRef {
    return { kind: "profile", id: profileId };
}

/** Guarda (best-effort) el doc actual bajo el perfil dado. Nunca lanza. */
async function saveDocToProfile(profileId: string): Promise<void> {
    const doc = readLocalDoc();
    if (!doc || doc.desktops.length === 0) return;
    if (!shouldSyncKey(LS_KEY, profileId)) return; // gating por config de sync (SOP §10)
    try {
        await setEntityState(profileRef(profileId), "desktops", doc);
    } catch {
        /* best-effort */
    }
}

/** Carga el doc de un perfil a localStorage. Devuelve true si había doc remoto. */
async function loadDocFromProfile(profileId: string): Promise<boolean> {
    try {
        const row = await getEntityState<DesktopsState>(profileRef(profileId), "desktops");
        if (!row || !row.value) return false;
        const normalized = normalizeState(row.value);
        if (!normalized) return false;
        writeLocalDoc(normalized);
        return true;
    } catch {
        return false;
    }
}

/**
 * Cambia el perfil activo de escritorios: guarda el doc bajo `fromProfileId`
 * (si lo hay) y carga el doc de `toProfileId` (o, si no existe todavía,
 * MIGRA el doc local actual como semilla no destructiva del nuevo perfil).
 */
async function switchProfileDesktops(fromProfileId: string | null, toProfileId: string): Promise<void> {
    if (fromProfileId && fromProfileId !== toProfileId) {
        await saveDocToProfile(fromProfileId);
    }
    const hadRemote = await loadDocFromProfile(toProfileId);
    if (!hadRemote) {
        // Sin doc remoto para este perfil todavía: el doc local actual (si
        // existe) se conserva como semilla del perfil — NUNCA se borra.
        await saveDocToProfile(toProfileId);
    }
}

/**
 * Hook de montaje único (p. ej. en DesktopCanvas o en la página /escritorios).
 * Gestiona: siembra inicial (perfil por defecto), cambio de perfil activo,
 * push con debounce de cambios locales, y aplicar cambios remotos en vivo.
 * Defensivo/SSR-safe: nunca lanza; sin sesión, degrada a un no-op silencioso
 * (el escritorio local sigue funcionando exactamente igual que antes).
 */
export function useProfileDesktopsSync(): void {
    const currentProfileRef = useRef<string | null>(null);
    const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bootstrapped = useRef(false);
    // Se incrementa cada vez que un espacio compartido se abre/cierra
    // (shared-desktop-space.ts) para que este efecto se re-evalúe: si el
    // usuario navega entre un escritorio personal y uno compartido SIN
    // remontar el componente, el guard hasOpenSpace() se vuelve a comprobar.
    const [spaceToggleTick, setSpaceToggleTick] = useState(0);
    useEffect(() => {
        if (!isClient()) return;
        const onToggle = () => setSpaceToggleTick((t) => t + 1);
        window.addEventListener(SPACE_TOGGLE_EVENT, onToggle);
        return () => window.removeEventListener(SPACE_TOGGLE_EVENT, onToggle);
    }, []);

    useEffect(() => {
        if (!isClient()) return;
        if (hasOpenSpace()) return; // un espacio compartido (shared-desktop-space.ts) ya posee la clave local
        let alive = true;
        let unsubRemote: (() => void) | null = null;

        const attachRemoteSub = (profileId: string) => {
            unsubRemote?.();
            unsubRemote = subscribeEntityState<DesktopsState>(profileRef(profileId), "desktops", (change) => {
                if (change.self) return; // anti-eco: nuestro propio push ya está aplicado localmente
                if (!alive) return;
                if (!shouldSyncKey(LS_KEY, profileId)) return; // gating por config de sync
                const normalized = normalizeState(change.value);
                if (!normalized) return;
                writeLocalDoc(normalized);
            });
        };

        const bootstrap = async () => {
            // Requisito del SOP §10: siembra un perfil por defecto si la cuenta
            // no tiene ninguno todavía (no-op sin sesión).
            const seeded = await ensureDefaultProfile();
            const resolvedId = activeProfileId() ?? seeded?.id ?? null;
            if (!resolvedId) return; // sin sesión / sin perfiles: el doc local sigue siendo la única fuente
            currentProfileRef.current = resolvedId;
            if (!alive) return;
            const hadRemote = await loadDocFromProfile(resolvedId);
            if (!hadRemote) {
                // Migración no destructiva: el doc local actual (de antes de
                // que existieran los perfiles) se adopta como semilla del
                // perfil por defecto — los escritorios existentes NO se pierden.
                await saveDocToProfile(resolvedId);
            }
            attachRemoteSub(resolvedId);
            bootstrapped.current = true;
        };

        void bootstrap();

        // ── Cambio de perfil activo (evento 'starseed:profile') ──
        const onProfileChange = (e: Event) => {
            const detail = (e as CustomEvent<{ id: string } | undefined>).detail;
            const nextId = detail?.id ?? activeProfileId();
            if (!nextId || nextId === currentProfileRef.current) return;
            const prevId = currentProfileRef.current;
            currentProfileRef.current = nextId;
            void switchProfileDesktops(prevId, nextId).then(() => {
                if (alive) attachRemoteSub(nextId);
            });
        };
        window.addEventListener(PROFILE_ACTIVE_EVENT, onProfileChange);

        // ── Push con debounce de cambios locales del doc de escritorios ──
        const schedulePush = () => {
            const profileId = currentProfileRef.current;
            if (!profileId || !bootstrapped.current) return;
            if (pushTimer.current) clearTimeout(pushTimer.current);
            pushTimer.current = setTimeout(() => {
                void saveDocToProfile(profileId);
            }, PUSH_DEBOUNCE_MS);
        };
        const onLocalDesktopsChange = () => schedulePush();
        const onStorage = (e: StorageEvent) => {
            if (e.key === LS_KEY || e.key === null) schedulePush();
        };
        window.addEventListener(DESKTOPS_EVENT, onLocalDesktopsChange);
        window.addEventListener("storage", onStorage);

        return () => {
            alive = false;
            window.removeEventListener(PROFILE_ACTIVE_EVENT, onProfileChange);
            window.removeEventListener(DESKTOPS_EVENT, onLocalDesktopsChange);
            window.removeEventListener("storage", onStorage);
            if (pushTimer.current) clearTimeout(pushTimer.current);
            unsubRemote?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- spaceToggleTick fuerza reevaluar hasOpenSpace(); sin más deps externas
    }, [spaceToggleTick]);
}

/** Id del dispositivo (reexportado por conveniencia para UI de depuración). */
export { deviceId as profileDesktopsDeviceId };
