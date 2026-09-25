"use client";

/**
 * Datos compartidos de «Mi Puente de Mando».
 * ─────────────────────────────────────────────────────────────────────────────
 * Inicio y Dispositivos leen la misma lista de neuronas; Inicio y Archivos
 * comparten el botón «Sincronizar ahora». Si cada página pidiera lo suyo, al
 * saltar entre pestañas se repetirían las sondas del dispositivo (IA local,
 * batería, almacenamiento) y dos sincronizaciones podrían pisarse. Por eso los
 * datos viven aquí, una sola vez, y las páginas solo los leen.
 *
 * Ritmo: la lista de neuronas se refresca cada 90 s (como el panel de Cerebro)
 * y solo con la pestaña visible: la presencia «en línea» del sistema cuenta
 * 3 min y cada refresco sondea la IA local de este dispositivo, así que más
 * frecuencia no aporta nada y gasta batería.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAccount } from "@/context/account-context";
import { listNeurons, NEURON_EVENT, thisDeviceId, type Neuron } from "@/lib/neurons/neurons";
import { syncNow as sincronizarBiblioteca } from "@/lib/library-sync";
import { sincronizarInstalaciones, useInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { pendientesPara, type DestinoInstalacion } from "@/lib/instalaciones/destinos";
import { listarCarpetas, suscribirCarpetas, type CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import {
    onRealtimeSyncStatus,
    syncNow as sincronizarAjustes,
    type RealtimeSyncState,
} from "@/lib/sync/realtime-sync";
import type { IdPagina } from "@/lib/mi-mando/paginas";
import { construirAvisos, fraccionUso, type Aviso } from "@/lib/mi-mando/avisos";

/** Última sincronización lanzada desde este panel (por dispositivo). */
const CLAVE_ULTIMA_SYNC = "starseed.mi-mando.ultima-sync.v1";
const REFRESCO_NEURONAS_MS = 90_000;

export interface DatosMiMando {
    sesion: { cargando: boolean; activa: boolean; correo: string | null; userId: string | null };
    neuronas: { lista: Neuron[]; cargando: boolean; refrescar: () => Promise<void> };
    sincronizacion: {
        ultima: number | null;
        enCurso: boolean;
        tiempoReal: RealtimeSyncState;
        sincronizar: () => Promise<void>;
    };
    /** Espacio del navegador para StarSeed en ESTE dispositivo (null = no medible). */
    almacenamiento: {
        usado: number | null;
        cuota: number | null;
        persistente: boolean | null;
        refrescar: () => Promise<void>;
    };
    carpetas: CarpetaVinculada[];
    /** Dónde vive cada app (lista sincronizada con la cuenta). */
    destinos: DestinoInstalacion[];
    /** Instalaciones pedidas para ESTE dispositivo que esperan su «sí». */
    pendientesAqui: DestinoInstalacion[];
    avisos: Aviso[];
    /** Mensaje para lectores de pantalla y la barra de estado visible. */
    anunciar: (mensaje: string) => void;
    /** Cambia de página (para los avisos de Inicio). */
    irA: (pagina: IdPagina) => void;
}

const Contexto = createContext<DatosMiMando | null>(null);

export function useMiMando(): DatosMiMando {
    const v = useContext(Contexto);
    if (!v) throw new Error("useMiMando debe usarse dentro de <ProveedorMiMando>");
    return v;
}

