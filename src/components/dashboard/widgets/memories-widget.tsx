"use client";

// ════════════════════════════════════════════════════════════════
// MemoriesWidget — tu exocórtex como un escritorio de hojas (Ola 0929 · D)
// ----------------------------------------------------------------
// Memorias REALES (`memories`, con alcance a tu cuenta, en vivo por el hook
// compartido de os-live): cada una es una hoja del color de su tipo
// cognitivo (identidad, semántica, episódica, procedural, proyecto…) con
// las primeras líneas de su contenido de verdad (sin el frontmatter), si
// se sincroniza y dónde vive. Búsqueda, filtro por tipo y rejilla/lista
// en l/xl; el Hub de memorias, el mapa 3D y tu biblioteca a un toque.
//
// micro = cuántas · s = composición por tipo + la última · m = las cuatro
// últimas hojas · torre = columna · l = explorador · xl = composición +
// explorador · panorámico = composición + hojas en fila. Estados: cargando
// (rejilla), sin sesión, vacío con «Crear memoria»; sin error visible: el
// hook degrada a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { BookMarked, Library, Orbit } from "lucide-react";
import { useMyMemories, tsOf, type MemoryRow } from "@/lib/widget-data/os-live";
import { COGNITIVE_KINDS, cognitiveKindOfKinds, memoryTypeById, parseFrontmatter } from "@/lib/brains/memory-types";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono } from "./_social-d/piezas";
import { useExplorador, type ArchivoVista, type TipoArchivo } from "./_social-d/archivos-piezas";
import { DisposicionArchivos } from "./_social-d/disposicion-archivos";
import { plural } from "./_social-d/formato";

const ACENTO = "#007FFF";

const ALMACEN: Record<string, string> = { gdrive: "Drive", drive: "Drive", local: "Local", supabase: "Nube", nube: "Nube", syncthing: "Syncthing", github: "GitHub" };

/** Una memoria como hoja (PURO): tipo cognitivo, extracto sin frontmatter y marcas. */
export function hojaDeMemoria(m: MemoryRow): ArchivoVista {
    const cog = cognitiveKindOfKinds(m.kinds);
    const def = memoryTypeById(Array.isArray(m.kinds) ? m.kinds[0] : null);
    const tipo: TipoArchivo = { id: cog, etiqueta: COGNITIVE_KINDS[cog].label, color: COGNITIVE_KINDS[cog].color, icono: def.icon ?? BookMarked };
    let extracto: string | null = null;
    if (m.content) {
        try { extracto = parseFrontmatter(m.content).body.trim() || null; } catch { extracto = m.content; }
    }
    const almacenes = (Array.isArray(m.storage) ? m.storage : []).map((s) => ALMACEN[String(s).toLowerCase()] ?? String(s)).filter(Boolean);
    const marcas = [
        ...(m.sync ? [{ texto: "sincroniza", color: "#10b981" }] : []),
        ...(almacenes[0] ? [{ texto: almacenes[0] }] : []),
    ];
    return {
        id: m.id,
        nombre: m.name?.trim() || "Memoria sin nombre",
        tipo,
        detalle: [m.format ? m.format.toUpperCase() : null, almacenes.length ? almacenes.join(" + ") : null].filter(Boolean).join(" · ") || null,
        extracto,
        marcas,
        ms: tsOf(m.updated_at) || tsOf(m.created_at),
        href: "/memorias",
        buscable: `${(m.kinds ?? []).join(" ")} ${m.content?.slice(0, 400) ?? ""}`,
    };
}

export function MemoriesWidget() {
    const { rows, loading, authPending, needsAuth } = useMyMemories();
    const hojas = React.useMemo(() => rows.map(hojaDeMemoria).sort((a, b) => b.ms - a.ms), [rows]);
    const ex = useExplorador(hojas);
    const sincronizadas = rows.filter((m) => m.sync).length;
    const estado = estadoSocial({ sinSesion: needsAuth, cargando: authPending || loading, hayDatos: hojas.length > 0 });

    return (
        <MarcoSocial
            titulo="Memorias"
            subtitulo={`${plural(hojas.length, "memoria", "memorias")}${sincronizadas ? ` · ${sincronizadas} sincronizan` : ""}`}
            icono={BookMarked}
            categoria="archivos"
            acento={ACENTO}
            estado={estado}
            vivo
            esqueleto="rejilla"
            sinSesion={{ mensaje: "Entra para ver tus memorias y lo que recuerdan tus cerebros." }}
            vacio={{ icono: BookMarked, titulo: "Aún no hay memorias", mensaje: "Crea la primera en el Hub: una nota, un proyecto, quién eres… y conéctala a un cerebro.", accion: { etiqueta: "Crear memoria", href: "/memorias" } }}
            acciones={(t) => (
                <>
                    <BotonIcono icono={Orbit} etiqueta="Ver el mapa 3D de memorias" href="/memorias-3d" acento={t.acento} tactil={t.tactil} />
                    <BotonIcono icono={Library} etiqueta="Abrir tu biblioteca" href="/library?area=biblioteca" acento={t.acento} tactil={t.tactil} />
                </>
            )}
        >
            {(t) => (
                <DisposicionArchivos t={t} archivos={hojas} ex={ex}
                    textos={{ singular: "memoria", plural: "memorias", buscar: "Buscar en tus memorias…", hrefTodo: "/memorias", etiquetaTodo: "Abrir el Hub", icono: BookMarked }} />
            )}
        </MarcoSocial>
    );
}

export default MemoriesWidget;
