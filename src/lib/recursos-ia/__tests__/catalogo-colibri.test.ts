import { describe, expect, it } from "vitest";
import { modelosDeCapas } from "../catalogo";
import type { RequisitosModelo } from "../tipos";

/**
 * CLB1027 · parte 2: Colibri como runtime de las capas (`architecture/colibri-multicapas.md` §2).
 * Los datos reales de cada modelo viven en `config/capas-colibri-1027.json`; aquí se usan dos
 * entradas hechas a mano (juicio int4 y profunda int8 con visión y streaming del disco) para
 * no depender del disco ni de que ese JSON cambie.
 */
const capasDePrueba: unknown = {
    capas: [
        {
            id: "colibri-prueba-juicio",
            capa: "juicio",
            modelo: "Juicio de prueba (Convai Innovations)",
            runtime: "colibri",
            disco_mb: 850,
            ram_min_mb: 2048,
            medios: ["nativo", "servidor"],
        },
        {
            id: "colibri-prueba-profunda",
            capa: "profunda",
            modelo: "Profunda de prueba (visión y herramientas, int8)",
            runtime: "colibri",
            streaming_disco: true,
            disco_mb: 84700,
            ram_min_mb: 16384,
            medios: ["servidor", "web"],
        },
    ],
};

/** El modo exacto lo fija tipos.ts (parte 1 de la cadena); aquí solo se le como texto. */
const modoDe = (m: RequisitosModelo): string => m.almacenamiento.modo;
const capacidadesDe = (m: RequisitosModelo): string[] => [...m.capacidades];

describe("catálogo de recursos de IA · runtime colibri", () => {
    const colibri = modelosDeCapas(capasDePrueba);
    const por = (id: string): RequisitosModelo => colibri.find((x) => x.id === id)!;

    it("mapea las dos entradas con capacidades por capa (la profunda añade visión si el modelo la declara)", () => {
        expect(colibri).toHaveLength(2);
        expect(capacidadesDe(por("colibri-prueba-juicio"))).toEqual(["decision"]);
        expect(capacidadesDe(por("colibri-prueba-profunda"))).toEqual(["texto", "razon", "codigo", "vision"]);
    });

    it("bits: int4 por defecto e int8 cuando el propio modelo lo dice", () => {
        expect(por("colibri-prueba-juicio").bits).toBe(4);
        expect(por("colibri-prueba-profunda").bits).toBe(8);
    });

    it("compila para arm64 y x86_64", () => {
        expect(por("colibri-prueba-juicio").arquitecturas).toEqual(["arm64", "x86_64"]);
        expect(por("colibri-prueba-profunda").arquitecturas).toEqual(["arm64", "x86_64"]);
    });

    it("streaming_disco pide disco local rápido, no toda la RAM", () => {
        const profunda = por("colibri-prueba-profunda");
        expect(modoDe(profunda)).toBe("streaming");
        expect(profunda.almacenamiento.lecturaMinMBs).toBe(500);
        expect(profunda.almacenamiento.soloLocal).toBe(true);
        expect(modoDe(por("colibri-prueba-juicio"))).toBe("carga-completa");
    });

    it("sirve OpenAI desde Colibri en 4480 (el 8000 es de Astraura 1.58)", () => {
        expect(por("colibri-prueba-juicio").servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
        expect(por("colibri-prueba-profunda").servidor).toEqual({
            protocolo: "openai",
            url: "http://127.0.0.1:4480/v1",
        });
    });

    it("sin SHA de pesos todavía: en pruebas; tamaño y RAM salen del catálogo", () => {
        const juicio = por("colibri-prueba-juicio");
        expect(juicio.estado).toBe("en-pruebas");
        expect(juicio.disco).toEqual({ gb: 0.85, verificado: false });
        expect(juicio.ramMinGb).toBe(2);
        expect(juicio.medios).toEqual(["nativo", "servidor"]);
        expect(por("colibri-prueba-profunda").disco.gb).toBe(84.7);
    });
});
