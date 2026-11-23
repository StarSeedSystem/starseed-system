/**
 * CTL1123C · Enrutamiento multiantena simultáneo y capas de conciencia.
 * Módulo puro (sin red, sin DOM, sin `any`): planifica qué antena real lleva cada función de la sesión remota
 * (`video`, `entrada`, `ordenes`, `telemetria`) según latencia, ancho de banda y disponibilidad.
 */
import { describe, expect, it } from "vitest";
import {
    planificarAntenasSimultaneas,
    resumenPlanAntenas,
    type AntenaDisponible,
    type FuncionSesion,
    type PerfilConciencia,
    type PlanAntenas,
} from "../multicapa-antenas";

const antena = (
    id: string,
    tipo: AntenaDisponible["tipo"],
    latenciaMs: number,
    anchoBandaKbps: number,
    extra: Partial<AntenaDisponible> = {}
): AntenaDisponible => ({
    id,
    tipo,
    latenciaMs,
    anchoBandaKbps,
    ...extra,
});

const perfilBajoRetardo: PerfilConciencia = {
    nombre: "bajo-retardo",
    prioridad: ["entrada", "ordenes", "telemetria", "video"],
    umbralLatenciaMs: 40,
    umbralAnchoBandaKbps: 500,
};

const perfilEquilibrado: PerfilConciencia = {
    nombre: "equilibrado",
    prioridad: ["video", "entrada", "ordenes", "telemetria"],
    umbralLatenciaMs: 100,
    umbralAnchoBandaKbps: 2000,
};

describe("planificarAntenasSimultaneas", () => {
    it("con una sola antena asigna todas las funciones a esa antena", () => {
        const disponibles = [antena("bt-1", "bluetooth", 20, 1000)];
        const plan = planificarAntenasSimultaneas(disponibles, perfilBajoRetardo);
        expect(plan.entrada).toBe("bt-1");
        expect(plan.ordenes).toBe("bt-1");
        expect(plan.telemetria).toBe("bt-1");
        expect(plan.video).toBe("bt-1");
    });

    it("prioriza Bluetooth/Wi-Fi Direct para entrada y órdenes cuando latencia < 40 ms", () => {
        const disponibles = [
            antena("bt-1", "bluetooth", 20, 1000),
            antena("wifi-1", "wifi-directo", 15, 50000),
            antena("wifi-router", "wifi-router", 50, 100000),
        ];
        const plan = planificarAntenasSimultaneas(disponibles, perfilBajoRetardo);
        expect(plan.entrada).toBe("bt-1");
        expect(plan.ordenes).toBe("bt-1");
        expect(plan.video).toBe("wifi-1");
    });

    it("usa Wi-Fi Direct para video cuando hay más de una antena de alta banda", () => {
        const disponibles = [
            antena("bt-1", "bluetooth", 20, 1000),
            antena("wifi-directo-1", "wifi-directo", 15, 50000),
            antena("wifi-router-1", "wifi-router", 50, 100000),
        ];
        const plan = planificarAntenasSimultaneas(disponibles, perfilEquilibrado);
        expect(plan.video).toBe("wifi-directo-1");
        expect(plan.entrada).toBe("bt-1");
    });

    it("asigna telemetria a la antena con mejor latencia restante", () => {
        const disponibles = [
            antena("bt-1", "bluetooth", 20, 1000),
            antena("wifi-directo-1", "wifi-directo", 15, 50000),
            antena("wifi-router-1", "wifi-router", 50, 100000),
        ];
        const plan = planificarAntenasSimultaneas(disponibles, perfilBajoRetardo);
        expect(plan.telemetria).toBe("wifi-directo-1");
    });

    it("con solo Wi-Fi router asigna todo a esa antena", () => {
        const disponibles = [antena("wifi-router-1", "wifi-router", 50, 100000)];
        const plan = planificarAntenasSimultaneas(disponibles, perfilEquilibrado);
        expect(plan.video).toBe("wifi-router-1");
        expect(plan.entrada).toBe("wifi-router-1");
        expect(plan.ordenes).toBe("wifi-router-1");
        expect(plan.telemetria).toBe("wifi-router-1");
    });

    it("respeta el orden de prioridad del perfil", () => {
        const disponibles = [
            antena("bt-1", "bluetooth", 20, 1000),
            antena("wifi-directo-1", "wifi-directo", 15, 50000),
        ];
        const perfilVideoPrimero: PerfilConciencia = {
            nombre: "video-primero",
            prioridad: ["video", "entrada", "ordenes", "telemetria"],
            umbralLatenciaMs: 40,
            umbralAnchoBandaKbps: 500,
        };
        const plan = planificarAntenasSimultaneas(disponibles, perfilVideoPrimero);
        expect(plan.video).toBe("wifi-directo-1");
        expect(plan.entrada).toBe("bt-1");
    });

    it("lanza error si no hay antenas disponibles", () => {
        expect(() => planificarAntenasSimultaneas([], perfilBajoRetardo)).toThrow("Sin antenas disponibles");
    });
});

describe("resumenPlanAntenas", () => {
    it("explica en español qué antena lleva cada función", () => {
        const plan: PlanAntenas = {
            video: "wifi-1",
            entrada: "bt-1",
            ordenes: "bt-1",
            telemetria: "wifi-1",
            antenasUsadas: [
                { id: "bt-1", tipo: "bluetooth", funcion: "entrada, órdenes" },
                { id: "wifi-1", tipo: "wifi-directo", funcion: "video, telemetría" },
            ],
        };
        const resumen = resumenPlanAntenas(plan);
        expect(resumen).toContain("Bluetooth");
        expect(resumen).toContain("entrada");
        expect(resumen).toContain("órdenes");
        expect(resumen).toContain("Wi‑Fi directo");
        expect(resumen).toContain("video");
        expect(resumen).toContain("telemetría");
    });

    it("maneja el caso de una sola antena para todo", () => {
        const plan: PlanAntenas = {
            video: "wifi-router-1",
            entrada: "wifi-router-1",
            ordenes: "wifi-router-1",
            telemetria: "wifi-router-1",
            antenasUsadas: [
                { id: "wifi-router-1", tipo: "wifi-router", funcion: "video, entrada, órdenes, telemetría" },
            ],
        };
        const resumen = resumenPlanAntenas(plan);
        expect(resumen).toContain("Wi‑Fi router");
        expect(resumen).toContain("Todas las funciones");
    });
});