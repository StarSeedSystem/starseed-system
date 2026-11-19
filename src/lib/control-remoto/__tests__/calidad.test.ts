import { describe, it, expect, beforeEach } from "vitest";
import {
    crearMedidorCalidad,
    anadirCuadro,
    anadirAcuse,
    medir,
    reiniciar,
    type MedicionCuadro,
    type AcuseOrden,
} from "../calidad";

function crearCuadro(ancho: number, alto: number, bytes: number, timestamp: number, retrasoMs?: number, perdido = false): MedicionCuadro {
    return { ancho, alto, bytes, timestamp, ...(retrasoMs !== undefined && { retrasoMs }), ...(perdido && { perdido }) };
}

function crearAcuse(timestampEnvio: number, exitoso = true, timestampRespuesta?: number): AcuseOrden {
    return { nonce: `nonce-${timestampEnvio}`, timestampEnvio, timestampRespuesta: timestampRespuesta ?? timestampEnvio + 10, exitoso };
}

describe("calidad - cálculo de métricas", () => {
    let estado: ReturnType<typeof crearMedidorCalidad>;

    beforeEach(() => {
        estado = crearMedidorCalidad(3000);
    });

    describe("fps", () => {
        it("devuelve 0 sin cuadros", () => {
            const r = medir(estado);
            expect(r.fps).toBe(0);
        });

        it("calcula fps correctamente con varios cuadros (3 cuadros en 1s → 2 fps por intervalos)", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1500), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 2000), estado);
            const r = medir(estado);
            expect(r.fps).toBe(2);
        });

        it("mantiene fps aunque hay menos de la ventana (2 cuadros en 1s → 1 fps por intervalos)", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 2000), estado);
            const r = medir(estado);
            expect(r.fps).toBe(1);
        });
    });

    describe("rttMs", () => {
        it("devuelve null sin acuses exitosos", () => {
            estado = anadirAcuse(crearAcuse(1000, false), estado);
            const r = medir(estado);
            expect(r.rttMs).toBeNull();
        });

        it("calcula rtt medio de acuses exitosos (10ms + 20ms = 15ms promedio)", () => {
            estado = anadirAcuse(crearAcuse(1000, true, 1010), estado);
            estado = anadirAcuse(crearAcuse(2000, true, 2020), estado);
            const r = medir(estado);
            expect(r.rttMs).toBe(15);
        });
    });

    describe("kbps", () => {
        it("devuelve 0 sin suficientes cuadros", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000), estado);
            const r = medir(estado);
            expect(r.kbps).toBe(0);
        });

        it("calcula kbps correctamente (1000 bytes promedio, 1s = 8 kbps)", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 1000, 1000), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 1000, 2000), estado);
            const r = medir(estado);
            expect(r.kbps).toBe(8);
        });
    });

    describe("resolucion", () => {
        it("devuelve null sin cuadros", () => {
            const r = medir(estado);
            expect(r.resolucion).toBeNull();
        });

        it("calcula resolución promedio de los últimos 5 cuadros", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000), estado);
            estado = anadirCuadro(crearCuadro(1920, 1080, 100, 2000), estado);
            const r = medir(estado);
            expect(r.resolucion).toEqual({ ancho: 1600, alto: 900 });
        });
    });

    describe("perdidos", () => {
        it("devuelve 0 sin cuadros", () => {
            const r = medir(estado);
            expect(r.perdidos).toBe(0);
        });

        it("calcula proporción de cuadros perdidos", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000, undefined, false), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1500, undefined, true), estado);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 2000, undefined, true), estado);
            const r = medir(estado);
            expect(r.perdidos).toBeCloseTo(0.667, 2);
        });
    });

    describe("calidad", () => {
        it("excelente: fps>=25, rtt<=50, perdidos<0.05, kbps>=500", () => {
            // 25 cuadros con 40ms entre ellos: fps = 25, bytes=80000 cada uno
            for (let i = 0; i < 25; i++) {
                const ts = 1000 + i * 40;
                estado = anadirCuadro(crearCuadro(1280, 720, 80000, ts), estado);
            }
            estado = anadirAcuse(crearAcuse(1000, true, 1020), estado);
            const r = medir(estado);
            // fps = round(((25-1)/0.96)*10)/10 = 25, kbps = round(80000*8/0.96/1000*10)/10 = round(666.7*10)/10 = 667
            expect(r.calidad).toBe("excelente");
        });

        it("buena: fps>=15, rtt<=100, perdidos<0.1, kbps>=200", () => {
            // 15 cuadros con 66ms entre ellos
            for (let i = 0; i < 15; i++) {
                const ts = 1000 + i * 66;
                estado = anadirCuadro(crearCuadro(1280, 720, 30000, ts), estado);
            }
            const r = medir(estado);
            expect(r.calidad).toBe("buena");
        });

        it("regular: fps>=5, rtt<=200, perdidos<0.2", () => {
            // 5 cuadros con 200ms entre ellos
            for (let i = 0; i < 5; i++) {
                const ts = 1000 + i * 200;
                estado = anadirCuadro(crearCuadro(1280, 720, 10000, ts), estado);
            }
            const r = medir(estado);
            expect(r.calidad).toBe("regular");
        });

        it("mala: fps bajo o perdidos altos", () => {
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000, undefined, true), estado);
            const r = medir(estado);
            expect(r.calidad).toBe("mala");
        });
    });

    describe("medio en uso", () => {
        it("usa el medio proporcionado", () => {
            const r = medir(estado, { tipo: "wifi", activo: true });
            expect(r.medio).toEqual({ tipo: "wifi", activo: true });
        });

        it("usa null cuando no se proporciona", () => {
            const r = medir(estado);
            expect(r.medio).toBeNull();
        });
    });

    describe("reiniciar", () => {
        it("limpia cuadros y acuses", () => {
            let estado = crearMedidorCalidad(3000);
            estado = anadirCuadro(crearCuadro(1280, 720, 100, 1000), estado);
            estado = anadirAcuse(crearAcuse(1000, true, 1020), estado);
            const reiniciado = reiniciar(estado);
            expect(reiniciado.cuadros).toEqual([]);
            expect(reiniciado.acuses).toEqual([]);
            expect(reiniciado.ventanaMs).toBe(3000);
        });
    });
});