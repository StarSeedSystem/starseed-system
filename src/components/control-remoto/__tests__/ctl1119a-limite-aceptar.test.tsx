/**
 * CTL1119A · el límite que la persona elige al ACEPTAR llega de verdad a la sesión.
 * Sin esto la banda guardaba la cuenta atrás solo para pintarla y la puerta seguía abriendo sin tope.
 */
import { describe, expect, it } from "vitest";
import { aceptarPendiente, filtroPorAmbito, finDeLimite, limiteNormalizado, type LimiteSesion, type PermisoControl } from "@/lib/control-remoto/sesion";
import { finElegido, limiteDeOpcion, opcionInicial, opcionesPara, textoRestante, topeMinimos } from "../banda-control";

const HUELLA = "a".repeat(64);
const AHORA = Date.parse("2026-11-19T10:00:00Z");
const HORA = 60 * 60_000;

function conPendiente(cuenta = "cuenta-alex"): PermisoControl {
    return {
        encendido: true,
        nivel: "controlar",
        controladores: [],
        pendientes: [{ huella: HUELLA, spki: "spki", cuenta, nombre: "Mac", neurona: "neurona-mac", desde: "2026-11-19T09:00:00Z" }],
    };
}

describe("CTL1119A · límite elegido al aceptar", () => {
    it("convierte cada opción de la banda en el límite que guarda la puerta", () => {
        expect(limiteDeOpcion("sin-limite", "")).toEqual({ tipo: "sin-limite" });
        expect(limiteDeOpcion("15-min", "")).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteDeOpcion("1-hora", "")).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteDeOpcion("hasta", "21:30")).toEqual({ tipo: "hasta", hora: "21:30" });
    });

    it("al aceptar con 15 min la puerta recibe ese tope y lo aplica desde la aceptación", () => {
        const limite = limiteDeOpcion("15-min", "");
        const p = aceptarPendiente(conPendiente(), HUELLA, { limite, ahora: AHORA });
        expect(p.controladores[0].limite).toEqual({ tipo: "minutos", minutos: 15 });
        expect(finDeLimite(p.controladores[0].limite, Date.parse(p.controladores[0].aceptadoEn!))).toBe(AHORA + 15 * 60_000);
    });

    it("en una neurona propia y sin elegir nada, la sesión queda sin límite de tiempo", () => {
        const p = aceptarPendiente(conPendiente(), HUELLA, { ahora: AHORA });
        expect(p.controladores[0].limite).toEqual({ tipo: "sin-limite" });
        expect(finDeLimite(p.controladores[0].limite, AHORA)).toBeNull();
    });

    it("un límite que supera el máximo del dueño se recorta y nunca se supera", () => {
        const p = aceptarPendiente(conPendiente("otra"), HUELLA, { ambito: "otra-cuenta", limite: { tipo: "minutos", minutos: 240 }, ahora: AHORA });
        expect(p.controladores[0].limite).toEqual({ tipo: "minutos", minutos: 60 });
    });
});

describe("CTL1119A · topes por tipo de neurona en la banda", () => {
    it("propia: sin techo y sin límite por defecto", () => {
        expect(topeMinimos({ cuenta: "cuenta-alex" }, "cuenta-alex")).toBeNull();
        expect(opcionInicial(true, null)).toBe("sin-limite");
        expect(opcionesPara(true, null)).toContain("sin-limite");
    });

    it("ajena privada: el filtro por defecto es de 1 hora, nunca sin límite", () => {
        expect(topeMinimos({ cuenta: "otra", visibilidad: "privada" }, "cuenta-alex")).toBe(60);
        expect(opcionInicial(false, 60)).toBe("15-min");
        expect(opcionesPara(false, 60)).not.toContain("sin-limite");
        expect(finElegido("sin-limite", "", AHORA, 60, false).ok).toBe(false);
        expect(finElegido("1-hora", "", AHORA, 60, false)).toEqual({ ok: true, fin: AHORA + HORA });
    });

    it("pública: el tope es corto y ni «hasta las» lo supera", () => {
        expect(topeMinimos({ cuenta: "otra", publico: true }, "cuenta-alex")).toBe(15);
        expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
        const r = finElegido("hasta", "23:00", AHORA, 15, false);
        expect(r.ok).toBe(false);
    });

    it("el máximo declarado por el dueño manda sobre el de por defecto", () => {
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 30 }, "cuenta-alex")).toBe(30);
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 5000 }, "cuenta-alex")).toBe(1440);
    });
});

describe("CTL1119A · el punto de color dice lo que queda", () => {
    it("con límite enseña minutos u horas; sin límite no inventa cuenta atrás", () => {
        expect(textoRestante(AHORA + 90_000, AHORA)).toBe("Quedan 2 min");
        expect(textoRestante(AHORA + HORA + 5 * 60_000, AHORA)).toMatch(/quedan 1 h/);
        expect(textoRestante(null, AHORA)).toBeNull();
        expect(textoRestante(AHORA, AHORA)).toBe("Límite alcanzado");
    });

    it("el filtro público de la puerta recorta igual que la banda", () => {
        const f = filtroPorAmbito("publica");
        expect(limiteNormalizado({ tipo: "minutos", minutos: 60 }, f, AHORA)).toEqual({ tipo: "minutos", minutos: 15 });
        const l: LimiteSesion = { tipo: "minutos", minutos: 15 };
        expect(finDeLimite(l, AHORA)).toBe(AHORA + 15 * 60_000);
    });
});
