/**
 * CTL1119A · el «Límite de tiempo» que la persona elige al aceptar tiene que llegar a la PUERTA
 * (el `Controlador` guardado), no quedarse en un adorno de la pantalla. En neuronas propias manda
 * la persona; en las de otra cuenta y en las públicas el tope del dueño nunca se supera.
 *
 * Solo se prueban funciones puras: la comprobación de cada opción, el tope por tipo de neurona y
 * el permiso resultante de aceptar con un límite.
 */
import { describe, expect, it } from "vitest";
import {
    aceptarConLimite,
    finElegido,
    limiteDeOpcion,
    opcionInicial,
    opcionesPara,
    textoRestante,
    topeMinimos,
} from "../banda-control";
import { MOTIVOS_TERMINALES } from "@/lib/control-remoto/palabras";
import { permisoDeFabrica, sanearPermiso, type Controlador, type PermisoControl } from "@/lib/control-remoto/sesion";

const AHORA = new Date(2026, 10, 19, 10, 0, 0, 0).getTime();
const HUELLA = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

function conPendiente(cuenta = "cuenta-alex"): PermisoControl {
    const pide: Controlador = {
        huella: HUELLA,
        spki: "c3BraQ",
        cuenta,
        nombre: "Mac de Alex",
        neurona: "99999999-2222-4333-8444-555555555555",
        desde: "2026-11-19T09:59:00Z",
    };
    return { ...permisoDeFabrica(), pendientes: [pide] };
}

function aceptado(p: PermisoControl): Controlador {
    const c = p.controladores[0];
    expect(c, "la persona quedó aceptada").toBeDefined();
    return c;
}

describe("tope del dueño por tipo de neurona", () => {
    it("propia: sin tope; otra cuenta: 60 min; pública: 15 min (por defecto)", () => {
        expect(topeMinimos({ cuenta: "cuenta-alex" }, "cuenta-alex")).toBeNull();
        expect(topeMinimos({ cuenta: "otra" }, "cuenta-alex")).toBe(60);
        expect(topeMinimos({ cuenta: "otra", publico: true }, "cuenta-alex")).toBe(15);
        expect(topeMinimos({ cuenta: "otra", visibilidad: "publica" }, "cuenta-alex")).toBe(15);
    });

    it("el máximo declarado por el dueño manda y se acota a 1..1440", () => {
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 30 }, "cuenta-alex")).toBe(30);
        expect(topeMinimos({ cuenta: "otra", filtro: { maxMin: 25 } }, "cuenta-alex")).toBe(25);
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 99_999 }, "cuenta-alex")).toBe(1440);
        expect(topeMinimos({ cuenta: "otra", limiteMaxMin: 0 }, "cuenta-alex")).toBe(1);
    });

    it("sin saber la cuenta propia, no se regala «sin límite» a una ajena", () => {
        expect(topeMinimos({ cuenta: "otra" }, null)).toBe(60);
    });

    it("las opciones ofrecidas y la inicial respetan el tope", () => {
        expect(opcionesPara(true, null)).toContain("sin-limite");
        expect(opcionesPara(false, null)).toContain("sin-limite");
        expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
        expect(opcionesPara(false, 60)).toEqual(["15-min", "1-hora", "hasta"]);
        expect(opcionInicial(true, null)).toBe("sin-limite");
        expect(opcionInicial(false, 60)).toBe("15-min");
    });
});

describe("la elección se convierte en la forma que guarda la puerta", () => {
    it("cada opción tiene su límite, y «hasta» conserva la hora", () => {
        expect(limiteDeOpcion("sin-limite", "")).toEqual({ tipo: "sin-limite" });
        expect(limiteDeOpcion("15-min", "")).toEqual({ tipo: "minutos", minutos: 15 });
        expect(limiteDeOpcion("1-hora", "")).toEqual({ tipo: "minutos", minutos: 60 });
        expect(limiteDeOpcion("hasta", "21:30")).toEqual({ tipo: "hasta", hora: "21:30" });
    });

    it("una ajena no puede quedarse sin límite ni pasarse del máximo", () => {
        expect(finElegido("sin-limite", "", AHORA, 60, false)).toEqual({ ok: false, motivo: expect.stringMatching(/sin límite/i) });
        expect(finElegido("1-hora", "", AHORA, 15, false)).toEqual({ ok: false, motivo: expect.stringMatching(/máximo/i) });
        expect(finElegido("hasta", "12:00", AHORA, 60, false)).toEqual({ ok: true, fin: new Date(2026, 10, 19, 12, 0, 0, 0).getTime() });
        expect(finElegido("hasta", "20:00", AHORA, 60, false).ok).toBe(false);
    });

    it("el punto de color solo enseña cuenta atrás si de verdad hay límite", () => {
        expect(textoRestante(null, AHORA)).toBeNull();
        expect(textoRestante(AHORA + 90_000, AHORA)).toBe("Quedan 2 min");
        expect(textoRestante(AHORA + 60 * 60_000, AHORA)).toMatch(/quedan 1 h/);
        expect(textoRestante(AHORA - 1, AHORA)).toBe("Límite alcanzado");
    });
});

describe("aceptar con límite guarda el límite en la puerta", () => {
    it("propia con 15 min: el controlador aceptado lleva 15 minutos y su fin", () => {
        const r = aceptarConLimite(conPendiente(), HUELLA, "15-min", "", true, null, AHORA);
        expect(r.ok, JSON.stringify(r)).toBe(true);
        if (!r.ok) return;
        expect(aceptado(r.permiso).limite).toEqual({ tipo: "minutos", minutos: 15 });
        expect(aceptado(r.permiso).aceptadoEn).toBe(new Date(AHORA).toISOString());
        expect(r.fin).toBe(AHORA + 15 * 60_000);
    });

    it("propia sin límite: el controlador aceptado queda sin tope de duración", () => {
        const r = aceptarConLimite(conPendiente(), HUELLA, "sin-limite", "", true, null, AHORA);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(aceptado(r.permiso).limite).toEqual({ tipo: "sin-limite" });
        expect(r.fin).toBeNull();
    });

    it("otra cuenta: 1 h se acepta con 60 min; «sin límite» se rechaza sin tocar el permiso", () => {
        const base = conPendiente("otra-cuenta");
        const unoHora = aceptarConLimite(base, HUELLA, "1-hora", "", false, 60, AHORA);
        expect(unoHora.ok).toBe(true);
        if (unoHora.ok) expect(aceptado(unoHora.permiso).limite).toEqual({ tipo: "minutos", minutos: 60 });

        const libre = aceptarConLimite(base, HUELLA, "sin-limite", "", false, 60, AHORA);
        expect(libre).toEqual({ ok: false, motivo: expect.stringMatching(/sin límite/i) });
        expect(base.pendientes).toHaveLength(1);
    });

    it("el límite guardado sobrevive a sanearPermiso y el cumplido ya no se reintenta", () => {
        const r = aceptarConLimite(conPendiente("otra-cuenta"), HUELLA, "15-min", "", false, 15, AHORA);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const saneado = sanearPermiso(JSON.parse(JSON.stringify(r.permiso)));
        expect(saneado.controladores[0].limite).toEqual({ tipo: "minutos", minutos: 15 });
        expect(MOTIVOS_TERMINALES.has("limite-cumplido")).toBe(true);
    });
});
