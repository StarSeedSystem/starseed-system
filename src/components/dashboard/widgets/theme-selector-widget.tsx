"use client";

// ════════════════════════════════════════════════════════════════
// ThemeSelectorWidget — elegir el aspecto del OS de un toque (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Dos decisiones, cada una con su VISTA PREVIA en miniatura (fondo, tarjeta, botón,
// acento y tipografía):
//   · Identidad del sistema (themeStore.osTheme: Aurora, Café, Omnifrecuencias,
//     Audiomorphic) — la misma de Ajustes → Apariencia;
//   · Atmósfera (next-themes: obsidiana, alabastro, cristal líquido…).
// Un toque aplica al instante en todo el OS; «Deshacer» vuelve a lo de antes. Solo
// usa la API de apariencia existente (updateSection / setTheme), sin tocarla.
// Composición: micro = el orbe de tu identidad (tocar la cambia a la siguiente) ·
// s = cuatro orbes · m = cuatro vistas previas · l = + atmósferas · xl = vistas
// grandes con su descripción · panorámico = identidades en fila · torre = columna.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Palette, Undo2, Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { useAppearance, type OsThemeId } from "@/context/appearance-context";
import { useLienzoE, px } from "./paquete-e/lienzo";
import { BotonE, EncabezadoE, EnlaceE, RaizE, estilosE } from "./paquete-e/piezas";
import { ATMOSFERAS, IDENTIDADES, VentanaTema, identidadDe, type Identidad } from "./paquete-e/temas";

interface Previo { tipo: "identidad" | "atmosfera"; id: string; nombre: string }

function Orbe({ paleta, lado, activa }: { paleta: [string, string, string, string]; lado: number; activa: boolean }) {
    const [bg, , p, a] = paleta;
    return (
        <span aria-hidden className="relative block shrink-0 rounded-full" style={{
            width: lado, height: lado,
            background: `radial-gradient(circle at 32% 28%, ${a} 0%, ${p} 42%, ${bg} 100%)`,
            boxShadow: activa ? `0 0 0 2px #fff, 0 0 18px ${conAlfa(p, 0.8)}` : `0 6px 16px -8px ${conAlfa(p, 0.9)}, inset 0 0 0 1px rgba(255,255,255,.15)`,
        }}>
            {activa && <Check className="absolute inset-0 m-auto size-1/3 text-white drop-shadow" />}
        </span>
    );
}

