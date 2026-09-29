"use client";

// ════════════════════════════════════════════════════════════════
// ThemeManagerWidget — tu archivo de temas (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Los temas que guardaste (themeStore.savedThemes), cada uno con su VISTA PREVIA leída
// de su propia configuración (identidad, colores del fondo y radio). Qué hace: guardar
// el aspecto actual con un nombre, aplicar uno con un toque (y deshacer), ordenarlos,
// borrarlos con confirmación y exportar/importar la configuración. Solo usa la API de
// apariencia existente (saveTheme, loadTheme, deleteTheme, undo, exportTheme,
// importTheme, updateConfig para el orden).
// Arreglo de paso: el widget anterior aplicaba y borraba por NOMBRE cuando la API espera
// el id, así que «aplicar» no hacía nada.
// Composición: micro = cuántos · s = sus paletas · m = los recientes + guardar ·
// l = lista con orden y borrado · xl = tarjetas + exportar/importar · panorámico = fila ·
// torre = lista. Estados: vacío (sin temas: guarda el actual), error (importación).
// ════════════════════════════════════════════════════════════════

import React, { useRef, useState } from "react";
import { Palette, Save, Trash2, ArrowUp, ArrowDown, Undo2, Download, Upload, SlidersHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { useAppearance, type AppearanceConfig } from "@/context/appearance-context";
import { useLienzoE, px } from "./paquete-e/lienzo";
import { BotonE, EncabezadoE, EnlaceE, RaizE, VacioE, estilosE } from "./paquete-e/piezas";
import { VentanaTema, identidadDe, nombreFondo, paletaDeGuardado } from "./paquete-e/temas";

interface TemaGuardado { id: string; name: string; createdAt: number; config: Partial<AppearanceConfig> }

export function ThemeManagerWidget() {
    const { ref, lienzo } = useLienzoE();
    const ap = useAppearance();
    const { config } = ap;
    const temas: TemaGuardado[] = Array.isArray(config.themeStore?.savedThemes) ? (config.themeStore.savedThemes as TemaGuardado[]) : [];
    const [nombre, setNombre] = useState("");
    const [aplicado, setAplicado] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const archivo = useRef<HTMLInputElement>(null);

    const guardar = () => {
        const n = nombre.trim() || `Aspecto ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
        ap.saveTheme(n);
        setNombre("");
    };
    const aplicar = (t: TemaGuardado) => { ap.loadTheme(t.id); setAplicado(t.id); };
    const deshacer = () => { ap.undo(); setAplicado(null); };
    const mover = (i: number, d: number) => {
        const j = i + d;
        if (j < 0 || j >= temas.length) return;
        const lista = [...temas];
        [lista[i], lista[j]] = [lista[j], lista[i]];
        ap.updateConfig({ themeStore: { ...config.themeStore, savedThemes: lista } } as never);
    };
    const borrar = (t: TemaGuardado) => {
        if (confirmar !== t.id) { setConfirmar(t.id); return; }
        ap.deleteTheme(t.id);
        setConfirmar(null);
    };
    const importar = async (f: File | undefined) => {
        if (!f) return;
        setError(null);
        try { await ap.importTheme(f); } catch { setError("Ese archivo no es una configuración de tema válida."); }
    };

    const { base, clase, horizontal } = lienzo;
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Archivo de temas: ${temas.length} guardados`, tipo: "THEME_MANAGER" } as const;
    const fecha = (ms: number) => (ms ? new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");

    const formulario = (
        <form className="flex min-w-0 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del aspecto actual…" aria-label="Nombre para guardar el aspecto actual" maxLength={60}
                className="min-w-0 flex-1 rounded-full bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/40 outline-none focus:bg-white/[0.1]"
                style={{ height: lienzo.tactil ? 44 : 32, boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.25)}` }} />
            <BotonE lienzo={lienzo} variante="primario" type="submit" icono={Save}>Guardar</BotonE>
        </form>
    );
    const barraAplicado = aplicado ? (
        <div role="status" className="flex items-center gap-2 rounded-full px-3 py-1" style={{ background: conAlfa(lienzo.acento, 0.12) }}>
            <Check aria-hidden className="size-4 shrink-0 text-emerald-300" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">Aplicado: {temas.find((t) => t.id === aplicado)?.name}</span>
            {ap.canUndo && <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Undo2} onClick={deshacer}>Deshacer</BotonE>}
        </div>
    ) : null;
    const entrada = <input ref={archivo} type="file" accept="application/json,.json" hidden aria-hidden tabIndex={-1} onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = ""; }} />;

    if (temas.length === 0) {
        return (
            <RaizE {...raiz}>
                <VacioE lienzo={lienzo} icono={Palette} titulo="Aún no has guardado ningún aspecto" texto="Guarda el actual con un nombre para volver a él cuando quieras." compacto={base === "micro" || base === "s"}>
                    {base === "micro" || base === "s"
                        ? <EnlaceE lienzo={lienzo} href="/estudio" compacto>Editor</EnlaceE>
                        : <div className="flex w-full max-w-[300px] flex-col gap-1.5">{formulario}<EnlaceE lienzo={lienzo} href="/estudio" compacto variante="fantasma" icono={SlidersHorizontal} className="self-center">Abrir el editor de temas</EnlaceE></div>}
                </VacioE>
            </RaizE>
        );
    }

    if (base === "micro") {
        const p = paletaDeGuardado(temas[0].config).paleta;
        return (
            <RaizE {...raiz}>
                <button type="button" onClick={() => aplicar(temas[0])} aria-label={`Aplicar ${temas[0].name} (${temas.length} temas guardados)`} title={`Aplicar ${temas[0].name}`}
                    className="ss-redondo m-auto grid size-[70%] max-h-20 max-w-20 cursor-pointer place-items-center rounded-full" style={{ background: `radial-gradient(circle at 32% 28%, ${p[3]}, ${p[2]} 45%, ${p[0]})` }}>
                    <span className="text-[15px] font-semibold tabular-nums text-white drop-shadow">{temas.length}</span>
                </button>
            </RaizE>
        );
    }

    if (base === "s") {
        return (
            <RaizE {...raiz}>
                <ul className="m-auto grid grid-cols-2 gap-2" aria-label="Temas guardados">
                    {temas.slice(0, 4).map((t) => {
                        const { paleta } = paletaDeGuardado(t.config);
                        return (
                            <li key={t.id}>
                                <button type="button" onClick={() => aplicar(t)} aria-label={`Aplicar ${t.name}`} title={t.name}
                                    className="ss-redondo block size-11 cursor-pointer rounded-full transition-transform hover:scale-105" style={{ background: `radial-gradient(circle at 32% 28%, ${paleta[3]}, ${paleta[2]} 45%, ${paleta[0]})`, boxShadow: aplicado === t.id ? "0 0 0 2px #fff" : "inset 0 0 0 1px rgba(255,255,255,.2)" }} />
                            </li>
                        );
                    })}
                </ul>
            </RaizE>
        );
    }

    const fila = (t: TemaGuardado, i: number, conOrden: boolean) => {
        const v = paletaDeGuardado(t.config);
        const ident = identidadDe(t.config.themeStore?.osTheme);
        const pidiendo = confirmar === t.id;
        return (
            <li key={t.id} className={cn(estilosE.entra, "flex min-w-0 items-center gap-2 rounded-2xl px-1.5 py-1 transition-colors", aplicado === t.id ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                <button type="button" onClick={() => aplicar(t)} aria-label={`Aplicar ${t.name}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                    <VentanaTema paleta={v.paleta} ancho={lienzo.tv ? 76 : 60} alto={lienzo.tv ? 50 : 40} serif={v.serif} radio={v.radio} activa={aplicado === t.id} />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }} title={t.name}>{t.name}</span>
                        <span className="block truncate text-[11px] text-white/50">{ident.nombre} · fondo {nombreFondo(v.fondo)}{t.createdAt ? ` · ${fecha(t.createdAt)}` : ""}</span>
                    </span>
                </button>
                {conOrden && <>
                    <BotonE lienzo={lienzo} variante="fantasma" compacto icono={ArrowUp} etiqueta={`Subir ${t.name}`} disabled={i === 0} onClick={() => mover(i, -1)} />
                    <BotonE lienzo={lienzo} variante="fantasma" compacto icono={ArrowDown} etiqueta={`Bajar ${t.name}`} disabled={i === temas.length - 1} onClick={() => mover(i, 1)} />
                </>}
                {pidiendo ? (
                    <span className="flex shrink-0 items-center gap-1">
                        <BotonE lienzo={{ ...lienzo, acento: "#f43f5e" }} compacto onClick={() => borrar(t)}>Borrar</BotonE>
                        <BotonE lienzo={lienzo} variante="fantasma" compacto onClick={() => setConfirmar(null)}>No</BotonE>
                    </span>
                ) : (
                    <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Trash2} etiqueta={`Eliminar ${t.name}`} onClick={() => borrar(t)} />
                )}
            </li>
        );
    };

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={Palette} titulo="Archivo de temas" detalle={`${temas.length} guardado${temas.length === 1 ? "" : "s"}`}
            acciones={<EnlaceE lienzo={lienzo} href="/estudio" compacto variante="fantasma" icono={SlidersHorizontal}>Editor</EnlaceE>} />
    );

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-2 px-1">
                    <ul className={cn("flex min-w-0 flex-1 gap-2 overflow-x-auto", estilosE.desliza)} aria-label="Temas guardados">
                        {temas.map((t) => {
                            const v = paletaDeGuardado(t.config);
                            return (
                                <li key={t.id} className="shrink-0">
                                    <button type="button" onClick={() => aplicar(t)} aria-label={`Aplicar ${t.name}`} className="flex cursor-pointer flex-col items-center gap-1">
                                        <VentanaTema paleta={v.paleta} ancho={Math.max(64, Math.min(110, ((lienzo.alto || 110) - 28) * 1.5))} alto={Math.max(42, Math.min(72, (lienzo.alto || 110) - 28))} serif={v.serif} radio={v.radio} activa={aplicado === t.id} />
                                        <span className="max-w-[110px] truncate text-[11px] text-white/80">{t.name}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {aplicado && ap.canUndo && <BotonE lienzo={lienzo} compacto icono={Undo2} onClick={deshacer}>Deshacer</BotonE>}
                </div>
            </RaizE>
        );
    }

    if (base === "xl") {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    {barraAplicado}
                    <ul className={cn("grid min-h-0 flex-1 gap-2", estilosE.desliza)} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gridAutoRows: "min-content" }} aria-label="Temas guardados">
                        {temas.map((t) => {
                            const v = paletaDeGuardado(t.config);
                            return (
                                <li key={t.id} className="flex flex-col gap-1.5 rounded-2xl p-2" style={{ background: "rgba(255,255,255,.035)" }}>
                                    <button type="button" onClick={() => aplicar(t)} aria-label={`Aplicar ${t.name}`} className="cursor-pointer">
                                        <VentanaTema paleta={v.paleta} ancho={140} alto={90} serif={v.serif} radio={v.radio} activa={aplicado === t.id} />
                                    </button>
                                    <span className="flex min-w-0 items-center gap-1">
                                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/90" title={t.name}>{t.name}</span>
                                        {confirmar === t.id
                                            ? <BotonE lienzo={{ ...lienzo, acento: "#f43f5e" }} compacto onClick={() => borrar(t)}>Borrar</BotonE>
                                            : <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Trash2} etiqueta={`Eliminar ${t.name}`} onClick={() => borrar(t)} />}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    {formulario}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Download} onClick={() => ap.exportTheme()}>Exportar la configuración</BotonE>
                        <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Upload} onClick={() => archivo.current?.click()}>Importar</BotonE>
                    </div>
                    {error && <p role="alert" className="text-[11px] text-rose-200">{error}</p>}
                </div>
                {entrada}
            </RaizE>
        );
    }

    // m / l / torre
    const conOrden = base === "l" || clase === "torre";
    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                {cabecera}
                {barraAplicado}
                <ul className={cn("flex min-h-0 flex-1 flex-col gap-0.5", estilosE.desliza)} aria-label="Temas guardados">
                    {temas.slice(0, base === "m" && clase !== "torre" ? 3 : 20).map((t, i) => fila(t, i, conOrden))}
                </ul>
                {formulario}
            </div>
        </RaizE>
    );
}
