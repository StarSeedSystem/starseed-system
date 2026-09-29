"use client";

// ════════════════════════════════════════════════════════════════
// VaultsWidget — tus Baúles como cofres con lo que guardan (Ola 0929 · D)
// ----------------------------------------------------------------
// Baúles REALES (`vaults`, con alcance a tu cuenta, en vivo) con su
// contenido de verdad: las memorias que agrupan (`memories.vault_id`, del
// mismo hook compartido de memorias) y sus conexiones. Cada baúl es una
// hoja del color de su alcance (cuenta, perfil, grupo, página) cuya vista
// previa son los nombres de las memorias que contiene. Búsqueda, filtro por
// alcance y rejilla/lista en l/xl; Baúles y tu biblioteca a un toque.
//
// micro = cuántos · s = composición por alcance + el último · m = las
// cuatro últimas hojas · torre = columna · l = explorador · xl =
// composición + explorador · panorámico = composición + hojas en fila.
// Estados: cargando (rejilla), sin sesión, vacío con «Crear baúl»; sin
// error visible: los hooks degradan a lista vacía.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Library, Lock, Users, Globe2, UserRound, Vault } from "lucide-react";
import { useMyMemories, useMyVaults, tsOf, type MemoryRow, type VaultRow } from "@/lib/widget-data/os-live";
import { MarcoSocial, estadoSocial } from "./_social-d/marco-social";
import { BotonIcono } from "./_social-d/piezas";
import { useExplorador, type ArchivoVista, type TipoArchivo } from "./_social-d/archivos-piezas";
import { DisposicionArchivos } from "./_social-d/disposicion-archivos";
import { plural } from "./_social-d/formato";

const ACENTO = "#f59e0b";

const ALCANCE: Record<string, TipoArchivo> = {
    account: { id: "account", etiqueta: "Cuenta", icono: Lock, color: "#f59e0b" },
    profile: { id: "profile", etiqueta: "Perfil", icono: UserRound, color: "#ec4899" },
    group: { id: "group", etiqueta: "Grupo", icono: Users, color: "#10b981" },
    page: { id: "page", etiqueta: "Página", icono: Globe2, color: "#38bdf8" },
};

function conexiones(v: VaultRow): string[] {
    const c = v.connections as unknown;
    if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : (x as { name?: string; kind?: string })?.name ?? (x as { kind?: string })?.kind ?? "")).filter(Boolean);
    if (c && typeof c === "object") return Object.keys(c as Record<string, unknown>);
    return [];
}

/** Un baúl como hoja (PURO): su alcance, sus memorias y sus conexiones. */
export function hojaDeBaul(v: VaultRow, memorias: MemoryRow[]): ArchivoVista {
    const tipo = ALCANCE[(v.scope ?? "account").toLowerCase()] ?? ALCANCE.account;
    const dentro = memorias.filter((m) => m.vault_id === v.id);
    const cx = conexiones(v);
    return {
        id: v.id,
        nombre: v.name?.trim() || "Baúl sin nombre",
        tipo,
        detalle: [plural(dentro.length, "memoria", "memorias"), cx.length ? plural(cx.length, "conexión", "conexiones") : null].filter(Boolean).join(" · "),
        extracto: dentro.length ? dentro.slice(0, 4).map((m) => `· ${m.name ?? "memoria"}`).join("\n") : cx.length ? `Conecta: ${cx.slice(0, 4).join(", ")}` : "Vacío: añade memorias desde Baúles.",
        marcas: dentro.some((m) => m.sync) ? [{ texto: "sincroniza", color: "#10b981" }] : [],
        ms: tsOf(v.updated_at) || tsOf(v.created_at),
        href: "/baules",
        buscable: `${dentro.map((m) => m.name ?? "").join(" ")} ${cx.join(" ")}`,
    };
}

export function VaultsWidget() {
    const baules = useMyVaults();
    const memorias = useMyMemories();
    const hojas = React.useMemo(() => baules.rows.map((v) => hojaDeBaul(v, memorias.rows)).sort((a, b) => b.ms - a.ms), [baules.rows, memorias.rows]);
    const ex = useExplorador(hojas);
    const guardadas = memorias.rows.filter((m) => m.vault_id).length;
    const estado = estadoSocial({ sinSesion: baules.needsAuth, cargando: baules.authPending || baules.loading, hayDatos: hojas.length > 0 });

    return (
        <MarcoSocial
            titulo="Baúles"
            subtitulo={`${plural(hojas.length, "baúl", "baúles")} · ${plural(guardadas, "memoria guardada", "memorias guardadas")}`}
            icono={Vault}
            categoria="archivos"
            acento={ACENTO}
            estado={estado}
            vivo
            esqueleto="rejilla"
            sinSesion={{ mensaje: "Entra para ver tus baúles y lo que guardan." }}
            vacio={{ icono: Vault, titulo: "Aún no hay baúles", mensaje: "Un baúl agrupa memorias de todo tipo y sus conexiones para llevarlas juntas a un cerebro.", accion: { etiqueta: "Crear baúl", href: "/baules" } }}
            acciones={(t) => <BotonIcono icono={Library} etiqueta="Abrir tu biblioteca" href="/library?area=biblioteca" acento={t.acento} tactil={t.tactil} />}
        >
            {(t) => (
                <DisposicionArchivos t={t} archivos={hojas} ex={ex}
                    textos={{ singular: "baúl", plural: "baúles", buscar: "Buscar baúles o memorias…", hrefTodo: "/baules", etiquetaTodo: "Abrir Baúles", icono: Vault }} />
            )}
        </MarcoSocial>
    );
}

export default VaultsWidget;
