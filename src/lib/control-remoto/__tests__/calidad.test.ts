/**
 * CTL1119B · pruebas del cálculo de calidad (fps, rtt, kbps, resolución, pérdidas, medio).
 * Solo funciones puras exportadas: entrada → salida, sin red, sin disco, sin reloj.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
    AcuseOrden,
    añadirAcuse,
    añadirCuadro,
    actualizarMedio,
    calcularMetricas,
    CuadroRecibido,
    estadoInicial,
    lineaRegistro,
    marcarRegistro,
    tocaRegistro,
    textoUi,
    colorFps,
    INTERVALO_REGISTRO_MS,
    VENTANA_FPS_MS,
    VIDA_ORDEN_MS,
} from "../calidad";

const AHORA = 1_000_000;

function cuadro(t: number, bytes: number, ancho: number, alto: number, extra: Partial<CuadroRecibido> = {}): CuadroRecibido {
    return { t, bytes, ancho, alto, completo: true, ...extra };
}

function acuse(nonce: string, tEnvio: number, tAcuse: number, medio: tipoMedio = "red-local", ok = true): AcuseOrden {
    return { nonce, tEnvio, tAcuse, medio, ok };
}

describe("CTL1119B · estado y poda", () => {
    it("estadoInicial crea estado vacío con lado y medio", () => {
        const e = estadoInicial("controlador", "wifi-directo");
        expect(e.lado).toBe("controlador");
        expect(e.medioActual).toBe("wifi-directo");
        expect(e.cuadros).toEqual([]);
        expect(e.acuses).toEqual([]);
        expect(e.ultimoRegistro).toBe(0);
    });

    it("añadirCuadro poda cuadros fuera de la ventana de 3 s (estrictamente < límite)", () => {
        const e = estadoInicial("aparato");
        // El límite se calcula con el t del último cuadro añadido
        añadirCuadro(e, cuadro(AHORA - 4_000, 1000, 800, 600)); // t = AHORA - 4000
        añadirCuadro(e, cuadro(AHORA - 2_000, 2000, 800, 600)); // t = AHORA - 2000, límite = -2000 - 3000 = -5000
        añadirCuadro(e, cuadro(AHORA - 1_000, 3000, 800, 600)); // t = AHORA - 1000, límite = -1000 - 3000 = -4000
        // El cuadro en -4000 NO se poda (t < -4000 es falso), así que quedan 3
        expect(e.cuadros.length).toBe(3);
        expect(e.cuadros[0].t).toBe(AHORA - 4_000);
    });

    it("añadirAcuse poda acuses de más de 2 min (estrictamente < límite)", () => {
        const e = estadoInicial("controlador");
        // El límite usa tAcuse del último acuse
        añadirAcuse(e, acuse("a", AHORA - 130_000, AHORA - 129_000)); // tAcuse = AHORA - 129000
        añadirAcuse(e, acuse("b", AHORA - 10_000, AHORA - 9_000)); // tAcuse = AHORA - 9000, límite = -9000 - 120000 = -129000
        // El acuse en -129000 NO se poda (tAcuse < -129000 es falso), así que quedan 2
        expect(e.acuses.length).toBe(2);
        expect(e.acuses[0].nonce).toBe("a");
    });

    it("actualizarMedio cambia el medio actual", () => {
        const e = estadoInicial("aparato", "bluetooth");
        actualizarMedio(e, "internet");
        expect(e.medioActual).toBe("internet");
    });
});

describe("CTL1119B · cálculo de métricas", () => {
    it("sin cuadros devuelve ceros y nulls", () => {
        const e = estadoInicial("controlador");
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBe(0);
        expect(m.rttMs).toBe(0);
        expect(m.kbps).toBe(0);
        expect(m.resolucion).toBeNull();
        expect(m.codec).toBeNull();
        expect(m.calidad).toBeNull();
        expect(m.perdidaPct).toBe(0);
        expect(m.cuadrosEnVentana).toBe(0);
        expect(m.acusesEnVentana).toBe(0);
    });

    it("un solo cuadro: fps=0, kbps=0, pero hay resolución y codec", () => {
        const e = estadoInicial("aparato");
        añadirCuadro(e, cuadro(AHORA - 500, 50_000, 1280, 720, { codec: "vp8", calidad: 60 }));
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBe(0);
        expect(m.kbps).toBe(0);
        expect(m.resolucion).toEqual({ ancho: 1280, alto: 720 });
        expect(m.codec).toBe("vp8");
        expect(m.calidad).toBe(60);
    });

    it("dos cuadros en 1 s → ~2 fps, kbps correcto", () => {
        const e = estadoInicial("controlador");
        añadirCuadro(e, cuadro(AHORA - 1_000, 40_000, 1280, 720));
        añadirCuadro(e, cuadro(AHORA, 60_000, 1280, 720));
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBeCloseTo(2.0, 0);
        expect(m.kbps).toBeCloseTo(800, 0); // (100_000 * 8) / 1000 = 800 kbps
        expect(m.resolucion).toEqual({ ancho: 1280, alto: 720 });
    });

    it("10 cuadros en 2.7 s → ~3.7 fps, kbps según dt real", () => {
        const e = estadoInicial("aparato");
        for (let i = 0; i < 10; i++) {
            añadirCuadro(e, cuadro(AHORA - 3_000 + i * 300, 30_000, 960, 540));
        }
        const m = calcularMetricas(e, AHORA);
        // Primer cuadro en -3000, último en -300, dt = 2700 ms
        expect(m.fps).toBeCloseTo(3.7, 0);
        expect(m.kbps).toBeCloseTo(889, 0); // 300_000 * 8 / 2.7 = 888.9
    });

    it("calcula rtt medio de acuses recientes (últimos 5 s)", () => {
        const e = estadoInicial("controlador");
        añadirAcuse(e, acuse("1", AHORA - 100, AHORA - 50)); // 50 ms
        añadirAcuse(e, acuse("2", AHORA - 200, AHORA - 100)); // 100 ms
        añadirAcuse(e, acuse("3", AHORA - 6_000, AHORA - 5_900)); // fuera de 5 s
        const m = calcularMetricas(e, AHORA);
        expect(m.rttMs).toBe(75); // (50 + 100) / 2
        expect(m.acusesEnVentana).toBe(2);
    });

    it("ignora acuses fallidos (ok=false) para rtt", () => {
        const e = estadoInicial("aparato");
        añadirAcuse(e, acuse("1", AHORA - 100, AHORA - 50, "red-local", true));
        añadirAcuse(e, acuse("2", AHORA - 200, AHORA - 100, "red-local", false));
        const m = calcularMetricas(e, AHORA);
        expect(m.rttMs).toBe(50);
        expect(m.acusesEnVentana).toBe(1);
    });

    it("calcula porcentaje de pérdida de cuadros", () => {
        const e = estadoInicial("controlador");
        for (let i = 0; i < 10; i++) {
            añadirCuadro(e, cuadro(AHORA - 2_000 + i * 200, 20_000, 800, 600, { completo: i !== 3 && i !== 7 }));
        }
        const m = calcularMetricas(e, AHORA);
        expect(m.perdidaPct).toBe(20.0); // 2 de 10
        expect(m.cuadrosEnVentana).toBe(10);
    });

    it("usa el medio actual en las métricas", () => {
        const e = estadoInicial("aparato", "wifi-directo");
        añadirCuadro(e, cuadro(AHORA - 100, 10_000, 640, 480));
        const m = calcularMetricas(e, AHORA);
        expect(m.medio).toBe("wifi-directo");
        expect(m.lado).toBe("aparato");
    });
});

describe("CTL1119B · línea de registro", () => {
    it("formato clave=valor con todos los campos", () => {
        const m = {
            fps: 24.5,
            rttMs: 42,
            kbps: 1_200,
            resolucion: { ancho: 1280, alto: 720 },
            calidad: 60,
            codec: "vp8",
            perdidaPct: 0,
            medio: "wifi-directo" as const,
            lado: "controlador" as const,
            cuadrosEnVentana: 73,
            acusesEnVentana: 12,
        };
        const l = lineaRegistro(m);
        expect(l).toBe(
            "control-calidad fps=24.5 rtt_ms=42 kbps=1200 lado=controlador resolucion=1280x720 calidad=60 codec=vp8 perdida_pct=0 medio=wifi-directo"
        );
    });

    it("resolución/códec/calidad desconocidos cuando son null", () => {
        const m = {
            fps: 0,
            rttMs: 0,
            kbps: 0,
            resolucion: null,
            calidad: null,
            codec: null,
            perdidaPct: 0,
            medio: "sin-determinar" as const,
            lado: "aparato" as const,
            cuadrosEnVentana: 0,
            acusesEnVentana: 0,
        };
        const l = lineaRegistro(m);
        expect(l).toContain("resolucion=desconocida");
        expect(l).toContain("calidad=desconocida");
        expect(l).toContain("codec=desconocido");
        expect(l).toContain("medio=sin-determinar");
    });
});

describe("CTL1119B · registro periódico", () => {
    it("tocaRegistro es true al principio (ultimoRegistro=0)", () => {
        const e = estadoInicial("controlador");
        expect(tocaRegistro(e, AHORA)).toBe(true);
    });

    it("tocaRegistro false si pasó menos de 10 s", () => {
        const e = estadoInicial("aparato");
        marcarRegistro(e, AHORA);
        expect(tocaRegistro(e, AHORA + 5_000)).toBe(false);
    });

    it("tocaRegistro true si pasó 10 s o más", () => {
        const e = estadoInicial("controlador");
        marcarRegistro(e, AHORA);
        expect(tocaRegistro(e, AHORA + INTERVALO_REGISTRO_MS)).toBe(true);
        expect(tocaRegistro(e, AHORA + INTERVALO_REGISTRO_MS + 1)).toBe(true);
    });

    it("marcarRegistro actualiza ultimoRegistro", () => {
        const e = estadoInicial("aparato");
        expect(e.ultimoRegistro).toBe(0);
        marcarRegistro(e, AHORA + 123);
        expect(e.ultimoRegistro).toBe(AHORA + 123);
    });
});

describe("CTL1119B · texto para UI y color por fps", () => {
    it("textoUi con valores reales", () => {
        const m = {
            fps: 24.5,
            rttMs: 42,
            kbps: 1_200,
            resolucion: { ancho: 1280, alto: 720 },
            calidad: 60,
            codec: "vp8",
            perdidaPct: 0,
            medio: "wifi-directo" as const,
            lado: "controlador" as const,
            cuadrosEnVentana: 73,
            acusesEnVentana: 12,
        };
        const t = textoUi(m);
        expect(t).toContain("24,5 fps");
        expect(t).toContain("42 ms");
        expect(t).toContain("1,2 Mbps");
        expect(t).toContain("1280×720");
        expect(t).toContain("Wi‑Fi directo");
    });

    it("textoUi con ceros muestra guiones", () => {
        const m = {
            fps: 0,
            rttMs: 0,
            kbps: 0,
            resolucion: null,
            calidad: null,
            codec: null,
            perdidaPct: 0,
            medio: "sin-determinar" as const,
            lado: "aparato" as const,
            cuadrosEnVentana: 0,
            acusesEnVentana: 0,
        };
        const t = textoUi(m);
        expect(t).toContain("— fps");
        expect(t).toContain("— ms");
        expect(t).toContain("— Mbps");
        expect(t).toContain("—");
        expect(t).toContain("desconocido");
    });

    it("colorFps: verde ≥ 20, ámbar 10–19, rojo < 10", () => {
        expect(colorFps(30)).toBe("verde");
        expect(colorFps(20)).toBe("verde");
        expect(colorFps(19.9)).toBe("ambar");
        expect(colorFps(15)).toBe("ambar");
        expect(colorFps(10)).toBe("ambar");
        expect(colorFps(9.9)).toBe("rojo");
        expect(colorFps(2.7)).toBe("rojo");
        expect(colorFps(0)).toBe("rojo");
    });
});