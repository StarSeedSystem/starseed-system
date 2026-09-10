import { describe, it, expect } from "vitest";
import {
    acentoDe,
    ritmoDe,
    claseDeDensidad,
    type AcentoWidget,
} from "../acento-widget";
import type { WidgetCategory } from "../widget-categories";

// ════════════════════════════════════════════════════════════════
// Acento por categoría (Ola 305): cada familia de widgets se siente
// suya sin romper la unidad del sistema. Se comprueba que las 29
// categorías tienen acento, que una desconocida cae en el neutro,
// que el movimiento reducido apaga TODO y que el módulo es
// determinista (mismo dato de entrada → mismo resultado).
// ════════════════════════════════════════════════════════════════

// Import de tipo (se borra al compilar): si alguien renombra o borra una
// categoría en widget-categories.ts, esta lista deja de tipar y salta.
const TODAS_LAS_CATEGORIAS: WidgetCategory[] = [
    "aplicaciones", "politica", "educacion", "cultura", "social",
    "economia", "clima", "productividad", "ubicacion", "utilidades",
    "arte", "astronomia", "astrologia", "sistema", "personalizacion",
    "archivos", "entretenimiento", "ia", "ayudantia", "parlamento",
    "red", "ciberdelia", "descubrimientos", "explorador", "privacidad",
    "dispositivos", "creatividad", "perfil", "sociedad",
];

const MOVIMIENTOS = ["sobrio", "vivo", "organico"];
const DENSIDADES = ["compacta", "comoda"];

function esAcentoValido(a: AcentoWidget): boolean {
    return (
        a.color.length > 0 &&
        a.colorSuave.length > 0 &&
        a.borde.length > 0 &&
        MOVIMIENTOS.includes(a.movimiento) &&
        DENSIDADES.includes(a.densidad)
    );
}

describe("acentoDe", () => {
    it("cubre las 29 categorías con un acento válido", () => {
        expect(TODAS_LAS_CATEGORIAS).toHaveLength(29);
        for (const categoria of TODAS_LAS_CATEGORIAS) {
            const a = acentoDe(categoria);
            expect(esAcentoValido(a), `categoría sin acento: ${categoria}`).toBe(true);
        }
    });

    it("usa utilidades de color, no CSS inventado", () => {
        for (const categoria of TODAS_LAS_CATEGORIAS) {
            const a = acentoDe(categoria);
            expect(a.color.startsWith("text-")).toBe(true);
            expect(a.colorSuave.startsWith("bg-")).toBe(true);
            expect(a.borde.startsWith("border-")).toBe(true);
        }
    });

    it("da el neutro del sistema a una categoría desconocida, sin lanzar", () => {
        const neutro = acentoDe("categoria-que-no-existe");
        expect(esAcentoValido(neutro)).toBe(true);
        expect(neutro.color).toBe("text-muted-foreground");
        expect(neutro.movimiento).toBe("sobrio");
        // Cadena vacía y valores raros también caen en el neutro.
        expect(acentoDe("")).toEqual(neutro);
        expect(acentoDe("POLITICA")).toEqual(neutro);
    });

    it("respeta el criterio declarado por familia", () => {
        // La gobernanza no parece un juguete.
        expect(acentoDe("politica").movimiento).toBe("sobrio");
        expect(acentoDe("parlamento").movimiento).toBe("sobrio");
        // Lo expresivo respira.
        expect(acentoDe("cultura").movimiento).toBe("organico");
        expect(acentoDe("arte").movimiento).toBe("organico");
        expect(acentoDe("creatividad").movimiento).toBe("organico");
        // La piel eléctrica del OS.
        expect(acentoDe("ia").movimiento).toBe("vivo");
        expect(acentoDe("ciberdelia").movimiento).toBe("vivo");
        // Instrumentos: sobrios y compactos.
        for (const c of ["sistema", "privacidad", "dispositivos"]) {
            expect(acentoDe(c).movimiento).toBe("sobrio");
            expect(acentoDe(c).densidad).toBe("compacta");
        }
        // El cielo cambia solo: vivo y cómodo.
        for (const c of ["clima", "astronomia"]) {
            expect(acentoDe(c).movimiento).toBe("vivo");
            expect(acentoDe(c).densidad).toBe("comoda");
        }
    });

    it("es determinista y no expone la tabla interna", () => {
        const a = acentoDe("clima");
        const b = acentoDe("clima");
        expect(a).toEqual(b);
        a.color = "text-roto";
        expect(acentoDe("clima").color).toBe(b.color);
    });
});

describe("ritmoDe", () => {
    it("mantiene las duraciones dentro de los 150-300 ms del sistema", () => {
        for (const categoria of TODAS_LAS_CATEGORIAS) {
            const r = ritmoDe(acentoDe(categoria), false);
            expect(r.duracionMs).toBeGreaterThanOrEqual(150);
            expect(r.duracionMs).toBeLessThanOrEqual(300);
            expect(r.escalonMs).toBeGreaterThanOrEqual(0);
        }
    });

    it("ordena los caracteres de menos a más movimiento", () => {
        const sobrio = ritmoDe(acentoDe("sistema"), false);
        const vivo = ritmoDe(acentoDe("ia"), false);
        const organico = ritmoDe(acentoDe("arte"), false);
        expect(sobrio.duracionMs).toBeLessThan(vivo.duracionMs);
        expect(vivo.duracionMs).toBeLessThan(organico.duracionMs);
        expect(sobrio.escalonMs).toBe(0);
        expect(organico.escalonMs).toBeGreaterThan(vivo.escalonMs);
    });

    it("con movimiento reducido lo pone TODO a 0, sin excepción", () => {
        for (const categoria of [...TODAS_LAS_CATEGORIAS, "desconocida"]) {
            const r = ritmoDe(acentoDe(categoria), true);
            expect(r).toEqual({ duracionMs: 0, escalonMs: 0 });
        }
    });

    it("es determinista", () => {
        const a = acentoDe("ciberdelia");
        expect(ritmoDe(a, false)).toEqual(ritmoDe(a, false));
        expect(ritmoDe(a, true)).toEqual(ritmoDe(a, true));
    });
});

describe("claseDeDensidad", () => {
    it("devuelve utilidades de espaciado del marco, más apretadas si es compacta", () => {
        const compacta = claseDeDensidad(acentoDe("sistema"));
        const comoda = claseDeDensidad(acentoDe("clima"));
        expect(compacta).toBe("gap-1.5 p-2");
        expect(comoda).toBe("gap-2 p-3");
        expect(compacta).not.toBe(comoda);
    });

    it("da una clase no vacía para cada categoría y para el neutro", () => {
        for (const categoria of [...TODAS_LAS_CATEGORIAS, "desconocida"]) {
            expect(claseDeDensidad(acentoDe(categoria)).length).toBeGreaterThan(0);
        }
    });
});
