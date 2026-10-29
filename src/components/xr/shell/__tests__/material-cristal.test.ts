import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => {
    const base = (clase: string) =>
        class {
            clase = clase;
            args: Record<string, unknown>;
            constructor(args: Record<string, unknown> = {}) {
                this.args = args;
            }
        };
    return {
        MeshBasicMaterial: base("MeshBasicMaterial"),
        MeshStandardMaterial: base("MeshStandardMaterial"),
        MeshPhysicalMaterial: base("MeshPhysicalMaterial"),
    };
});
vi.mock("@react-three/uikit", () => ({ Container: () => null, Text: () => null }));
vi.mock("../use-prefs-xr", () => ({
    usePrefsXR: () => ({ confort: { reducirTransparencia: false, contrasteAlto: false } }),
}));

import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { paramsMaterial } from "@/lib/xr/tokens-3d";
import { NIVELES_CALIDAD } from "@/lib/xr/tipos";
import { aArgsMaterial, crearClaseMaterial, crearMaterial } from "../material-cristal";
import { materialDePanel, opcionesDeMaterial, tamanoTexto3D } from "../panel-cristal";

type Hecho = { clase: string; args: Record<string, unknown> };

function falsoThree(hechos: Hecho[] = []) {
    const base = (clase: string) =>
        class {
            args: Record<string, unknown>;
            constructor(args: Record<string, unknown> = {}) {
                this.args = args;
                hechos.push({ clase, args });
            }
        };
    return {
        MeshBasicMaterial: base("MeshBasicMaterial"),
        MeshStandardMaterial: base("MeshStandardMaterial"),
        MeshPhysicalMaterial: base("MeshPhysicalMaterial"),
    };
}

const opciones = (extra: Partial<{ reducirTransparencia: boolean; contrasteAlto: boolean; opacidadMinima: number }> = {}) => ({
    reducirTransparencia: false,
    contrasteAlto: false,
    opacidadMinima: 0,
    ...extra,
});

describe("aArgsMaterial · los cinco materiales del contrato", () => {
    it("plano → MeshBasicMaterial opaco al 94 %", () => {
        const p = paramsMaterial(PERFILES.minima.material, "zenith");
        expect(p.clase).toBe("MeshBasicMaterial");
        expect(aArgsMaterial(p)).toMatchObject({ color: "#0E101E", opacity: 0.94, transparent: true });
        expect(aArgsMaterial(p).roughness).toBeUndefined();
        expect(aArgsMaterial(p).transmission).toBeUndefined();
    });

    it("translúcido → MeshBasicMaterial translúcido", () => {
        const a = aArgsMaterial(paramsMaterial(PERFILES.baja.material, "horizon"));
        expect(a.opacity).toBeCloseTo(0.72);
        expect(a.transparent).toBe(true);
    });

    it("vidrio-entorno → MeshStandardMaterial con rugosidad, metal y entorno", () => {
        const p = paramsMaterial(PERFILES.media.material, "logic");
        expect(p.clase).toBe("MeshStandardMaterial");
        expect(aArgsMaterial(p)).toMatchObject({ roughness: 0.18, metalness: 0, envMapIntensity: 1 });
    });

    it("transmision-media → MeshPhysicalMaterial a media resolución", () => {
        const p = paramsMaterial(PERFILES.alta.material, "anchor");
        expect(p.clase).toBe("MeshPhysicalMaterial");
        expect(aArgsMaterial(p)).toMatchObject({ transmission: 0.9, thickness: 0.12, ior: 1.35 });
    });

    it("transmision-completa → transmisión total con dispersión", () => {
        const a = aArgsMaterial(paramsMaterial(PERFILES.maxima.material, "zenith"));
        expect(a).toMatchObject({ transmission: 1, thickness: 0.3, dispersion: 0.2 });
    });
});

describe("paramsMaterial aplicado por el panel", () => {
    it("reducirTransparencia fuerza MeshBasicMaterial en cualquier nivel", () => {
        for (const nivel of NIVELES_CALIDAD) {
            expect(materialDePanel("anchor", nivel, opciones({ reducirTransparencia: true })).clase).toBe("MeshBasicMaterial");
        }
    });

    it("contraste alto deja la opacidad en 0,92 o más", () => {
        for (const nivel of NIVELES_CALIDAD) {
            expect(materialDePanel("logic", nivel, opciones({ contrasteAlto: true })).opacidad).toBeGreaterThanOrEqual(0.92);
        }
    });

    it("con opacidad mínima 0,82 ningún nivel baja de ella", () => {
        for (const nivel of NIVELES_CALIDAD) {
            expect(materialDePanel("horizon", nivel, opciones({ opacidadMinima: 0.82 })).opacidad).toBeGreaterThanOrEqual(0.82);
        }
    });

    it("opcionesDeMaterial copia las preferencias y la opacidad mínima", () => {
        expect(opcionesDeMaterial({ reducirTransparencia: true, contrasteAlto: false }, 0.82)).toEqual({
            reducirTransparencia: true,
            contrasteAlto: false,
            opacidadMinima: 0.82,
        });
    });
});

describe("construcción con three inyectado", () => {
    it("crearMaterial construye la clase correcta con los args de three", () => {
        const hechos: Hecho[] = [];
        const p = paramsMaterial(PERFILES.maxima.material, "zenith");
        crearMaterial(falsoThree(hechos), p);
        expect(hechos).toHaveLength(1);
        expect(hechos[0].clase).toBe("MeshPhysicalMaterial");
        expect(hechos[0].args).toEqual(aArgsMaterial(p));
    });

    it("crearClaseMaterial deriva de la clase pedida y conserva los args", () => {
        const three = falsoThree();
        const p = paramsMaterial(PERFILES.media.material, "logic");
        const Clase = crearClaseMaterial(three, p);
        const material = new Clase() as unknown as { args: Record<string, unknown> };
        expect(material).toBeInstanceOf(three.MeshStandardMaterial);
        expect(material.args).toEqual(aArgsMaterial(p));
    });
});

describe("Texto3D · mínimo de 1° de arco", () => {
    it("a 1,8 m mide ≈ 0,031 m", () => {
        expect(tamanoTexto3D(1.8)).toBeCloseTo(0.0314, 3);
    });

    it("no encoge por debajo del mínimo aunque pidan menos", () => {
        expect(tamanoTexto3D(1.8, 1, 0.01)).toBeCloseTo(0.0314, 3);
    });

    it("respeta un tamaño mayor que el mínimo", () => {
        expect(tamanoTexto3D(1, 1, 0.5)).toBe(0.5);
    });
});
