import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { paramsMaterial, CRISTAL, COLORES_NODO } from "@/lib/xr/tokens-3d";
import type { MaterialCristal } from "@/lib/xr/calidad-perfiles";
import { NivelCalidadContext, PanelCristal, Texto3D } from "../panel-cristal";
import { aArgsMaterial, altoTextoMinimo, claseMaterialPanel, crearMaterial, fontSizeTexto, type ThreeMinimo } from "../material-cristal";

const h = vi.hoisted(() => ({ panel: null as Record<string, unknown> | null, texto: null as Record<string, unknown> | null, confort: { reducirTransparencia: false, contrasteAlto: false } }));
vi.mock("@react-three/uikit", () => ({
    Container: (props: Record<string, unknown>) => ((h.panel = props), props.children),
    Text: (props: Record<string, unknown>) => ((h.texto = props), props.children),
}));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort }) }));
vi.mock("three", () => {
    const falso = (tipo: string) => class {
        tipo = tipo;
        constructor(public args?: Record<string, unknown>) {}
    };
    return { MeshBasicMaterial: falso("basico"), MeshStandardMaterial: falso("estandar"), MeshPhysicalMaterial: falso("fisico") };
});
const TRES = THREE as unknown as ThreeMinimo;
const MATERIALES: MaterialCristal[] = ["plano", "translucido", "vidrio-entorno", "transmision-media", "transmision-completa"];
const casos: Array<[MaterialCristal, string, Record<string, unknown>]> = [
    ["plano", "MeshBasicMaterial", { opacity: 0.94, transparent: true }],
    ["translucido", "MeshBasicMaterial", { transparent: true }],
    ["vidrio-entorno", "MeshStandardMaterial", { roughness: 0.18, metalness: 0, envMapIntensity: 1 }],
    ["transmision-media", "MeshPhysicalMaterial", { transmission: 0.9, thickness: 0.12, ior: 1.35 }],
    ["transmision-completa", "MeshPhysicalMaterial", { transmission: 1, dispersion: 0.2, thickness: 0.3 }]];
type Falso = new () => { args?: Record<string, unknown> };
const argsDe = (m: unknown): Record<string, unknown> => (m as { args: Record<string, unknown> }).args;
const claseDePanel = (): Falso => (h.panel as Record<string, unknown>).panelMaterialClass as Falso;

beforeEach(() => { h.panel = null; h.texto = null; h.confort = { reducirTransparencia: false, contrasteAlto: false }; });

describe("aArgsMaterial · cada nivel de cristal", () => {
    it.each(casos)("%s → %s con los nombres de three", (material, clase, esperado) => {
        const { clase: obtenida, args } = aArgsMaterial(paramsMaterial(material, "logic"));
        expect(obtenida).toBe(clase);
        expect(args.color).toBe(CRISTAL.fondoA.color);
        for (const [clave, valor] of Object.entries(esperado)) expect(args[clave]).toBe(valor);
    });
    it("translucido conserva su opacidad barata y el borde de acento", () => {
        const p = paramsMaterial("translucido", "horizon");
        expect(aArgsMaterial(p).args.opacity).toBeCloseTo(0.72, 5);
        expect(p.borde.color).toBe(COLORES_NODO.horizon.vivo);
    });
});

describe("preferencias de confort", () => {
    it("reducir transparencias fuerza MeshBasicMaterial en TODOS los niveles", () => {
        for (const material of MATERIALES) {
            const { clase, args } = aArgsMaterial(paramsMaterial(material, "anchor", { reducirTransparencia: true }));
            expect(clase).toBe("MeshBasicMaterial");
            expect(args.opacity).toBe(0.94);
        }
    });
    it("contraste alto sube la opacidad a ≥ 0,92 y engorda el borde", () => {
        const p = paramsMaterial("translucido", "horizon", { contrasteAlto: true });
        expect(aArgsMaterial(p).args.opacity).toBeGreaterThanOrEqual(0.92);
        expect([p.borde.opacidad, p.borde.ancho]).toEqual([0.95, 0.004]);
    });
    it("con opacidadMinima 0,82 ningún nivel baja de ella", () => {
        for (const material of MATERIALES) {
            const { args } = aArgsMaterial(paramsMaterial(material, "zenith", { opacidadMinima: 0.82 }));
            expect(args.opacity as number).toBeGreaterThanOrEqual(0.82);
        }
    });
});

describe("crearMaterial / claseMaterialPanel (THREE inyectado, sin WebGL)", () => {
    it("crearMaterial construye la clase correcta con los args del contrato", () => {
        const m = crearMaterial(TRES, paramsMaterial("transmision-completa", "logic"));
        expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(argsDe(m).transmission).toBe(1);
        expect(argsDe(m).dispersion).toBe(0.2);
    });
    it("la clase que pide uikit se instancia SIN argumentos y hereda del material pedido", () => {
        const m = new (claseMaterialPanel(TRES, paramsMaterial("transmision-media", "anchor")))();
        expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(argsDe(m).transmission).toBe(0.9);
    });
});

describe("texto con tamaño angular mínimo", () => {
    it("a 1,8 m una línea de 1° mide ≈ 0,031 m (y su fontSize en px)", () => {
        expect(altoTextoMinimo(1.8)).toBeCloseTo(0.0314, 4);
        expect(fontSizeTexto(1.8)).toBeCloseTo(31.42, 1);
    });
    it("Texto3D impone el mínimo, usa el color del token y no baja un tamaño mayor", () => {
        renderToStaticMarkup(React.createElement(Texto3D, { distancia: 1.8 }, "Hola"));
        expect(h.texto?.fontSize).toBeCloseTo(31.42, 1);
        expect(h.texto?.color).toBe(CRISTAL.texto);
        renderToStaticMarkup(React.createElement(Texto3D, { distancia: 4, fontSize: 12 }, "Hola"));
        expect(h.texto?.fontSize).toBeCloseTo(69.8, 1);
    });
});

describe("PanelCristal (uikit simulado)", () => {
    it("nivel media por defecto: vidrio-entorno, borde de acento y medidas en px", () => {
        renderToStaticMarkup(React.createElement(PanelCristal, { nodo: "logic", ancho: 0.7, alto: 1.1 }));
        const props = h.panel as Record<string, unknown>;
        expect([props.width, props.height, props.backgroundColor]).toEqual([700, 1100, CRISTAL.borde.color]);
        expect(String(props.borderColor)).toContain("255, 191, 0");
        expect(new (claseDePanel())()).toBeInstanceOf(THREE.MeshStandardMaterial);
    });
    it("lee el nivel de NivelCalidadContext (alta → transmisión media)", () => {
        renderToStaticMarkup(React.createElement(NivelCalidadContext.Provider, { value: "alta" },
            React.createElement(PanelCristal, { nodo: "zenith", ancho: 1, alto: 1 })));
        const m = new (claseDePanel())();
        expect(m).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(argsDe(m).transmission).toBe(0.9);
    });
    it("las preferencias de la persona mandan: reducir transparencias → Basic", () => {
        h.confort = { reducirTransparencia: true, contrasteAlto: false };
        renderToStaticMarkup(React.createElement(PanelCristal, { nodo: "anchor", ancho: 1, alto: 0.1 }));
        expect(new (claseDePanel())()).toBeInstanceOf(THREE.MeshBasicMaterial);
    });
});
