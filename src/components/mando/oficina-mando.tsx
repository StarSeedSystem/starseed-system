"use client";

/**
 * oficina-mando.tsx — Oficina 3D del Puente de Mando (Ola 272 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * La sala donde viven los seres reales de la orquestación: escritores y
 * revisores del enjambre, los cinco agentes 1.58, las personalidades, los
 * procesos de fondo y el núcleo BitNet, cada uno en su sala según lo que hace
 * ahora mismo. A la izquierda la escena 3D (`OficinaSeres`), a la derecha la
 * ficha del ser elegido y debajo la tabla de evolución por niveles.
 *
 * Sondea `GET /api/mando/oficina` cada 15 s (nunca con la pestaña oculta) y
 * cruza con `/api/mando/voces`, `/api/mando/agentes-158` y
 * `/api/mando/ramificacion` para los datos vivos por tipo.
 *
 * Three.js se monta con `next/dynamic` (ssr: false) y solo cuando la pestaña
 * está abierta; el resto de la consola no lo carga.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Filter } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActividadOcupante, OcupanteOficina, SerListado } from "@/lib/astraura/genesis-types";
import type { GenomaSer, TipoSer } from "@/lib/mando/oficina";
import type { VozDeAgente } from "@/lib/mando/voz-mando";
import type { Rama158 } from "@/lib/mando/agentes-158";
import type { LatidoTarea } from "@/lib/mando/tipos";
import { FichaSerMando, type DetalleVivoSer } from "@/components/mando/ficha-ser-mando";

const OficinaSeres = dynamic(
    () => import("@/components/astraura/genesis/oficina/oficina-seres").then((m) => m.OficinaSeres),
    { ssr: false },
);

/** Respuesta de `GET /api/mando/oficina`. */
interface DatosOficina {
    t: string;
    estado: { salas: import("@/lib/astraura/genesis-types").SalaOficina[]; ocupantes: OcupanteOficina[]; actualizadoEn: number; datosReales: boolean };
    seres: SerListado[];
    genomas: GenomaSer[];
}

interface OficinaMandoProps {
    alCambiarPestana: (id: string) => void;
}

/** Colores de las salas del Mando, para la leyenda (mismo orden que `SALAS_MANDO`). */
const COLOR_POR_SALA: Record<string, string> = {
    enjambre: "#39FF14",
    revision: "#FFBF00",
    aprendizaje: "#007FFF",
    personalidades: "#A855F7",
    fondo: "#10B981",
    nucleo: "#DC143C",
    espera: "#94A3B8",
};

/** «Hace cuánto», compacto. */
function haceCuanto(desde: number | null): string {
    if (desde == null) return "—";
    const s = Math.max(0, Math.round((Date.now() - desde) / 1000));
    if (s < 60) return "ahora";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
}

/** etiqueta de tipo legible. */