function leerUltimaSync(): number | null {
    try {
        const n = Number(window.localStorage.getItem(CLAVE_ULTIMA_SYNC));
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

function guardarUltimaSync(ms: number): void {
    try {
        window.localStorage.setItem(CLAVE_ULTIMA_SYNC, String(ms));
    } catch {
        /* modo privado: se recuerda solo en memoria */
    }
}

export function ProveedorMiMando({
    children,
    anunciar,
    irA,
}: {
    children: ReactNode;
    anunciar: (mensaje: string) => void;
    irA: (pagina: IdPagina) => void;
}) {
    const { user, loading } = useAccount();
    const userId = user?.id ?? null;
    const correo = user?.email ?? null;

    /* ── Neuronas ─────────────────────────────────────────────────────────── */
    const [neuronas, setNeuronas] = useState<Neuron[]>([]);
    const [cargandoNeuronas, setCargandoNeuronas] = useState(true);
    const vivo = useRef(true);

    const refrescar = useCallback(async () => {
        try {
            const lista = await listNeurons();
            if (vivo.current) setNeuronas(lista);
        } catch {
            /* listNeurons ya degrada sola; esto es solo por si acaso */
        }
        if (vivo.current) setCargandoNeuronas(false);
    }, []);

    useEffect(() => {
        vivo.current = true;
        return () => {
            vivo.current = false;
        };
    }, []);

    // Primera carga y cada vez que cambia la sesión (entrar/salir cambia la lista).
    useEffect(() => {
        if (loading) return;
        void refrescar();
    }, [loading, userId, refrescar]);

    // Cambios locales de nombre/permisos → refresco agrupado; y latido suave.
    useEffect(() => {
        let t: ReturnType<typeof setTimeout> | null = null;
        const alCambiar = () => {
            if (t) clearTimeout(t);
            t = setTimeout(() => void refrescar(), 500);
        };
        window.addEventListener(NEURON_EVENT, alCambiar);
        const intervalo = setInterval(() => {
            if (document.visibilityState === "hidden") return;
            void refrescar();
        }, REFRESCO_NEURONAS_MS);
        return () => {
            if (t) clearTimeout(t);
            clearInterval(intervalo);
            window.removeEventListener(NEURON_EVENT, alCambiar);
        };
    }, [refrescar]);

    /* ── Sincronización ───────────────────────────────────────────────────── */
    const [ultima, setUltima] = useState<number | null>(() => (typeof window === "undefined" ? null : leerUltimaSync()));
    const [enCurso, setEnCurso] = useState(false);
    const [tiempoReal, setTiempoReal] = useState<RealtimeSyncState>("idle");
    const enCursoRef = useRef(false);

    useEffect(() => {
        const quitar = onRealtimeSyncStatus((s) => setTiempoReal(s.state));
        return () => {
            quitar();
        };
    }, []);

    const sincronizar = useCallback(async () => {
        if (enCursoRef.current) return;
        if (!userId) {
            anunciar("Inicia sesión para sincronizar con tu cuenta. En este dispositivo todo sigue guardado.");
            return;
        }
        enCursoRef.current = true;
        setEnCurso(true);
        anunciar("Sincronizando con tu cuenta…");
        // Tres canales independientes: si uno falla, los otros siguen.
        const [biblioteca, instalaciones, ajustes] = await Promise.allSettled([
            sincronizarBiblioteca(),
            sincronizarInstalaciones(),
            sincronizarAjustes(),
        ]);
        const fallos: string[] = [];
        if (biblioteca.status === "rejected") fallos.push("la biblioteca");
        if (instalaciones.status === "rejected") fallos.push("las instalaciones");
        if (ajustes.status === "rejected") fallos.push("los ajustes");
        const ahora = Date.now();
        if (fallos.length < 3) {
            guardarUltimaSync(ahora);
            if (vivo.current) setUltima(ahora);
        }
        const recibidos = ajustes.status === "fulfilled" ? ajustes.value.applied : 0;
        const sitios = instalaciones.status === "fulfilled" ? instalaciones.value.length : 0;
        anunciar(
            fallos.length === 0
                ? `Sincronización completa: biblioteca y apps al día, ${sitios} ${sitios === 1 ? "instalación" : "instalaciones"} y ${recibidos} ${recibidos === 1 ? "ajuste recibido" : "ajustes recibidos"}.`
                : `Sincronización incompleta: no respondió ${fallos.join(", ")}. Vuelve a intentarlo en un momento.`,
        );
        enCursoRef.current = false;
        if (vivo.current) setEnCurso(false);
    }, [userId, anunciar]);

    /* ── Almacenamiento de este dispositivo ───────────────────────────────── */
    const [usado, setUsado] = useState<number | null>(null);
    const [cuota, setCuota] = useState<number | null>(null);
    const [persistente, setPersistente] = useState<boolean | null>(null);

    const refrescarAlmacenamiento = useCallback(async () => {
        try {
            const est = await navigator.storage?.estimate?.();
            if (vivo.current && est) {
                setUsado(typeof est.usage === "number" ? est.usage : null);
                setCuota(typeof est.quota === "number" ? est.quota : null);
            }
        } catch {
            /* navegador sin Storage API: se queda en «no medible» */
        }
        try {
            const p = await navigator.storage?.persisted?.();
            if (vivo.current && typeof p === "boolean") setPersistente(p);
        } catch {
            /* idem */
        }
    }, []);

    useEffect(() => {
        void refrescarAlmacenamiento();
    }, [refrescarAlmacenamiento]);

    /* ── Carpetas vinculadas e instalaciones ──────────────────────────────── */
    const [carpetas, setCarpetas] = useState<CarpetaVinculada[]>(() => listarCarpetas());
    useEffect(() => suscribirCarpetas(setCarpetas), []);

    const destinos = useInstalaciones();
    const [esteId, setEsteId] = useState("");
    useEffect(() => setEsteId(thisDeviceId()), []);
    const pendientesAqui = useMemo(() => (esteId ? pendientesPara(esteId, destinos) : []), [esteId, destinos]);

    const avisos = useMemo(
        () =>
            construirAvisos({
                sesion: loading ? null : Boolean(userId),
                instalacionesPendientes: pendientesAqui.length,
                carpetasSinAcceso: carpetas.filter((c) => c.tipo === "dispositivo" && !c.vivo).length,
                usoAlmacenamiento: fraccionUso(usado ?? undefined, cuota ?? undefined),
                estadoSync: tiempoReal,
            }),
        [loading, userId, pendientesAqui.length, carpetas, usado, cuota, tiempoReal],
    );

    const valor = useMemo<DatosMiMando>(
        () => ({
            sesion: { cargando: loading, activa: Boolean(userId), correo, userId },
            neuronas: { lista: neuronas, cargando: cargandoNeuronas, refrescar },
            sincronizacion: { ultima, enCurso, tiempoReal, sincronizar },
            almacenamiento: { usado, cuota, persistente, refrescar: refrescarAlmacenamiento },
            carpetas,
            destinos,
            pendientesAqui,
            avisos,
            anunciar,
            irA,
        }),
        [
            loading, userId, correo, neuronas, cargandoNeuronas, refrescar, ultima, enCurso, tiempoReal, sincronizar,
            usado, cuota, persistente, refrescarAlmacenamiento, carpetas, destinos, pendientesAqui, avisos, anunciar, irA,
        ],
    );

    return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
