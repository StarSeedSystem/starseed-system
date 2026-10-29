'use client';

/**
 * StarSeed XR · CALIDAD DINÁMICA EN VIVO (XR1010AE, contrato `architecture/starseed-xr.md` §3 d).
 * Cascarón fino sobre `medidor-fotogramas.ts` (la LÓGICA es pura y está probada): registra cada
 * fotograma en el medidor y, a 2 Hz, lo repasa por el núcleo puro (`siguienteCalidad`).
 *
 * - Si el nivel cambia, aplica EN CALIENTE foveación y refresco (`ajustesDePerfil`/`aplicarASesion`);
 *   la escala de resolución NO se toca a mitad de sesión (se aplica al crear la sesión siguiente).
 * - Publica el nuevo `PerfilCalidad` y el motivo del cambio para que la escena lo muestre;
 *   XR1010AS lo cablea al `NivelCalidadContext` y a la sesión real.
 * - `usePrefsXR().calidad.modo` manda: `auto` deja decidir; un nivel fijo congela la calidad.
 * - Batería (`navigator.getBattery`, Chromium) y memoria (`deviceMemory`) se leen solo si existen
 *   y alimentan `nivelInicial` al arrancar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { PerfilDispositivo } from "@/lib/xr/calidad";
import { perfilDeNivel } from "@/lib/xr/calidad";
import type { PerfilCalidad } from "@/lib/xr/calidad-perfiles";
import type { PlataformaVisor } from "@/lib/xr/tipos";
import { ajustesDePerfil, aplicarASesion, type RendererAjustable, type SesionAjustable } from "./aplicar-perfil";
import {
    avisoDeCambio, crearMedidor, derivarTermica, estadoArranque, perfilArranque, evolucionarCalidad,
    INTERVALO_TOMA_MS, type MedidorFotogramas, type ModoCalidad, type Termica,
} from "./medidor-fotogramas";
import { usePrefsXR } from "./use-prefs-xr";

export interface OpcionesCalidadDinamica {
    /** Refresco objetivo actual del visor; por defecto el del perfil de arranque. */
    refrescoHz?: number;
    /** Refrescos que admite la sesión (`session.supportedFrameRates`). */
    soportados?: readonly number[];
    /** Sesión y renderer reales, inyectados por XR1010AS; si faltan no se aplica en caliente. */
    sesion?: SesionAjustable | null;
    renderer?: RendererAjustable | null;
    /** `usePrefsXR().calidad.modo` por defecto: `auto` decide, un nivel fijo congela. */
    modo?: ModoCalidad;
    /** Plataforma para `nivelInicial`; por defecto `desconocida`. */
    plataforma?: PlataformaVisor;
    /** Publicación a la escena: XR1010AS lo ajustará al `NivelCalidadContext`. */
    alPublicar?: (perfil: PerfilCalidad, aviso: string | null) => void;
}

export interface CalidadDinamica {
    perfil: PerfilCalidad;
    /** Último aviso de cambio (con el motivo), o `null` si no queda ninguno visible. */
    aviso: string | null;
    /** Térmica inferida de fotogramas lentos sostenidos (nunca una lectura real). */
    termica: Termica;
    medidor: MedidorFotogramas;
}

interface BateriaNavegador {
    level: number;
    charging: boolean;
    addEventListener(tipo: string, fn: () => void): void;
    removeEventListener(tipo: string, fn: () => void): void;
}

const SIN_SOPORTADOS: readonly number[] = [];