export function ThemeSelectorWidget() {
    const { ref, lienzo } = useLienzoE();
    const { config, updateSection } = useAppearance();
    const { theme, setTheme } = useTheme();
    const identidad = identidadDe(config.themeStore?.osTheme);
    const [previo, setPrevio] = useState<Previo | null>(null);
    const temporizador = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(temporizador.current), []);

    const recordar = (p: Previo) => {
        setPrevio(p);
        window.clearTimeout(temporizador.current);
        temporizador.current = window.setTimeout(() => setPrevio(null), 9000);
    };
    const aplicarIdentidad = (id: OsThemeId) => {
        if (id === identidad.id) return;
        recordar({ tipo: "identidad", id: identidad.id, nombre: identidad.nombre });
        updateSection("themeStore", { osTheme: id });
    };
    const aplicarAtmosfera = (id: string) => {
        if (id === theme) return;
        const actual = ATMOSFERAS.find((a) => a.id === theme);
        recordar({ tipo: "atmosfera", id: theme ?? "dark", nombre: actual?.nombre ?? "la anterior" });
        setTheme(id);
    };
    const deshacer = () => {
        if (!previo) return;
        if (previo.tipo === "identidad") updateSection("themeStore", { osTheme: previo.id as OsThemeId });
        else setTheme(previo.id);
        setPrevio(null);
    };

    const { base, clase, horizontal } = lienzo;
    const raiz = { lienzo, refRaiz: ref, etiqueta: `Aspecto del sistema: identidad ${identidad.nombre}${theme ? `, atmósfera ${ATMOSFERAS.find((a) => a.id === theme)?.nombre ?? theme}` : ""}`, tipo: "THEME_SELECTOR" } as const;
    const barraDeshacer = previo ? (
        <div role="status" className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1" style={{ background: conAlfa(lienzo.acento, 0.12) }}>
            <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">Aplicado. Antes: {previo.nombre}</span>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Undo2} onClick={deshacer}>Deshacer</BotonE>
        </div>
    ) : null;

    if (base === "micro") {
        const i = IDENTIDADES.findIndex((x) => x.id === identidad.id);
        const siguiente = IDENTIDADES[(i + 1) % IDENTIDADES.length];
        const lado = Math.max(40, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.68);
        return (
            <RaizE {...raiz}>
                <button type="button" onClick={() => aplicarIdentidad(siguiente.id)} aria-label={`Identidad actual: ${identidad.nombre}. Cambiar a ${siguiente.nombre}`} title={`Cambiar a ${siguiente.nombre}`}
                    className="ss-redondo m-auto cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2">
                    <Orbe paleta={identidad.oscuro} lado={lado} activa={false} />
                </button>
            </RaizE>
        );
    }

    // Vistas previas que caben en la caja: 2 columnas en «m», 4 en «l»/«xl».
    const columnas = base === "m" ? 2 : 4;
    const anchoVentana = lienzo.ancho > 0 ? Math.max(64, Math.min(base === "xl" ? 170 : 140, Math.floor((lienzo.ancho - 16 - 8 * (columnas - 1)) / columnas) - 8)) : 96;

    // Ancho de cada orbe con su nombre en la franja (4 por fila, menos el deshacer si está).
    const anchoOrbe = lienzo.ancho > 0 ? (lienzo.ancho - (previo ? 268 : 0) - 16) / IDENTIDADES.length - 8 : 96;
    const botonIdentidad = (x: Identidad, modo: "orbe" | "ventana" | "fila") => {
        const activa = x.id === identidad.id;
        const ancho = modo === "ventana" ? anchoVentana : 0;
        return (
            <li key={x.id} className="min-w-0">
                <button type="button" onClick={() => aplicarIdentidad(x.id)} aria-pressed={activa} aria-label={`Identidad ${x.nombre}${activa ? " (actual)" : ""}`} title={x.lema}
                    className={cn("group flex w-full min-w-0 cursor-pointer rounded-2xl outline-none transition-[transform,background-color] duration-200 hover:-translate-y-0.5 focus-visible:ring-2",
                        modo === "fila" ? "items-center gap-3 px-2 py-1.5 text-left hover:bg-white/[0.05]" : "flex-col items-center gap-1.5 p-1")}
                    style={{ ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}>
                    {modo === "ventana" ? <VentanaTema paleta={x.oscuro} ancho={ancho} alto={ancho * 0.66} serif={x.serif} activa={activa} />
                        : <Orbe paleta={x.oscuro} lado={modo === "fila" ? 36 : base === "s" ? 42 : 48} activa={activa} />}
                    {modo === "fila" ? (
                        <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-[13px]", activa ? "font-semibold text-white" : "text-white/85")}>{x.nombre}</span>
                            <span className="block truncate text-[11px] text-white/50">{x.lema}</span>
                        </span>
                    ) : base !== "s" && (
                        // El nombre entero si cabe; si no, el corto (Omni, Audio…): sin elipsis que corte.
                        <span className={cn("max-w-full truncate", activa ? "font-semibold text-white" : "text-white/75")} style={{ fontSize: px(lienzo, 12) }}>
                            {(modo === "ventana" ? anchoVentana : anchoOrbe) >= x.nombre.length * 7 + 6 ? x.nombre : x.corto ?? x.nombre}
                        </span>
                    )}
                    {base === "xl" && modo === "ventana" && <span className="line-clamp-2 text-center text-[11px] leading-snug text-white/50">{x.lema}</span>}
                </button>
            </li>
        );
    };

    const atmosferas = (
        <section aria-label="Atmósfera" className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Atmósfera</span>
            <ul className="flex flex-wrap gap-1.5">
                {ATMOSFERAS.map((a) => {
                    const activa = theme === a.id;
                    return (
                        <li key={a.id}>
                            <button type="button" onClick={() => aplicarAtmosfera(a.id)} aria-pressed={activa} aria-label={`Atmósfera ${a.nombre}${activa ? " (actual)" : ""}${a.clara ? " (clara, en pruebas)" : ""}`}
                                className="ss-redondo inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[12px] transition-colors duration-200"
                                style={activa ? { background: conAlfa(lienzo.acento, 0.2), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.6)}`, color: "#fff" } : { background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.8)" }}>
                                <span aria-hidden className="size-7 rounded-full" style={{ background: `conic-gradient(from 200deg, ${a.paleta[0]}, ${a.paleta[2]}, ${a.paleta[3]}, ${a.paleta[1]}, ${a.paleta[0]})`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }} />
                                {a.nombre}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <p className="text-[11px] text-white/45">Las claras aún están en pruebas: algunas pantallas siguen pensadas en oscuro.</p>
        </section>
    );

    if (base === "s") {
        return (
            <RaizE {...raiz}>
                <ul className="m-auto grid grid-cols-2 gap-2" aria-label="Identidad del sistema">{IDENTIDADES.map((x) => botonIdentidad(x, "orbe"))}</ul>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-3 px-1">
                    <ul className="flex min-w-0 flex-1 items-center justify-around gap-2" aria-label="Identidad del sistema">{IDENTIDADES.map((x) => botonIdentidad(x, "orbe"))}</ul>
                    {previo && <div className="w-64 shrink-0">{barraDeshacer}</div>}
                </div>
            </RaizE>
        );
    }

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={Palette} titulo="Aspecto" detalle={identidad.nombre}
            acciones={<EnlaceE lienzo={lienzo} href="/estudio" compacto variante="fantasma" icono={SlidersHorizontal}>Editor</EnlaceE>} />
    );

    if (clase === "torre") {
        return (
            <RaizE {...raiz}>
                <div className={cn("flex h-full min-h-0 flex-col gap-2 p-1", estilosE.desliza)}>
                    {cabecera}
                    <ul className="flex flex-col gap-0.5" aria-label="Identidad del sistema">{IDENTIDADES.map((x) => botonIdentidad(x, "fila"))}</ul>
                    {barraDeshacer}
                    {atmosferas}
                </div>
            </RaizE>
        );
    }

    return (
        <RaizE {...raiz}>
            <div className={cn("flex h-full min-h-0 flex-col gap-2 p-1", estilosE.desliza)}>
                {cabecera}
                <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }} aria-label="Identidad del sistema">
                    {IDENTIDADES.map((x) => botonIdentidad(x, "ventana"))}
                </ul>
                {barraDeshacer}
                {(base === "l" || base === "xl") && atmosferas}
            </div>
        </RaizE>
    );
}
