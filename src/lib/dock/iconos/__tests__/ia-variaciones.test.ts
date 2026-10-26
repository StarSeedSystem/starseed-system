// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceAvailability } from "@/ai/astraura/availability";
import {
    TOPE_IMAGENES_POR_HORA,
    contarDePagoListos,
    elegirModeloGratis,
    modelosElegibles,
    pedirVariacionesSvg,
    topesActuales,
} from "../ia-variaciones";
import { TOPE_IA_POR_HORA } from "../ia-prompt";

function fuente(id: string, tier: SourceAvailability["source"]["tier"], ready: boolean, modelos: Array<{ id: string; quality: number; strengths?: string[] }>, privacy: "local" | "browser" | "cloud" = "cloud"): SourceAvailability {
    return {
        ready,
        source: {
            id, label: id.toUpperCase(), tier, privacy,
            models: modelos.map((m) => ({ id: m.id, label: m.id, quality: m.quality, strengths: m.strengths ?? [] })),
        },
    } as unknown as SourceAvailability;
}

const disponibles: SourceAvailability[] = [
    fuente("nube-pago", "paid", true, [{ id: "gran", quality: 10, strengths: ["code"] }]),
    fuente("gratis-nube", "free-key", true, [{ id: "medio", quality: 6, strengths: ["chat"] }, { id: "codigo", quality: 7, strengths: ["code"] }]),
    fuente("local", "local", true, [{ id: "pequeno", quality: 4 }], "local"),
    fuente("apagada", "free-key", false, [{ id: "x", quality: 9 }]),
];

describe("modelosElegibles", () => {
    it("sin permiso de pago, no ofrece nada de pago ni lo que no esté listo", () => {
        const l = modelosElegibles(disponibles, { permitirPago: false });
        expect(l.map((m) => m.sourceId)).not.toContain("nube-pago");
        expect(l.map((m) => m.sourceId)).not.toContain("apagada");
        expect(l.every((m) => m.gratis)).toBe(true);
    });
    it("con permiso, los de pago aparecen marcados y al final", () => {
        const l = modelosElegibles(disponibles, { permitirPago: true });
        expect(l.at(-1)!.sourceId).toBe("nube-pago");
        expect(l.at(-1)!.gratis).toBe(false);
    });
    it("lo local va primero", () => {
        expect(modelosElegibles(disponibles, { permitirPago: false })[0].sourceId).toBe("local");
    });
    it("cuenta los de pago listos sin ofrecerlos", () => {
        expect(contarDePagoListos(disponibles)).toBe(1);
    });
});

describe("elegirModeloGratis", () => {
    it("elige el más capaz para dibujar entre los gratuitos listos, nunca uno de pago", () => {
        const m = elegirModeloGratis(disponibles)!;
        expect(m.sourceId).toBe("gratis-nube");
        expect(m.modelId).toBe("codigo");
        expect(m.gratis).toBe(true);
    });
    it("devuelve null si solo hay de pago o nada", () => {
        expect(elegirModeloGratis([fuente("p", "paid", true, [{ id: "a", quality: 9 }])])).toBeNull();
        expect(elegirModeloGratis([])).toBeNull();
    });
});

