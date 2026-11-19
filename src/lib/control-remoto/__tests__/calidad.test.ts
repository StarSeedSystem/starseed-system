/**
 * CTL1119B · Pruebas del medidor de calidad: fps (ventana 3 s), retardo, kbps,
 * resolución, calidad/códec, pérdidas y medio.
 */
import { describe, expect, it, vi } from "vitest";
import { crearMedidorCalidad, type ConfigCalidad, type MedioControl, type MetricasCalidad, type MuestraCuadro, type MuestraOrden } from "../calidad";

const AHORA_BASE = 1_700_000_000_000;

interface TestConfig extends ConfigCalidad {
    _test: { avanzar: (ms: number) => void; lineas: () => string[] };
}

function crearConfig(sobre?: Partial<ConfigCalidad>): TestConfig {
    let t = AHORA_BASE;
    const lineas: string[] = [];
    return {
        ahora: () => t,
        anotar: (l) => lineas.push(l),
        ventanaFpsMs: 3000,
        intervaloRegistroMs: 10000,
        ...sobre,
        _test: { avanzar: (ms: number) => { t += ms; }, lineas: () => lineas },
    } as TestConfig;
}

function cuadro(bytes: number, ancho = 1280, alto = 720, calidad = 60, codec = "h264", dt = 0): MuestraCuadro {
    return { timestamp: AHORA_BASE + dt, bytes, ancho, alto, calidad, codec };
}
function orden(rtt: number, medio: MedioControl = "red-local", dt = 0): MuestraOrden {
    return { timestampEnvio: AHORA_BASE + dt, timestampRespuesta: AHORA_BASE + dt + rtt, medio };
}

describe("crearMedidorCalidad", () => {
    it("sin datos devuelve null", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        expect(m.obtenerMetricas()).toBeNull();
    });

    it("fps: cuenta cuadros en la ventana de 3 s", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(10000, 1280, 720, 60, "h264", 0));
        m.registrarCuadro(cuadro(10000, 1280, 720, 60, "h264", 1000));
        m.registrarCuadro(cuadro(10000, 1280, 720, 60, "h264", 2000));
        c._test.avanzar(2500);
        expect(m.obtenerMetricas()?.fps).toBeCloseTo(3 / 3, 1);
    });

    it("fps: descarta cuadros fuera de la ventana", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(10000, 1280, 720, 60, "h264", 0));
        c._test.avanzar(4000);
        m.registrarCuadro(cuadro(10000, 1280, 720, 60, "h264", 4000));
        expect(m.obtenerMetricas()?.fps).toBeCloseTo(1 / 3, 1);
    });

    it("rttMs: promedio de las órdenes en la ventana", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarOrden(orden(40, "red-local", 0));
        m.registrarOrden(orden(60, "red-local", 1000));
        m.registrarOrden(orden(80, "red-local", 2000));
        c._test.avanzar(2500);
        expect(m.obtenerMetricas()?.rttMs).toBeCloseTo(60, 0);
    });

    it("rttMs: ignora órdenes sin respuesta (timestampRespuesta <= timestampEnvio)", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarOrden({ timestampEnvio: AHORA_BASE, timestampRespuesta: AHORA_BASE, medio: "red-local" });
        m.registrarOrden(orden(50, "red-local", 1000));
        c._test.avanzar(2000);
        expect(m.obtenerMetricas()?.rttMs).toBe(50);
    });

    it("kbps: bytes * 8 / ventana en segundos", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(1500, 1280, 720, 60, "h264", 0));
        m.registrarCuadro(cuadro(1500, 1280, 720, 60, "h264", 1000));
        m.registrarCuadro(cuadro(1500, 1280, 720, 60, "h264", 2000));
        c._test.avanzar(2500);
        expect(m.obtenerMetricas()?.kbps).toBeCloseTo(12, 0);
    });

    it("resolución y calidad/códec: toma el último cuadro de la ventana", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(1000, 800, 600, 50, "vp8", 0));
        m.registrarCuadro(cuadro(1000, 1280, 720, 60, "h264", 1000));
        m.registrarCuadro(cuadro(1000, 1920, 1080, 70, "h265", 2000));
        c._test.avanzar(2500);
        const met = m.obtenerMetricas()!;
        expect(met.ancho).toBe(1920);
        expect(met.alto).toBe(1080);
        expect(met.calidad).toBe(70);
        expect(met.codec).toBe("h265");
    });

    it("pérdidas: porcentaje de órdenes sin respuesta válida", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.registrarOrden(orden(40, "red-local", 0));
        m.registrarOrden({ timestampEnvio: AHORA_BASE + 1000, timestampRespuesta: AHORA_BASE + 1000, medio: "red-local" });
        m.registrarOrden(orden(50, "red-local", 2000));
        c._test.avanzar(2500);
        expect(m.obtenerMetricas()?.perdidas).toBeCloseTo(33.3, 0);
    });

    it("medio: se actualiza con establecerMedio y se refleja en métricas", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        m.establecerMedio("bluetooth");
        m.registrarCuadro(cuadro(1000, 1280, 720, 60, "h264", 0));
        c._test.avanzar(100);
        expect(m.obtenerMetricas()?.medio).toBe("bluetooth");
    });

    it("iniciar: emite línea de registro cada intervaloRegistroMs con formato correcto", () => {
        vi.useFakeTimers();
        vi.setSystemTime(AHORA_BASE);
        const c = crearConfig({ intervaloRegistroMs: 1000, ahora: () => Date.now() });
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(2000, 1280, 720, 60, "h264", 0));
        m.registrarOrden(orden(30, "red-local", 0));
        const detener = m.iniciar();
        vi.advanceTimersByTime(1100);
        vi.advanceTimersByTime(1100);
        detener();
        const lineas = c._test.lineas();
        expect(lineas.length).toBeGreaterThanOrEqual(2);
        for (const l of lineas) {
            expect(l).toMatch(/^control-calidad fps=[\d.]+ rtt_ms=\d+ kbps=\d+ lado=\d+x\d+ calidad=\d+ codec=\w+ perdidas=[\d.]+% medio=\w+$/);
        }
        vi.useRealTimers();
    });

    it("iniciar: idempotente, devolver la misma función de limpieza no rompe", () => {
        const c = crearConfig();
        const m = crearMedidorCalidad(c);
        const d1 = m.iniciar();
        const d2 = m.iniciar();
        expect(typeof d1).toBe("function");
        expect(typeof d2).toBe("function");
        d1();
        d2();
    });

    it("ventanaFpsMs configurable", () => {
        const c = crearConfig({ ventanaFpsMs: 1000 });
        const m = crearMedidorCalidad(c);
        m.registrarCuadro(cuadro(1000, 1280, 720, 60, "h264", 0));
        m.registrarCuadro(cuadro(1000, 1280, 720, 60, "h264", 500));
        c._test.avanzar(800);
        expect(m.obtenerMetricas()?.fps).toBeCloseTo(2, 0);
    });

    it("ahora configurable (para pruebas deterministas)", () => {
        let t = 1000;
        const c = crearConfig({ ahora: () => t });
        const m = crearMedidorCalidad(c);
        m.registrarCuadro({ timestamp: 1000, bytes: 1000, ancho: 100, alto: 100, calidad: 50, codec: "h264" });
        t = 1500;
        expect(m.obtenerMetricas()?.fps).toBeCloseTo(1 / 3, 1);
    });
});