"use client";

/**
 * RediseñoFondoPanel — conexión de `rediseno-desde-fondo.ts` (Ola 1018F · L · fondos-shaders.md §4):
 * con el fondo puesto, sugiere TRES propuestas de tokens de tema (sobria, armónica, atrevida) desde
 * la paleta medida del fondo, con escala φ y contraste AA verificado; aplicar es reversible desde
 * aquí mismo y «Armar pedido» construye el pedido al Director de diseño (lo privado solo sale si
 * corre en una neurona de la persona: localhost/127.x, nunca en una instancia compartida).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Copy, Palette, RotateCcw, Sparkles } from "lucide-react";
import { applyThemeTokens, appliedTheme, listThemes, type ThemeTokens } from "@/lib/design/theme-engine";
import "@/lib/design/theme-catalog";
import { esHexColor, paletaFondo } from "@/lib/design/paleta-fondo";
import { pedidoParaIA, propuestasDesdeFondo } from "@/lib/design/rediseno-desde-fondo";
import { normalizeLayers } from "@/lib/appearance/background-layers";
import { useAppearance } from "@/context/appearance-context";

export function RedisenoFondoPanel({ host }: { host?: string }) {
    const { config } = useAppearance();
    const { resolvedTheme } = useTheme();
    const modo = resolvedTheme === "light" ? "claro" as const : "oscuro" as const;
    const enNeurona = ["localhost", "127.0.0.1"].includes(host ?? window.location.hostname);
    const [montado, setMontado] = useState(false);
    const [aplicada, setAplicada] = useState<string | null>(null);
    const [pedido, setPedido] = useState<string | null>(null);
    const previo = useRef<{ claves: string[]; valores: Record<string, string>; material: string; motion: string } | null>(null);

    useEffect(() => setMontado(true), []);

    const paleta = useMemo(() => {
        const bg = config.background;
        const capas = normalizeLayers(bg.layers).map((l) => ({
            tipo: l.kind,
            color: l.value !== undefined && esHexColor(l.value) ? l.value : undefined,
            preset: l.preset ? { components: l.preset.components ?? [] } : undefined,
        }));
        return paletaFondo({
            motorBase: { color: bg.type === "solid" && esHexColor(bg.value) ? bg.value : undefined },
            capas,
        });
    }, [config.background.type, config.background.value, config.background.layers]);

    const temaActual = useMemo<ThemeTokens>(() => {
        const aplicado = appliedTheme();
        const pack = aplicado ? listThemes().find((t) => t.id === aplicado.id) : null;
        const resuelto = modo === "claro" ? "light" : "dark";
        return pack?.modes[resuelto] ?? pack?.modes.auto ?? pack?.modes.dark ?? pack?.modes.light ?? { vars: {} };
    }, [modo, montado]);

    const propuestas = useMemo(
        () => propuestasDesdeFondo({ paleta, temaActual, modo }),
        [paleta, temaActual, modo],
    );

    const aplicar = (id: string) => {
        const p = propuestas.find((x) => x.id === id);
        if (!p || p.descartada) return;
        const root = document.documentElement;
        previo.current = {
            claves: Object.keys(p.tokens.vars),
            valores: Object.fromEntries(Object.keys(p.tokens.vars).map((c) => [c, root.style.getPropertyValue(`--${c}`)])),
            material: root.dataset.ssMaterial ?? "",
            motion: root.style.getPropertyValue("--ss-motion"),
        };
        applyThemeTokens(p.tokens);
        setAplicada(id);
        toast.success(`Propuesta «${p.nombre}» aplicada: puedes deshacerla aquí mismo.`);
    };

    const deshacer = () => {
        const p = previo.current;
        if (!p) return;
        const root = document.documentElement;
        for (const c of p.claves) root.style.setProperty(`--${c}`, p.valores[c] ?? "");
        if (p.material === "") delete root.dataset.ssMaterial; else root.dataset.ssMaterial = p.material;
        if (p.motion === "") root.style.removeProperty("--ss-motion"); else root.style.setProperty("--ss-motion", p.motion);
        setAplicada(null);
        toast.message("Rediseño deshecho: vuelves al tema que tenías.");
    };

    const armarPedido = () => setPedido(pedidoParaIA({ paleta, temaActual, modo, enNeuronaPersonal: enNeurona }).texto);

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 space-y-3" aria-label="Rediseño sugerido por Astraura">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" /> Rediseño sugerido por Astraura
            </h3>
            <p className="max-w-prose text-[11px] text-muted-foreground/70">
                Con tu fondo puesto, Astraura propone tres temas a juego (sobria, armónica y atrevida): superficies
                translúcidas que dejan ver el fondo, acentos de su paleta y escala φ. El fondo sigue mandando y
                contrastes AA verificados.
            </p>
            {!montado && <p className="text-[11px] text-muted-foreground/60">Midiendo la paleta del fondo…</p>}
            {montado && (
                <div className="space-y-2">
                    {propuestas.map((p) => (
                        <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border/40 px-2.5 py-1.5">
                            <Palette className="size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold">{p.nombre}</p>
                                <p className="text-[10px] text-muted-foreground/60">
                                    {p.descartada ?? `${p.motivo} Contraste AA: ratio ${p.contrasteMinimo.toFixed(2)} ≥ 4,5.`}
                                </p>
                            </div>
                            {p.descartada === undefined && aplicada === p.id && (
                                <button type="button" onClick={deshacer} title="Volver a tu tema anterior"
                                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                                    <RotateCcw className="size-3" /> Deshacer
                                </button>
                            )}
                            {p.descartada === undefined && aplicada !== p.id && (
                                <button type="button" onClick={() => aplicar(p.id)} title={`Aplicar la propuesta ${p.nombre}`}
                                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20">
                                    Aplicar
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={armarPedido} title="Armar el pedido al Director de diseño"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                        <Sparkles className="size-3.5" /> Armar pedido para el Director de diseño
                    </button>
                    {pedido !== null && (
                        <div className="rounded-lg border border-border/40 px-2.5 py-2" aria-label="Pedido armado">
                            <p className="text-[10px] text-muted-foreground/60 mb-1">
                                {enNeurona ? "Pedirle las tres propuestas." : "En una instancia compartida va sin tus gustos privados."}
                            </p>
                            <textarea readOnly value={pedido} rows={4} aria-label="Pedido al Director de diseño"
                                className="w-full rounded-md bg-black/20 p-2 text-[11px] outline-none" />
                            <button type="button" title="Copiar el pedido"
                                onClick={() => { void navigator.clipboard?.writeText(pedido).then(() => toast.success("Pedido copiado")); }}
                                className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-white/5 hover:text-foreground">
                                <Copy className="size-3" /> Copiar
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
