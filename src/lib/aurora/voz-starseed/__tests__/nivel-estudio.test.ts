import { describe, it, expect } from "vitest";

import type { Capacidades } from "../capacidades";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import { nivelPorDefecto, nivelesDisponibles, estudioDisponible, estudioSegunUso, nivelTopeSegunUso, acotarNivel } from "../niveles";
import type { EstadoEstudio } from "../niveles";
import { elegirPrimeraFrase, latenciasMedidas, usoDelTurno, type MotorInstantaneo } from "../motor";

/** Capacidades base (las más pobres); cada prueba toca solo lo que le importa. */
const caps: Capacidades = { memoriaGB: null, nucleos: null, webgpu: false, wasmSimd: false, movil: false, daemonLocal: false };

/** Estados MEDIDOS de VoiceStudio, con medidas falsas. */
const estudio = (vivo: boolean, memoriaLibreGB: number | null, servida = false): EstadoEstudio => ({ voicestudioVivo: vivo, memoriaLibreGB, servidaPorOtraNeurona: servida });

/** Medida falsa de `medidas-voz.ts`, ya validada por su forma. */
const medida = (neurona: string, motor: string, valor: number, tipo: MedidaVoz["tipo"], en: number): MedidaVoz => ({ neurona, motor, tipo, valor, timestamp: en });

describe("estudioDisponible (niveles.ts)", () => {
    it("sin estado, muerto o con menos de 8 GB libres y sin servida → no", () => {
        expect(estudioDisponible(undefined)).toBe(false);
        expect(estudioDisponible(estudio(false, 64))).toBe(false);
        expect(estudioDisponible(estudio(true, 4))).toBe(false);
        expect(estudioDisponible(estudio(true, null))).toBe(false);
    });

    it("vivo con 8 GB libres (o más) → sí; vivo servida por otra neurona → sí", () => {
        expect(estudioDisponible(estudio(true, 8))).toBe(true);
        expect(estudioDisponible(estudio(true, 16))).toBe(true);
        expect(estudioDisponible(estudio(true, null, true))).toBe(true);
        expect(estudioDisponible(estudio(true, 2, true))).toBe(true);
    });
});

describe("uso y tope de «estudio»", () => {
    it("estudioSegunUso: solo lectura, doblaje y audiolibros", () => {
        expect(estudioSegunUso("lectura")).toBe(true);
        expect(estudioSegunUso("doblaje")).toBe(true);
        expect(estudioSegunUso("audiolibro")).toBe(true);
        expect(estudioSegunUso("conversacion")).toBe(false);
        expect(estudioSegunUso("aviso")).toBe(false);
    });

    it("nivelTopeSegunUso: el tope es «alta» salvo en los usos de estudio", () => {
        expect(nivelTopeSegunUso("conversacion")).toBe("alta");
        expect(nivelTopeSegunUso("aviso")).toBe("alta");
        expect(nivelTopeSegunUso("lectura")).toBeNull();
        expect(nivelTopeSegunUso("doblaje")).toBeNull();
        expect(nivelTopeSegunUso("audiolibro")).toBeNull();
    });

    it("acotarNivel solo BAJA al nivel que supera el tope", () => {
        expect(acotarNivel("estudio", "alta")).toBe("alta");
        expect(acotarNivel("alta", "alta")).toBe("alta");
        expect(acotarNivel("nube", "alta")).toBe("nube");
        expect(acotarNivel("minima", "alta")).toBe("minima");
    });
});

describe("nivelPorDefecto con el estado de VoiceStudio", () => {
    it("vivo + 8 GB libres o servida por otra neurona → estudio (sin demonio hace falta)", () => {
        expect(nivelPorDefecto(caps, estudio(true, 8))).toBe("estudio");
        expect(nivelPorDefecto({ ...caps, daemonLocal: true }, estudio(true, null, true))).toBe("estudio");
    });

    it("vivo pero sin carga suficiente → el demonio queda como «alta»", () => {
        expect(nivelPorDefecto({ ...caps, daemonLocal: true }, estudio(true, 4))).toBe("alta");
        expect(nivelPorDefecto({ ...caps, daemonLocal: true }, estudio(false, 64))).toBe("alta");
    });

    it("sin datos de VoiceStudio manda la regla histórica del demonio con 8 GB", () => {
        expect(nivelPorDefecto({ ...caps, daemonLocal: true, memoriaGB: 8 })).toBe("estudio");
        expect(nivelPorDefecto({ ...caps, daemonLocal: true })).toBe("alta");
    });

    it("muerto el estudio con demonio, ni la RAM de 8 GB lo devuelve arriba", () => {
        expect(nivelPorDefecto({ ...caps, daemonLocal: true, memoriaGB: 16 }, estudio(false, null))).toBe("alta");
    });

    it("nivelesDisponibles respeta el mismo tope y siempre incluye «minima»", () => {
        expect(nivelesDisponibles(caps, estudio(true, 8))[0]).toBe("estudio");
        expect(nivelesDisponibles({ ...caps, daemonLocal: true }, estudio(false, 16))[0]).toBe("alta");
        expect(nivelesDisponibles({ ...caps, movil: true, webgpu: true }, estudio(false, 16))).toEqual(["minima"]);
    });
});

describe("Regla instantánea (motor.ts)", () => {
    it("usoDelTurno deduce del contexto y la palabra de quien llama manda", () => {
        expect(usoDelTurno("conversacion")).toBe("conversacion");
        expect(usoDelTurno("aviso")).toBe("aviso");
        expect(usoDelTurno("lectura")).toBe("lectura");
        expect(usoDelTurno("rito")).toBe("aviso");
        expect(usoDelTurno("imaginacion")).toBe("conversacion");
        expect(usoDelTurno("conversacion", "doblaje")).toBe("doblaje");
    });

    it("latenciasMedidas: solo «primer-sonido» de ESA neurona; la más reciente gana", () => {
        const medidas: MedidaVoz[] = [
            medida("n1", "kokoro", 900, "primer-sonido", 100), medida("n1", "kokoro", 400, "primer-sonido", 200),
            medida("n1", "kokoro", 10, "correccion", 300), medida("n2", "kokoro", 50, "primer-sonido", 400),
            medida("n1", "navegador", 1200, "primer-sonido", 150),
        ];
        expect(latenciasMedidas(medidas, "n1")).toEqual({ kokoro: 400, navegador: 1200 });
        expect(latenciasMedidas(medidas, "n2")).toEqual({ kokoro: 50 });
        expect(latenciasMedidas([], "n1")).toEqual({});
    });

    it("elegirPrimeraFrase: el PERMITIDO de menor latencia MEDIDA con voz; sin medida al final; empate id alfabético", () => {
        const m = (id: string, latenciaMs: number | undefined, tieneVoz = true): MotorInstantaneo => ({ id, latenciaMs, tieneVoz });
        expect(elegirPrimeraFrase([m("navegador", 1200), m("kokoro", 400)])?.id).toBe("kokoro");
        expect(elegirPrimeraFrase([m("medido", 5000), m("sinmedida", undefined)])?.id).toBe("medido");
        expect(elegirPrimeraFrase([m("sinmedida", undefined), m("sinvoz", 10, false)])?.id).toBe("sinmedida");
        expect(elegirPrimeraFrase([])).toBeUndefined();
        expect(elegirPrimeraFrase([m("a", undefined, false)])).toBeUndefined();
        expect(elegirPrimeraFrase([m("zeta", 400), m("azul", 400)])?.id).toBe("azul");
    });
});
