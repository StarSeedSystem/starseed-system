import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sun } from "lucide-react";

// ── Tamaño y presupuesto forzados ──
const h = vi.hoisted(() => ({ medida: { width: 240, height: 240 }, nivel: "normal" as "ligero" | "normal" | "pleno" }));
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...h.medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("@/lib/widgets/forma/nivel-dispositivo", async (original) => ({
    ...(await original<typeof import("@/lib/widgets/forma/nivel-dispositivo")>()),
    useNivelRender: () => h.nivel,
}));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            widgets: { marco: "libre", designMode: "theme", bgStyle: "glass", borderStyle: "thin", headerStyle: "simple", shadows: "md", glassOpacity: 0.6, innerGlow: "none" },
            animations: { hover: false, enabled: false },
        },
    }),
}));

import {
    ACENTOS_FAMILIA, FAMILIA_DE_CATEGORIA, acentoDeTipo, conAlfa, familiaDeCategoria, luminancia,
    normalizarHex, primerPlanoSobre, tripleHsl,
} from "../acentos-categoria";
import { ESPACIADO_MARCO, MarcoUnificado, espaciadoDe, estiloMaterial, radioDe } from "../marco-unificado";
import { useMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { WidgetShell } from "@/components/dashboard/kit/widget-shell";
import { Chip, StatTile, WidgetEmptyState, WidgetErrorState } from "@/components/dashboard/kit/primitives";

afterEach(() => { cleanup(); h.medida = { width: 240, height: 240 }; h.nivel = "normal"; });

describe("Acentos por categoría", () => {
    it("toda categoría del manifiesto tiene familia propia (ninguna cae al neutro por olvido)", () => {
        const categorias = new Set(Object.values(WIDGET_MANIFEST).map((m) => m!.category));
        const sinFamilia = [...categorias].filter((c) => !(c in FAMILIA_DE_CATEGORIA));
        expect(sinFamilia).toEqual([]);
    });

    it("cada familia pinta con el color que pidió el dueño", () => {
        const casos: [string, string][] = [
            ["AGORA_CAUSAL", "#dc143c"],        // política · carmesí
            ["SKILL_TREE", "#7c5cff"],          // educación · violeta
            ["MULTIVERSE_HUB", "#ffbf00"],      // cultura · ámbar
            ["GIFT_AGORA", "#10b981"],          // economía · esmeralda
            ["WEATHER_TEMPERATURE", "#007fff"], // clima · azur
            ["FLOW_DIRECTOR", "#39ff14"],       // productividad · lima
            ["MAP_LOCATION", "#14b8a6"],        // ubicación · turquesa
            ["MY_GROUPS", "#ec4899"],           // social · rosa
            ["SOVEREIGN_NODE", "#94a3b8"],      // sistema · pizarra
        ];
        for (const [tipo, color] of casos) expect([tipo, acentoDeTipo(tipo).acento]).toEqual([tipo, color]);
    });

    it("el tinte forzado (Trinity) manda sobre la categoría, pero la familia se conserva", () => {
        const a = acentoDeTipo("AGORA_CAUSAL", "#39FF14");
        expect(a.acento).toBe("#39ff14");
        expect(a.familia).toBe("politica");
        expect(acentoDeTipo("AGORA_CAUSAL", "hsl(var(--x))").acento).toBe("#dc143c");
    });

    it("lo desconocido cae en la familia neutra sin romperse", () => {
        expect(familiaDeCategoria(undefined)).toBe("sistema");
        expect(acentoDeTipo("NO_EXISTE").acento).toBe(ACENTOS_FAMILIA.sistema.acento);
    });

    it("utilidades de color puras", () => {
        expect(normalizarHex("#ABC")).toBe("#aabbcc");
        expect(conAlfa("#dc143c", 0.4)).toBe("#dc143c66");
        expect(conAlfa("#dc143c", 0.12)).toBe("#dc143c1f");
        expect(conAlfa("hsl(var(--primary))", 0.4)).toBe("color-mix(in srgb, hsl(var(--primary)) 40%, transparent)");
        expect(tripleHsl("#dc143c")).toBe("348 83% 47%");
        expect(tripleHsl("#ffffff")).toBe("0 0% 100%");
        expect(luminancia("#000000")).toBe(0);
        expect(primerPlanoSobre("#39ff14")).toBe("232 45% 8%");
        expect(primerPlanoSobre("#dc143c")).toBe("0 0% 100%");
    });
});

describe("Tamaños del marco", () => {
    it("panorámico y torre respiran como «m»; compacto baja un escalón sin pasar de micro", () => {
        expect(espaciadoDe("panoramico")).toBe(ESPACIADO_MARCO.m);
        expect(espaciadoDe("torre")).toBe(ESPACIADO_MARCO.m);
        expect(espaciadoDe("l", true)).toBe(ESPACIADO_MARCO.m);
        expect(espaciadoDe("micro", true)).toBe(ESPACIADO_MARCO.micro);
    });

    it("el radio crece con el tamaño dentro del rango del lenguaje (16–26 px)", () => {
        const radios = (["micro", "s", "m", "l", "xl"] as const).map(radioDe);
        expect(radios).toEqual([...radios].sort((a, b) => a - b));
        expect(Math.min(...radios)).toBeGreaterThanOrEqual(16);
        expect(Math.max(...radios)).toBeLessThanOrEqual(26);
    });

    it("el material sigue los niveles de WidgetLibre: .42 + desenfoque en vivo, .58 sin él, .86 sólido", () => {
        const vivo = estiloMaterial({ acento: "#dc143c", acento2: "#23d5ab", vivo: true });
        expect(String(vivo.background)).toContain("rgba(12,14,34,.42)");
        expect(vivo.backdropFilter).toBe("blur(22px) saturate(140%)");
        const suave = estiloMaterial({ acento: "#dc143c", acento2: "#23d5ab", vivo: false });
        expect(String(suave.background)).toContain("rgba(12,14,34,.58)");
        expect(suave.backdropFilter).toBeUndefined();
        const solido = estiloMaterial({ acento: "#dc143c", acento2: "#23d5ab", vivo: true, variante: "solido" });
        expect(String(solido.background)).toContain("rgba(12,14,34,.86)");
        expect(solido.backdropFilter).toBeUndefined();
        expect(estiloMaterial({ acento: "#dc143c", acento2: "#23d5ab", vivo: true, variante: "transparente" })).toEqual({ background: "transparent" });
    });
});

function LeerMarco() {
    const m = useMarcoUnificado();
    return <span data-testid="lectura">{m ? `${m.clase}|${m.acento}` : "sin marco"}</span>;
}

describe("MarcoUnificado", () => {
    it.each([["s", 150], ["m", 240], ["l", 360]] as const)("en %s publica su clase y su acento y pinta el material", (clase, lado) => {
        h.medida = { width: lado, height: lado };
        render(<MarcoUnificado acento="#DC143C" etiqueta="Ágora"><LeerMarco /></MarcoUnificado>);
        const g = screen.getByRole("group", { name: "Ágora" });
        expect(g.getAttribute("data-marco")).toBe("unificado");
        expect(g.getAttribute("data-tamano")).toBe(clase);
        expect(g.querySelector("[data-material-marco]")).not.toBeNull();
        expect(screen.getByTestId("lectura").textContent).toBe(`${clase}|#dc143c`);
    });

    it("el vidrio es «vivo» solo con presupuesto pleno", () => {
        h.nivel = "pleno";
        const { unmount } = render(<MarcoUnificado etiqueta="A">x</MarcoUnificado>);
        expect(screen.getByRole("group").getAttribute("data-vidrio")).toBe("vivo");
        unmount();
        h.nivel = "ligero";
        render(<MarcoUnificado etiqueta="B">x</MarcoUnificado>);
        expect(screen.getByRole("group").getAttribute("data-vidrio")).toBe("suave");
    });

    it("transparente no dibuja material", () => {
        render(<MarcoUnificado etiqueta="T" variante="transparente">x</MarcoUnificado>);
        expect(screen.getByRole("group").querySelector("[data-material-marco]")).toBeNull();
    });

    it("con título pinta la cabecera común; en micro solo queda el icono (título para lectores)", () => {
        h.medida = { width: 240, height: 240 };
        const { unmount } = render(
            <MarcoUnificado titulo="Clima" icono={Sun} acciones={<button type="button">Ver</button>} vivo>cuerpo</MarcoUnificado>,
        );
        expect(screen.getByRole("heading", { name: "Clima" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Ver" })).toBeTruthy();
        expect(screen.getByText("En vivo")).toBeTruthy();
        unmount();
        h.medida = { width: 90, height: 90 };
        render(<MarcoUnificado titulo="Clima" icono={Sun} acciones={<button type="button">Ver</button>}>cuerpo</MarcoUnificado>);
        expect(screen.getByRole("heading", { name: "Clima" }).closest(".sr-only")).not.toBeNull();
        expect(screen.queryByRole("button", { name: "Ver" })).toBeNull();
    });
});

describe("El kit dentro y fuera del marco", () => {
    it("WidgetShell dentro del marco: sin tarjeta propia y con la cabecera común", () => {
        render(
            <MarcoUnificado acento="#10b981" etiqueta="Ágora del Don">
                <WidgetShell title="Ágora del Don" subtitle="Distribución libre" icon={Sun} live actions={<a href="/x">Abrir</a>}>
                    <p>contenido</p>
                </WidgetShell>
            </MarcoUnificado>,
        );
        const cascaron = document.querySelector("[data-widget-shell]") as HTMLElement;
        expect(cascaron.getAttribute("data-marco")).toBe("unificado");
        expect(document.querySelector(".os-widget-shell")).toBeNull();
        expect(document.querySelector(".glass-depth")).toBeNull();
        expect(cascaron.querySelector("[data-cabecera-marco]")).not.toBeNull();
        expect(screen.getByRole("heading", { name: "Ágora del Don" })).toBeTruthy();
        expect(screen.getByText("Distribución libre")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Abrir" })).toBeTruthy();
        expect(screen.getByText("contenido")).toBeTruthy();
    });

    it("WidgetShell fuera del marco sigue igual (libre por defecto)", () => {
        render(<WidgetShell title="Reloj">12:00</WidgetShell>);
        expect(document.querySelector(".os-widget-shell")?.getAttribute("data-marco")).toBe("libre");
        expect(document.querySelector("[data-cabecera-marco]")).toBeNull();
    });

    it("Chip y StatTile adoptan pastilla fantasma y rótulo solo dentro del marco", () => {
        const { unmount } = render(<><Chip>fuera</Chip><StatTile label="Votos" value={12} /></>);
        expect(document.querySelector("[data-kit]")).toBeNull();
        unmount();
        render(<MarcoUnificado acento="#dc143c" etiqueta="M"><Chip>dentro</Chip><StatTile label="Votos" value={12} /></MarcoUnificado>);
        expect(screen.getByText("dentro").closest("[data-kit='chip']")).not.toBeNull();
        expect(screen.getByText("Votos").className).toContain("tracking-[0.14em]");
    });

    it("vacío y error dentro del marco: estado anunciado y acciones como pastillas redondas", () => {
        render(
            <MarcoUnificado etiqueta="M">
                <WidgetEmptyState title="Sin propuestas" message="Crea la primera" actionLabel="Proponer" onAction={() => {}} />
                <WidgetErrorState onRetry={() => {}} />
            </MarcoUnificado>,
        );
        expect(screen.getAllByRole("status")).toHaveLength(2);
        expect(screen.getByRole("button", { name: "Proponer" }).className).toContain("ss-redondo");
        expect(screen.getByRole("button", { name: /Reintentar/ }).className).toContain("ss-redondo");
    });
});