describe("pedirVariacionesSvg · antes de gastar nada", () => {
    beforeEach(() => {
        try { window.localStorage.clear(); } catch { /* */ }
        vi.resetModules();
    });

    it("si se llegó al tope por hora, no llama a nada y explica cuándo volver", async () => {
        const ahora = Date.now();
        window.localStorage.setItem("starseed.dock.iconos.ia.texto.v1", JSON.stringify(Array.from({ length: TOPE_IA_POR_HORA }, (_, i) => ahora - i * 1000)));
        const r = await pedirVariacionesSvg({ encargo: { descripcion: "x", cantidad: 2 }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/tope|peticiones/i);
        expect(topesActuales().texto.permitido).toBe(false);
    });

    it("los topes de texto e imagen son independientes", () => {
        const ahora = Date.now();
        window.localStorage.setItem("starseed.dock.iconos.ia.imagen.v1", JSON.stringify(Array.from({ length: TOPE_IMAGENES_POR_HORA }, (_, i) => ahora - i)));
        const t = topesActuales();
        expect(t.imagen.permitido).toBe(false);
        expect(t.texto.permitido).toBe(true);
    });
});

describe("pedirVariacionesSvg · con el enrutador simulado", () => {
    beforeEach(() => {
        try { window.localStorage.clear(); } catch { /* */ }
        vi.resetModules();
    });

    function simular(avail: SourceAvailability[], chat: (req: Record<string, unknown>) => unknown) {
        vi.doMock("@/ai/astraura/availability", () => ({ detectAvailability: vi.fn(async () => avail) }));
        vi.doMock("@/ai/astraura/router", () => ({ astrauraChat: vi.fn(async (req: Record<string, unknown>) => chat(req)) }));
    }
    const svg = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" stroke="currentColor" fill="none"/></svg>';

    it("sin ninguna IA lista lo dice con el camino para arreglarlo y no gasta una petición", async () => {
        simular([], () => { throw new Error("no debería llamarse"); });
        const { pedirVariacionesSvg: pedir, topesActuales: topes } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Ajustes → Inteligencia/);
        expect(topes().texto.usadas).toBe(0);
    });

    it("solo hay un modelo de pago y no está permitido: no se usa", async () => {
        simular([fuente("p", "paid", true, [{ id: "a", quality: 9 }])], () => { throw new Error("no debería llamarse"); });
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(false);
    });

    it("un modelo de pago elegido a mano sin permiso se rechaza", async () => {
        simular([fuente("p", "paid", true, [{ id: "a", quality: 9 }])], () => { throw new Error("no debería llamarse"); });
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, modelo: { sourceId: "p", modelId: "a" }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/pago/);
    });

    it("pide UNA sola vez, fuerza el mejor modelo gratuito y devuelve variaciones saneadas", async () => {
        let llamadas = 0;
        let forzado: unknown;
        simular(disponibles, (req) => {
            llamadas++;
            forzado = req.forceSource;
            return { text: `### Variación 1: Anillo\nforma: hexagono\ncolorGlifo: #ffffff\n${svg}\n### Variación 2\n<svg viewBox="0 0 64 64" onload="x()"><script>1</script><path d="M1 1L9 9" stroke="currentColor"/></svg>`, route: { sourceLabel: "GRATIS-NUBE", modelLabel: "codigo", free: true, local: false } };
        });
        const { pedirVariacionesSvg: pedir, topesActuales: topes } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "un anillo", cantidad: 2 }, permitirPago: false });
        expect(llamadas).toBe(1);
        expect(forzado).toEqual({ sourceId: "gratis-nube", modelId: "codigo" });
        expect(r.ok).toBe(true);
        expect(r.variaciones).toHaveLength(2);
        expect(r.via).toBe("GRATIS-NUBE · codigo");
        expect(r.dePago).toBe(false);
        for (const v of r.variaciones) expect((v.glifo as { svg: string }).svg).not.toMatch(/script|onload/);
        expect(topes().texto.usadas).toBe(1);
    });

    it("si responde solo la reserva local del enrutador, no lo presenta como éxito", async () => {
        simular(disponibles, () => ({ text: "Hola, soy la respuesta de reserva.", route: { sourceLabel: "local", modelLabel: "plantilla", free: true, local: true } }));
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Ninguna IA respondió/);
    });

    it("una respuesta sin dibujos válidos falla con motivo", async () => {
        simular(disponibles, () => ({ text: "No sé dibujar eso.", route: { sourceLabel: "A", modelLabel: "b", free: true } }));
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBeTruthy();
    });

    it("avisa si el enrutador acabó usando un modelo de pago", async () => {
        simular(disponibles, () => ({ text: svg, route: { sourceLabel: "P", modelLabel: "g", free: false } }));
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(true);
        expect(r.dePago).toBe(true);
    });

    it("un error del enrutador se cuenta y no lanza", async () => {
        simular(disponibles, () => { throw new Error("red caída"); });
        const { pedirVariacionesSvg: pedir } = await import("../ia-variaciones");
        const r = await pedir({ encargo: { descripcion: "x", cantidad: 1 }, permitirPago: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/red caída/);
    });
});
