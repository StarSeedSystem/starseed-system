// Pruebas del conector de apertura en la malla (apps-en-la-malla.md §5) — todo PURO:
// sin red, sin disco y sin procesos. La oferta de la neurona llega inyectada.

import { describe, expect, it } from "vitest";
import { Cpu } from "lucide-react";
import { TOPE_LATENCIA_TRANSMITIDA_MS } from "@/lib/recursos/modos-app";
import type { OfertaNeurona } from "@/lib/recursos/oferta";
import type { StarseedApp } from "../launcher-types";
import { avisoDeApertura, decidirApertura, ETIQUETA_MODO, ofertaDeCapacidades } from "../apertura";

const macFuerte = (): OfertaNeurona => ({
    ...ofertaDeCapacidades({ memoryGb: 8, nucleos: 8, webgpu: true }),
});
const navegadorSinMedir = (): OfertaNeurona => ofertaDeCapacidades({});

const appLocal = (extra: Partial<StarseedApp> = {}): StarseedApp => ({
    id: "app-prueba",
    name: "App de prueba",
    description: "",
    icon: Cpu,
    accent: "#fff",
    category: "starseed",
    open: { primary: "tab", allowed: ["tab"] },
    ...extra,
});

const appVolumen = appLocal({ ejecucion: ["por-bandas", "montada"], requisitos: { volumen: "vol-biblioteca" } });
const appGpu = appLocal({ ejecucion: ["local", "transmitida", "ramificada"], requisitos: { gpu: true, ramMb: 2048 } });

describe("ofertaDeCapacidades", () => {
    it("usa la cota del navegador y WebGPU como GPU", () => {
        const o = ofertaDeCapacidades({ memoryGb: 8, nucleos: 6, webgpu: true });
        expect(o.computo).toEqual({ nucleos: 6, ramLibreMb: 8192, gpu: true, vramMb: undefined, motores: [] });
    });

    it("sin medidas deja 0 (sin medir) y no inventa GPU", () => {
        const o = ofertaDeCapacidades({});
        expect(o.computo).toEqual({ nucleos: 1, ramLibreMb: 0, gpu: false, vramMb: undefined, motores: [] });
    });
});

describe("decidirApertura", () => {
    it("una app sin campo ejecucion ni requisitos se abre como hoy (sin juzgar)", () => {
        expect(decidirApertura(appLocal(), { ofertaLocal: macFuerte })).toBeUndefined();
    });

    it("sin oferta medida no se juzga nada (lo no medido no se inventa)", () => {
        expect(decidirApertura(appGpu, {})).toBeUndefined();
        expect(decidirApertura(appGpu, { ofertaLocal: () => undefined })).toBeUndefined();
    });

    it("una app que sí cabe abre en local sin motivo de suelo", () => {
        const d = decidirApertura(appGpu, { ofertaLocal: macFuerte });
        expect(d?.modo).toBe("local");
        expect(d?.motivo).toBe("La app cabe en esta neurona");
        expect(avisoDeApertura(d)).toBeUndefined();
    });

    it("una app con volumen tiene modo por-bandas cuando la red trae su fuente", () => {
        const d = decidirApertura(appVolumen, { ofertaLocal: macFuerte, planApertura: () => ({ fuentesVolumen: ["a1"] }) });
        expect(d?.modo).toBe("por-bandas");
        expect(d?.destino).toBe("a1");
    });

    it("y modo montado cuando hay pasarela local", () => {
        const d = decidirApertura(appVolumen, { ofertaLocal: macFuerte, planApertura: () => ({ fuentesVolumen: ["a1"], pasarelaLocal: true }) });
        expect(d?.modo).toBe("montada");
    });

    it("transmitida cuando otra neurona la sirve bajo el tope de latencia", () => {
        const d = decidirApertura(appGpu, {
            ofertaLocal: navegadorSinMedir,
            planApertura: () => ({ otraConLaApp: { nodoId: "a1", latenciaMs: TOPE_LATENCIA_TRANSMITIDA_MS - 10 } }),
        });
        expect(d?.modo).toBe("transmitida");
        expect(d?.destino).toBe("a1");
        expect(avisoDeApertura(d)).toBe(d?.motivo);
    });

    it("con latencia fuera del tope cae al suelo honesto que también se abre", () => {
        const d = decidirApertura(appGpu, { ofertaLocal: navegadorSinMedir });
        expect(d?.modo).toBe("local");
        expect(d?.motivo.startsWith("Suelo")).toBe(true);
        expect(avisoDeApertura(d)).toBe(d?.motivo);
    });

    it("una app sin local admite un modo ajeno como suelo de la malla", () => {
        const d = decidirApertura(appLocal({ ejecucion: ["transmitida"], requisitos: { motores: ["voz"] } }), { ofertaLocal: macFuerte });
        expect(d?.modo).toBe("transmitida");
        expect(d?.motivo.startsWith("Suelo")).toBe(true);
    });
});

describe("ETIQUETA_MODO", () => {
    it("cubre las cinco formas del §5", () => {
        expect(Object.keys(ETIQUETA_MODO)).toEqual(["local", "por-bandas", "montada", "transmitida", "ramificada"]);
    });
});
