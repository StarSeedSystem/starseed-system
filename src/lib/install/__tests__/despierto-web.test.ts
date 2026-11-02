import { describe, expect, it } from "vitest";

import {
    ESTADO_INICIAL_DESPIERTO,
    avanzarDespierto,
    avisoDespierto,
    esProcesoLargo,
    estadoDespierto,
    etapaDespierto,
    type EventoDespierto,
} from "../despierto-web";

const base = ESTADO_INICIAL_DESPIERTO;

const tras = (...eventos: EventoDespierto[]) =>
    eventos.reduce<ReturnType<typeof avanzarDespierto>["estado"]>(
        (e, ev) => avanzarDespierto(e, ev).estado,
        base,
    );

describe("esProcesoLargo", () => {
    it("los procesos largos del OS piden bloqueo", () => {
        expect(esProcesoLargo("transmision")).toBe(true);
        expect(esProcesoLargo("estacion")).toBe(true);
        expect(esProcesoLargo("contenedor")).toBe(true);
    });

    it("lo demás no", () => {
        expect(esProcesoLargo("lectura")).toBe(false);
        expect(esProcesoLargo("")).toBe(false);
    });
});

describe("avanzarDespierto", () => {
    it("empieza sin pedir nada: no hay proceso ni bloqueo", () => {
        const r = avanzarDespierto(base, "proceso-termina");
        expect(r.accion).toBe("nada");
        expect(etapaDespierto(r.estado)).toBe("suelto");
    });

    it("un proceso largo en pestaña visible pide el bloqueo", () => {
        const r = avanzarDespierto(base, "proceso-inicia");
        expect(r.accion).toBe("pedir");
        expect(etapaDespierto(r.estado)).toBe("suelto");
    });

    it("pedido en firme activa el bloqueo y ya no pide más", () => {
        const e = tras("proceso-inicia");
        const r = avanzarDespierto({ ...e, bloqueo: true }, "pestaña-oculta");
        expect(r.accion).toBe("soltar");
        expect(r.estado.bloqueo).toBe(false);
    });

    it("al ocultarse la pestaña suelta el bloqueo", () => {
        const e = tras("proceso-inicia");
        const r = avanzarDespierto({ ...e, bloqueo: true }, "pestaña-oculta");
        expect(r.accion).toBe("soltar");
        expect(etapaDespierto(r.estado)).toBe("oculta");
    });

    it("al terminar el proceso suelta y no vuelve a pedir", () => {
        const e = tras("proceso-inicia");
        const r = avanzarDespierto({ ...e, bloqueo: true }, "proceso-termina");
        expect(r.accion).toBe("soltar");
        const r2 = avanzarDespierto(r.estado, "pestaña-visible");
        expect(r2.accion).toBe("nada");
    });

    it("al volver visible con proceso vivo re pide el bloqueo", () => {
        const e = tras("proceso-inicia", "pestaña-oculta");
        const r = avanzarDespierto(e, "pestaña-visible");
        expect(r.accion).toBe("pedir");
        expect(etapaDespierto(r.estado)).toBe("suelto");
    });

    it("el navegador que suelta el bloqueo por su cuenta lo re pide", () => {
        const e = tras("proceso-inicia", "pestaña-oculta", "pestaña-visible");
        const r = avanzarDespierto(e, "bloqueo-suelto");
        expect(r.accion).toBe("pedir");
    });

    it("un fallo no entra en bucle: espera a que la pestaña vuelva a ver el proceso", () => {
        const e = tras("proceso-inicia");
        const fallo = avanzarDespierto(e, "bloqueo-fallo");
        expect(fallo.accion).toBe("nada");
        const deNuevo = avanzarDespierto(fallo.estado, "pestaña-visible");
        expect(deNuevo.accion).toBe("pedir");
    });

    it("sin soporte nunca pide", () => {
        const e = estadoDespierto(false);
        const r = avanzarDespierto(e, "proceso-inicia");
        expect(r.accion).toBe("nada");
        expect(etapaDespierto(r.estado)).toBe("sin-soporte");
    });

    it("un evento de pestaña con proceso ausente no pide", () => {
        const r = avanzarDespierto(base, "pestaña-visible");
        expect(r.accion).toBe("nada");
    });
});

describe("avisoDespierto", () => {
    it("dice la verdad: con la tapa cerrada el equipo se duerme igual", () => {
        const texto = avisoDespierto(etapaDespierto(tras("proceso-inicia")));
        expect(texto).toContain("tapa");
        expect(texto).toContain("keepalive");
    });

    it("sin soporte ofrece la app nativa o keepalive", () => {
        const texto = avisoDespierto(etapaDespierto(estadoDespierto(false)));
        expect(texto).toContain("keepalive");
        expect(texto).toContain("Wake Lock");
    });
});
