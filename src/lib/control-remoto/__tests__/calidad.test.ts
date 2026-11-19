/**
 * CTL1119B · Tests del medidor de calidad (módulo puro).
 */
import { describe, expect, it } from "vitest";
import {
    crearMedidor,
    formatearMetricas,
    colorFps,
    colorRtt,
    colorPerdidas,
    type EventoCuadro,
    type EventoAcuse,
    type MetricasCalidad,
    type MedioReal,
} from "../calidad";

const cuadro = (n: number, bytes: number, recibido: number, ancho = 1280, alto = 720, enviado?: number): EventoCuadro => ({
    num: n,
    bytes,
    ancho,
    alto,
    recibido,
    enviado,
});

const acuse = (nonce: string, rttMs: number, recibido: number, via: "datos" | "control" = "datos"): EventoAcuse => ({
    nonce,
    rttMs,
    recibido,
    via,
});

const medioReal = (camino: "directo" | "capa" | "sin-determinar", medio: MedioReal["medio"], nota?: string): MedioReal => ({
    camino,
    medio,
    nota,
});

describe("crearMedidor · FPS (ventana 3 s)", () => {
    it("sin cuadros devuelve 0", () => {
        const m = crearMedidor("controlador");
        expect(m.obtenerMetricas(1000)!.fps).toBe(0);
    });

    it("un solo cuadro devuelve 0 (no hay intervalo)", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, 1000));
        expect(m.obtenerMetricas(1000)!.fps).toBe(0);
    });

    it("dos cuadros a 1 s de distancia → 1 fps", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, 1000));
        m.registrarCuadro(cuadro(2, 1000, 2000));
        expect(m.obtenerMetricas(2000)!.fps).toBe(1);
    });

    it("10 cuadros en 2.7 s (300 ms cada uno) → 3.3 fps", () => {
        const m = crearMedidor("controlador");
        for (let i = 0; i < 10; i++) m.registrarCuadro(cuadro(i + 1, 1000, 100 + i * 300));
        // 10 cuadros, primer=100, último=2800, duración=2700ms=2.7s, (10-1)/2.7 = 3.33
        expect(m.obtenerMetricas(3000)!.fps).toBe(3.3);
    });

    it("cuadros fuera de la ventana de 3 s no cuentan", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, -2000)); // muy viejo (fuera de ventana a 2000)
        for (let i = 0; i < 10; i++) m.registrarCuadro(cuadro(i + 2, 1000, 1000 + i * 100));
        // a 2000: corte=2000-3000=-1000, el cuadro en -2000 se poda. Primer=1000, último=1900, dur=900ms, 10 cuadros → (10-1)/0.9 = 10
        expect(m.obtenerMetricas(2000)!.fps).toBe(10);
    });

    it("retransmisiones no cuentan para FPS", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, 1000));
        m.registrarCuadro({ ...cuadro(2, 1000, 1500), retransmitido: true });
        m.registrarCuadro(cuadro(3, 1000, 2000));
        // no retransmitidos: 1 y 3, duración=1000ms, (2-1)/1 = 1 fps
        expect(m.obtenerMetricas(2000)!.fps).toBe(1);
    });
});

describe("crearMedidor · KBPS (ventana 5 s)", () => {
    it("sin cuadros devuelve null", () => {
        const m = crearMedidor("controlador");
        expect(m.obtenerMetricas(1000)!.kbps).toBeNull();
    });

    it("100 KB en 4.5 s → ~178 kbps", () => {
        const m = crearMedidor("controlador");
        for (let i = 0; i < 10; i++) m.registrarCuadro(cuadro(i + 1, 10_000, 1000 + i * 500));
        // 10 cuadros * 10KB = 100KB, primer=1000, último=5500, dur=4500ms=4.5s
        // 100KB * 8 = 800 kbits / 4.5s = 177.8 kbps
        expect(m.obtenerMetricas(6000)!.kbps).toBe(177.8);
    });

    it("retransmisiones no cuentan para KBPS", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 10_000, 1000));
        m.registrarCuadro({ ...cuadro(2, 10_000, 2000), retransmitido: true });
        m.registrarCuadro(cuadro(3, 10_000, 3000));
        // no retransmitidos: 1 y 3, 20KB en 2s = 80 kbps
        expect(m.obtenerMetricas(4000)!.kbps).toBe(80);
    });
});

