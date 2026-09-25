/**
 * Iconos de la app: completos, sin recortarse ni estirarse (2026-09-25).
 *
 * Alex: «el icono de las apps aún no aparece completo sin recortarse ni estirarse en png en
 * todas las versiones». Medido: `src/app/apple-icon.png` era el símbolo (1000×1497) aplastado
 * a 180×180 y Next lo servía en lugar del de `public/`; los iconos «maskable» del manifiesto
 * eran los mismos que los «any» (el símbolo ocupaba el 89 % del alto y la máscara cortaba las
 * puntas); y el APK usaba el maestro a lienzo completo como primer plano adaptativo (el
 * lanzador de Android enseña solo el 66 % central). Estas pruebas fijan lo arreglado.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Ancho y alto leídos de la cabecera IHDR del PNG (sin dependencias). */
function medidas(rel: string): { w: number; h: number } {
    const b = readFileSync(path.join(RAIZ, rel));
    expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("iconos de la app", () => {
    it("Next no sirve un apple-icon ni un icon propios de la carpeta app (el de public/ manda)", () => {
        expect(existsSync(path.join(RAIZ, "src/app/apple-icon.png"))).toBe(false);
        expect(existsSync(path.join(RAIZ, "src/app/icon.png"))).toBe(false);
    });

    it("apple-icon y los maskable son cuadrados", () => {
        expect(medidas("public/apple-icon.png")).toEqual({ w: 180, h: 180 });
        expect(medidas("public/icons/maskable-192.png")).toEqual({ w: 192, h: 192 });
        expect(medidas("public/icons/maskable-512.png")).toEqual({ w: 512, h: 512 });
    });

    it("el manifiesto usa iconos maskable propios, distintos de los «any»", () => {
        const m = JSON.parse(readFileSync(path.join(RAIZ, "public/manifest.webmanifest"), "utf8")) as {
            icons: { src: string; purpose?: string }[];
        };
        const maskable = m.icons.filter((i) => i.purpose === "maskable").map((i) => i.src);
        const any = m.icons.filter((i) => i.purpose !== "maskable").map((i) => i.src);
        expect(maskable.length).toBeGreaterThan(0);
        for (const src of maskable) {
            expect(any).not.toContain(src);
            expect(existsSync(path.join(RAIZ, "public", src))).toBe(true);
        }
    });

    it.each(["os", "nexus", "cafe"])("el APK de «%s» lleva primer plano adaptativo con margen", (sistema) => {
        const rel = `native/icons-src/${sistema}.json`;
        const manifiesto = JSON.parse(readFileSync(path.join(RAIZ, rel), "utf8")) as Record<string, string>;
        expect(manifiesto.default).toBe(`${sistema}.png`);
        expect(manifiesto.android_fg).toBe(`${sistema}-fg.png`);
        for (const clave of ["default", "android_fg", "android_bg"] as const) {
            const archivo = manifiesto[clave];
            if (!archivo) continue;
            const m = medidas(`native/icons-src/${archivo}`);
            expect(m.w).toBe(m.h);
        }
        const flujo = readFileSync(path.join(RAIZ, ".github/workflows/native-build.yml"), "utf8");
        expect(flujo).toContain('icon "../icons-src/${{ matrix.system }}.json"');
        expect(flujo).not.toContain('icon "../icons-src/${{ matrix.system }}.png"');
    });
});
