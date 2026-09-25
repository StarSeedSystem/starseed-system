"use client";

/**
 * MI PUENTE DE MANDO — el panel de cada persona para controlar SU StarSeed OS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex (2026-09-25): «desarrollar otra versión para las cuentas de los usuarios
 * de StarSeed con diferentes páginas y opciones completamente especializadas
 * para cualquier usuario de manera segura y eficiente, con un UI y UX fácil de
 * comprender e intuitivo».
 *
 * A diferencia del Mando del PROYECTO (consola de desarrollo, acceso único del
 * equipo), aquí solo se toca lo de la propia persona y con las mismas puertas
 * que el resto del OS: sus neuronas (RLS por dueño), sus apps, sus carpetas,
 * sus perfiles y sus preferencias. Nada de procesos del servidor ni de claves.
 *
 * Páginas: Inicio · Dispositivos · Apps · Archivos y sincronización · Perfiles
 * · Privacidad y seguridad · Personalizar. Inicio carga con el panel; el resto
 * se descarga al abrirla por primera vez (móvil primero: menos que bajar).
 * Código abierto: cualquiera puede leer y mejorar este panel en
 * src/components/mi-mando/ (lógica pura y probada en src/lib/mi-mando/).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AppWindow,
    CircleUser,
    FolderSync,
    LayoutDashboard,
    Network,
    ShieldCheck,
    SlidersHorizontal,
    type LucideIcon,
} from "lucide-react";

import { useAccount } from "@/context/account-context";
import { paginasVisibles, type IdPagina } from "@/lib/mi-mando/paginas";

import { ProveedorMiMando, useMiMando } from "./contexto";
import { Pestanas, idPanel, idPestana, type PestanaItem } from "./pestanas";
import { Cargando } from "./piezas";
import { PaginaInicio } from "./pagina-inicio";
import { useAjustesMiMando, type EstadoGuardado } from "./use-ajustes-mi-mando";
import type { AjustesMiMando } from "@/lib/mi-mando/paginas";

const PaginaNeuronas = lazy(() => import("./pagina-neuronas"));
const PaginaApps = lazy(() => import("./pagina-apps"));
const PaginaArchivos = lazy(() => import("./pagina-archivos"));
const PaginaPerfiles = lazy(() => import("./pagina-perfiles"));
const PaginaPrivacidad = lazy(() => import("./pagina-privacidad"));
const PaginaPersonalizar = lazy(() => import("./pagina-personalizar"));

const ICONOS: Record<IdPagina, LucideIcon> = {
    inicio: LayoutDashboard,
    neuronas: Network,
    apps: AppWindow,
    archivos: FolderSync,
    perfiles: CircleUser,
    privacidad: ShieldCheck,
    personalizar: SlidersHorizontal,
};

/** Cuánto se queda visible un mensaje en la barra de estado. */
const DURACION_MENSAJE_MS = 8000;

function Contenido({
    activa,
    ajustes,
    cambiar,
    estado,
    mensaje,
    alCambiar,
    visibles,
}: {
    activa: IdPagina;
    ajustes: AjustesMiMando;
    cambiar: (a: AjustesMiMando) => void;
    estado: EstadoGuardado;
    mensaje: string;
    alCambiar: (id: IdPagina) => void;
    visibles: ReturnType<typeof paginasVisibles>;
}) {
    const { avisos } = useMiMando();
    const items: PestanaItem[] = visibles.map((p) => ({
        id: p.id,
        etiqueta: p.etiqueta,
        icono: ICONOS[p.id],
        insignia: p.id === "inicio" ? avisos.filter((a) => a.tono === "atencion").length : undefined,
    }));

    return (
        <div className="space-y-4">
            <Pestanas items={items} activa={activa} alCambiar={alCambiar} />

            {/* Resultado de la última acción: visible y leído por lectores de pantalla. */}
            <p
                aria-live="polite"
                role="status"
                className={mensaje ? "rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100" : "sr-only"}
            >
                {mensaje}
            </p>

            <div id={idPanel(activa)} role="tabpanel" aria-labelledby={idPestana(activa)} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-2xl">
                <Suspense fallback={<Cargando texto="Abriendo la página…" />}>
                    {activa === "inicio" && <PaginaInicio />}
                    {activa === "neuronas" && <PaginaNeuronas />}
                    {activa === "apps" && <PaginaApps />}
                    {activa === "archivos" && <PaginaArchivos />}
                    {activa === "perfiles" && <PaginaPerfiles />}
                    {activa === "privacidad" && <PaginaPrivacidad />}
                    {activa === "personalizar" && <PaginaPersonalizar ajustes={ajustes} cambiar={cambiar} estado={estado} />}
                </Suspense>
            </div>
        </div>
    );
}

export function MiPuenteDeMando() {
    const { user } = useAccount();
    const { ajustes, cambiar, estado } = useAjustesMiMando(user?.id ?? null);
    const visibles = useMemo(() => paginasVisibles(ajustes), [ajustes]);
    const [activa, setActiva] = useState<IdPagina>("inicio");
    const [mensaje, setMensaje] = useState("");
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (temporizador.current) clearTimeout(temporizador.current);
        },
        [],
    );

    const anunciar = useCallback((texto: string) => {
        setMensaje(texto);
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => setMensaje(""), DURACION_MENSAJE_MS);
    }, []);

    const irA = useCallback(
        (id: IdPagina) => {
            // Un aviso puede apuntar a una página oculta: se abre igual (es una acción explícita).
            setActiva(id);
            requestAnimationFrame(() => document.getElementById(idPestana(id))?.focus());
        },
        [],
    );

    // Una página oculta que está abierta (desde un aviso, o recién ocultada en
    // Personalizar) conserva su pestaña mientras siga abierta: quitarla de golpe
    // dejaría un panel sin pestaña que lo nombre. Al salir de ella, desaparece.
    const conActiva = useMemo(() => {
        if (visibles.some((p) => p.id === activa)) return visibles;
        return paginasVisibles({ ...ajustes, ocultas: ajustes.ocultas.filter((x) => x !== activa) });
    }, [visibles, activa, ajustes]);

    return (
        <ProveedorMiMando anunciar={anunciar} irA={irA}>
            <Contenido
                activa={activa}
                ajustes={ajustes}
                cambiar={cambiar}
                estado={estado}
                mensaje={mensaje}
                alCambiar={setActiva}
                visibles={conActiva}
            />
        </ProveedorMiMando>
    );
}