describe("crearMedidor · RTT (últimos 10 acuses)", () => {
    it("sin acuses devuelve null", () => {
        const m = crearMedidor("controlador");
        expect(m.obtenerMetricas(1000)!.rttMs).toBeNull();
    });

    it("promedia los últimos 10", () => {
        const m = crearMedidor("controlador");
        for (let i = 0; i < 15; i++) m.registrarAcuse(acuse(`n${i}`, 50 + i, 1000 + i * 100));
        // últimos 10: 55..64 → media = 59.5 → 60
        expect(m.obtenerMetricas(2500)!.rttMs).toBe(60);
    });
});

describe("crearMedidor · pérdidas (huecos en num)", () => {
    it("sin huecos → 0%", () => {
        const m = crearMedidor("controlador");
        for (let i = 1; i <= 10; i++) m.registrarCuadro(cuadro(i, 1000, 1000 + i * 100));
        expect(m.obtenerMetricas(2000)!.perdidas).toBe(0);
    });

    it("un hueco de 2 en 7 esperados → 28.6%", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, 1000));
        m.registrarCuadro(cuadro(2, 1000, 1100));
        m.registrarCuadro(cuadro(5, 1000, 1200)); // salta 3,4
        m.registrarCuadro(cuadro(6, 1000, 1300));
        m.registrarCuadro(cuadro(7, 1000, 1400));
        // nums = [1,2,5,6,7], esperados 1..7 = 7, huecos = 2, 2/7 = 28.6%
        expect(m.obtenerMetricas(1500)!.perdidas).toBe(28.6);
    });

    it("desordenados se ordenan internamente", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(5, 1000, 1000));
        m.registrarCuadro(cuadro(1, 1000, 1100));
        m.registrarCuadro(cuadro(3, 1000, 1200));
        // nums = [1,3,5], esperados 1..5 = 5, huecos = (3-1-1)+(5-3-1) = 2, 2/5 = 40%
        expect(m.obtenerMetricas(1300)!.perdidas).toBe(40);
    });
});

describe("crearMedidor · medio real → string", () => {
    it("directo + wifi-directo → wifi-directo", () => {
        const m = crearMedidor("controlador");
        m.actualizarMedio(medioReal("directo", "wifi-directo"));
        expect(m.obtenerMetricas(1000)!.medio).toBe("wifi-directo");
    });

    it("capa + nodo → nodo", () => {
        const m = crearMedidor("controlador");
        m.actualizarMedio(medioReal("capa", "nodo"));
        expect(m.obtenerMetricas(1000)!.medio).toBe("nodo");
    });

    it("sin-determinar → sin-determinar", () => {
        const m = crearMedidor("controlador");
        m.actualizarMedio(medioReal("sin-determinar", null));
        expect(m.obtenerMetricas(1000)!.medio).toBe("sin-determinar");
    });

    it("directo + null → sin-determinar", () => {
        const m = crearMedidor("controlador");
        m.actualizarMedio(medioReal("directo", null));
        expect(m.obtenerMetricas(1000)!.medio).toBe("sin-determinar");
    });
});

describe("crearMedidor · registro cada 10 s", () => {
    it("no registra antes del intervalo", () => {
        const lineas: string[] = [];
        const m = crearMedidor("controlador", { intervaloRegistroMs: 10000 });
        m.registrarCuadro(cuadro(1, 1000, 1000));
        m.registrarSiToca((l) => lineas.push(l), 2000);
        expect(lineas.length).toBe(0);
    });

    it("registra al pasar el intervalo", () => {
        const lineas: string[] = [];
        const m = crearMedidor("controlador", { intervaloRegistroMs: 10000 });
        m.registrarCuadro(cuadro(1, 1000, 10000));
        m.registrarSiToca((l) => lineas.push(l), 11000);
        expect(lineas.length).toBe(1);
        expect(lineas[0]).toContain("control-calidad fps=0"); // un solo cuadro = 0 fps
        expect(lineas[0]).toContain("lado=controlador");
    });

    it("incluye todos los campos en la línea", () => {
        const lineas: string[] = [];
        const m = crearMedidor("aparato", { intervaloRegistroMs: 10000 });
        m.registrarCuadro(cuadro(1, 10000, 10000, 1920, 1080));
        m.registrarCuadro(cuadro(2, 10000, 11000, 1920, 1080)); // 2 cuadros en 1s = 1 fps, 20KB en 1s = 160 kbps
        m.registrarAcuse(acuse("n1", 45, 11000));
        m.actualizarMedio(medioReal("directo", "red-local"));
        m.actualizarCalidad({ codec: "h264", perfil: "High", nivel: "4.1" });
        m.registrarSiToca((l) => lineas.push(l), 11000);
        const l = lineas[0];
        expect(l).toContain("fps=1");
        expect(l).toContain("rtt_ms=45");
        expect(l).toContain("kbps=160");
        expect(l).toContain("lado=aparato");
        expect(l).toContain("calidad=h264:High:4.1");
        expect(l).toContain("medio=red-local");
        expect(l).toContain("resolucion=1920x1080");
        expect(l).toContain("perdidas=0");
    });
});