export function useCalidadDinamica(o: OpcionesCalidadDinamica = {}): CalidadDinamica {
    const prefs = usePrefsXR();
    const modo: ModoCalidad = o.modo ?? prefs.calidad.modo;
    const medidor = useMemo(() => crearMedidor(), []);
    const [dispositivo, setDispositivo] = useState<PerfilDispositivo>(() => ({
        ...leerMemoria(), plataforma: o.plataforma ?? "desconocida",
    }));
    const [perfil, setPerfil] = useState<PerfilCalidad>(() => perfilArranque(modo, dispositivo));
    const [aviso, setAviso] = useState<string | null>(null);
    const [termica, setTermica] = useState<Termica>("nominal");
    const estado = useRef(estadoArranque(modo, dispositivo));
    const marca = useRef(0); // medidor.t() de la toma anterior
    const proxima = useRef(0); // tiempo del medidor de la próxima toma (2 Hz)
    const hechoCambio = useRef(false); // ya mandó el núcleo: las señales del aparato no re-derivan
    const publicar = useRef(o.alPublicar);
    const hzs = useRef(o.refrescoHz);
    const sos = useRef(o.soportados);
    const sesion = useRef(o.sesion);
    const renderer = useRef(o.renderer);
    const historialTermica = useRef<Array<{ ms: number; presupuestoMs: number }>>([]);

    publicar.current = o.alPublicar;
    hzs.current = o.refrescoHz;
    sos.current = o.soportados;
    sesion.current = o.sesion;
    renderer.current = o.renderer;

    const arrancar = () => {
        setPerfil(perfilArranque(modo, dispositivo));
        estado.current = estadoArranque(modo, dispositivo);
        publicar.current?.(perfilArranque(modo, dispositivo), null);
    };
    // Señales del aparato o decisión de la persona: re-deriva el nivel inicial. A mitad de sesión, con
    // modo automático y un cambio ya hecho, NO (rompería el cerrojo y podría oscilar).
    useEffect(() => {
        if (modo === "auto" && hechoCambio.current) return;
        arrancar();
    }, [modo, dispositivo]);
    // Batería y memoria (solo Chromium): al resolver, alimentan `nivelInicial`.
    useEffect(() => {
        const nav = navigator as Navigator & { getBattery?: () => Promise<BateriaNavegador> };
        let bateria: BateriaNavegador | null = null;
        const oir = () => { if (bateria) setDispositivo((d) => ({ ...d, bateria: bateria.level, cargando: bateria.charging })); };
        nav.getBattery?.().then((b) => { bateria = b; oir(); b.addEventListener("levelchange", oir); b.addEventListener("chargingchange", oir); }, () => undefined);
        return () => {
            if (bateria) { bateria.removeEventListener("levelchange", oir); bateria.removeEventListener("chargingchange", oir); }
        };
    }, []);
    // Al aparecer la sesión (o cambiar el perfil), aplica el perfil actual; cada llamada va en su try.
    useEffect(() => {
        if (!sesion.current || !renderer.current) return;
        const a = ajustesDePerfil(perfil, sos.current);
        aplicarASesion(sesion.current, renderer.current, { foveacion: a.foveacion, frameRate: a.frameRate });
    }, [sesion.current, renderer.current, perfil]);
    // El aviso es breve: se apaga solo.
    useEffect(() => {
        if (!aviso) return;
        const reloj = setTimeout(() => setAviso(null), 6000);
        return () => clearTimeout(reloj);
    }, [aviso]);

    useFrame((_s, delta) => {
        medidor.registrar(delta * 1000);
        const t = medidor.t();
        if (t < proxima.current) return; // 2 Hz: entre tomas solo se mide
        proxima.current = t + INTERVALO_TOMA_MS;
        const hz = hzs.current ?? perfil.refrescoPreferidoHz;
        const soportados = sos.current ?? SIN_SOPORTADOS;
        const toma = { t, periodos: medidor.desde(marca.current), refrescoHz: hz, soportados };
        marca.current = t;
        const evo = evolucionarCalidad(modo, toma, estado.current);
        estado.current = evo.estado;
        historialTermica.current = [...historialTermica.current.slice(-19), { ms: medidor.media(), presupuestoMs: medidor.presupuesto(hz) }];
        setTermica(derivarTermica(historialTermica.current));
        if (!evo.cambio) return;
        hechoCambio.current = true;
        const nuevo = perfilDeNivel(evo.estado.nivel);
        const motivoAviso = avisoDeCambio(evo.cambio);
        setPerfil(nuevo);
        setAviso(motivoAviso);
        if (sesion.current && renderer.current) {
            const a = ajustesDePerfil(nuevo, soportados);
            aplicarASesion(sesion.current, renderer.current, { foveacion: a.foveacion, frameRate: a.frameRate });
        }
        publicar.current?.(nuevo, motivoAviso);
    });

    return { perfil, aviso, termica, medidor };
}

/** `deviceMemory` (GB aprox.) si existe; sin él, nada cuenta. */
function leerMemoria(): Pick<PerfilDispositivo, "memoriaGB" | undefined> {
    const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number });
    return nav?.deviceMemory === undefined ? {} : { memoriaGB: nav.deviceMemory };
}