describe("formatearMetricas", () => {
    it("formatea métricas completas", () => {
        const m: MetricasCalidad = {
            fps: 12.5,
            rttMs: 67,
            kbps: 2500,
            resolucion: { ancho: 1280, alto: 720 },
            calidad: { codec: "vp8", perfil: "", nivel: "" },
            perdidas: 0.5,
            medio: "wifi-directo",
            lado: "controlador",
            timestamp: 1000,
        };
        const f = formatearMetricas(m);
        expect(f.fps).toBe("12.5");
        expect(f.rtt).toBe("67 ms");
        expect(f.kbps).toBe("2500");
        expect(f.resolucion).toBe("1280x720");
        expect(f.calidad).toBe("vp8");
        expect(f.medio).toBe("wifi-directo");
        expect(f.perdidas).toBe("0.5%");
    });

    it("valores null se muestran como —", () => {
        const m: MetricasCalidad = {
            fps: 0,
            rttMs: null,
            kbps: null,
            resolucion: null,
            calidad: null,
            perdidas: null,
            medio: "sin-determinar",
            lado: "aparato",
            timestamp: 1000,
        };
        const f = formatearMetricas(m);
        expect(f.fps).toBe("—");
        expect(f.rtt).toBe("—");
        expect(f.kbps).toBe("—");
        expect(f.resolucion).toBe("—");
        expect(f.calidad).toBe("—");
        expect(f.perdidas).toBe("—");
    });
});

describe("colores semáforo", () => {
    it("colorFps: verde ≥ 15, ámbar 5-15, rojo < 5", () => {
        expect(colorFps(30)).toBe("verde");
        expect(colorFps(15)).toBe("verde");
        expect(colorFps(10)).toBe("ambar");
        expect(colorFps(5)).toBe("ambar");
        expect(colorFps(4)).toBe("rojo");
        expect(colorFps(0)).toBe("rojo");
    });

    it("colorRtt: verde ≤ 80, ámbar 80-200, rojo > 200", () => {
        expect(colorRtt(50)).toBe("verde");
        expect(colorRtt(80)).toBe("verde");
        expect(colorRtt(100)).toBe("ambar");
        expect(colorRtt(200)).toBe("ambar");
        expect(colorRtt(250)).toBe("rojo");
        expect(colorRtt(null)).toBe("desconocido");
    });

    it("colorPerdidas: verde ≤ 1%, ámbar 1-5%, rojo > 5%", () => {
        expect(colorPerdidas(0)).toBe("verde");
        expect(colorPerdidas(1)).toBe("verde");
        expect(colorPerdidas(2)).toBe("ambar");
        expect(colorPerdidas(5)).toBe("ambar");
        expect(colorPerdidas(6)).toBe("rojo");
        expect(colorPerdidas(null)).toBe("desconocido");
    });
});

describe("crearMedidor · reiniciar", () => {
    it("limpia todo el estado", () => {
        const m = crearMedidor("controlador");
        m.registrarCuadro(cuadro(1, 1000, 1000));
        m.registrarAcuse(acuse("n1", 50, 1000));
        m.reiniciar();
        expect(m.obtenerMetricas(2000)!.fps).toBe(0);
        expect(m.obtenerMetricas(2000)!.rttMs).toBeNull();
        expect(m.obtenerMetricas(2000)!.kbps).toBeNull();
    });
});

describe("crearMedidor · lado aparato (envía vídeo, mide acuses)", () => {
    it("el lado se refleja en las métricas", () => {
        const m = crearMedidor("aparato");
        m.registrarAcuse(acuse("n1", 40, 1000));
        expect(m.obtenerMetricas(1000)!.lado).toBe("aparato");
    });

    it("FPS en el aparato mide cuadros ENVIADOS (misma lógica)", () => {
        const m = crearMedidor("aparato");
        for (let i = 0; i < 6; i++) m.registrarCuadro(cuadro(i + 1, 5000, 1000 + i * 200));
        expect(m.obtenerMetricas(2000)!.fps).toBe(5);
    });
});