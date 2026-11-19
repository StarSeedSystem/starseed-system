/**
 * CTL1119B · Tests puros del medidor de calidad (fps, rtt, kbps, medio, pérdidas).
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
    MedidorCalidad,
    crearMedidorControlador,
    crearMedidorAparato,
    _internals,
    type MedidaCuadro,
    type MedidaOrden,
    type Medio,
    type Lado,
} from "../calidad";

const { podarVentana, calcularFps, calcularKbps, calcularRtt, inferirMedio, perdidasPct, formatearLinea, estadoInicial, VENTANA_MS, INTERVALO_REGISTRO_MS } = _internals;

function cuadro(n: number, t: number, bytes: number, ancho = 1280, alto = 720, nivel = 0, perdido = false): MedidaCuadro {
    return { num: n, t, bytes, ancho, alto, nivelCalidad: nivel, perdido };
}

function orden(enviado: number, respondido: number, tipo = "gesto", via: "datos" | "control" = "datos"): MedidaOrden {
    return { enviado, respondido, tipo, via };
}

function estadoCon(lado: Lado, cuadros: MedidaCuadro[] = [], ordenes: MedidaOrden[] = [], rttEma: number | null = null, ultimaLinea = 0, medioActual: Medio = "desconocido") {
    const e = estadoInicial(lado);
    e.cuadros = cuadros;
    e.ordenes = ordenes;
    e.rttEma = rttEma;
    e.ultimaLinea = ultimaLinea;
    e.medioActual = medioActual;
    return e;
}

describe("calidad · podarVentana", () => {
    it("elimina cuadros y órdenes fuera de la ventana de 3 s", () => {
        const ahora = 10000;
        const e = estadoCon("controlador", [cuadro(1, 5000, 1000), cuadro(2, 8000, 2000), cuadro(3, 9500, 3000)], [orden(5000, 5050), orden(8000, 8060), orden(9500, 9540)]);
        podarVentana(e, ahora);
        expect(e.cuadros).toHaveLength(2);
        expect(e.cuadros[0].num).toBe(2);
        expect(e.ordenes).toHaveLength(2);
        expect(e.ordenes[0].enviado).toBe(8000);
    });

    it("conserva todo si está dentro de la ventana", () => {
        const ahora = 10000;
        const e = estadoCon("controlador", [cuadro(1, 8000, 1000)], [orden(8000, 8050)]);
        podarVentana(e, ahora);
        expect(e.cuadros).toHaveLength(1);
        expect(e.ordenes).toHaveLength(1);
    });

    it("vacía todo si nada está en la ventana", () => {
        const ahora = 10000;
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000)], [orden(1000, 1050)]);
        podarVentana(e, ahora);
        expect(e.cuadros).toHaveLength(0);
        expect(e.ordenes).toHaveLength(0);
    });
});

describe("calidad · calcularFps", () => {
    it("devuelve 0 con menos de 2 cuadros", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000)]);
        expect(calcularFps(e, 2000)).toBe(0);
    });

    it("calcula fps correcto con 3 cuadros en 1 s", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000), cuadro(2, 1500, 1000), cuadro(3, 2000, 1000)]);
        expect(calcularFps(e, 3000)).toBe(3);
    });

    it("redondea a una decimal", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000), cuadro(2, 2000, 1000)]);
        expect(calcularFps(e, 3000)).toBe(2);
    });

    it("ignora cuadros perdidos", () => {
        // cuadro perdido en t=0 (fuera de ventana), 2 válidos en t=1000 y 2000 (span 1s)
        const e = estadoCon("controlador", [cuadro(1, 0, 1000, 1280, 720, 0, true), cuadro(2, 1000, 1000), cuadro(3, 2000, 1000)]);
        expect(calcularFps(e, 3000)).toBe(2);
    });

    it("respeta la ventana de 3 s", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000), cuadro(2, 1500, 1000), cuadro(3, 1999, 1000)]);
        expect(calcularFps(e, 5000)).toBe(0); // todos fuera de ventana (corte = 2000)
    });
});

describe("calidad · calcularKbps", () => {
    it("devuelve 0 sin cuadros", () => {
        const e = estadoCon("controlador", []);
        expect(calcularKbps(e, 1000)).toBe(0);
    });

    it("devuelve 0 con menos de 2 cuadros", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 10_000)]);
        expect(calcularKbps(e, 2000)).toBe(0);
    });

    it("calcula kbps correcto: 10 cuadros de 10 KB en 1 s = 800 kbps", () => {
        // frames at 1000, 1100, ..., 1900 (10 frames, 100ms apart) -> dt = 0.9s
        // with Math.max(0.001, dt), kbps = 100000*8/0.9/1000 = 889
        const e = estadoCon("controlador", Array.from({ length: 10 }, (_, i) => cuadro(i, 1000 + i * 100, 10_000)));
        expect(calcularKbps(e, 2000)).toBe(889);
    });

    it("ignora cuadros perdidos", () => {
        // lost frame at t=0 (outside window), 2 valid at 1500 and 2000
        const e = estadoCon("controlador", [cuadro(1, 0, 10_000, 1280, 720, 0, true), cuadro(2, 1500, 10_000), cuadro(3, 2000, 10_000)]);
        expect(calcularKbps(e, 3000)).toBe(320); // 2 frames in 0.5s: 20000*8/0.5/1000 = 320
    });
});

describe("calidad · calcularRtt", () => {
    it("devuelve 0 sin órdenes", () => {
        const e = estadoCon("controlador", [], []);
        expect(calcularRtt(e)).toBe(0);
    });

    it("calcula media simple y actualiza EMA", () => {
        const e = estadoCon("controlador", [], [orden(1000, 1050), orden(1100, 1160), orden(1200, 1240)]);
        const rtt = calcularRtt(e);
        expect(rtt).toBe(50); // (50+60+40)/3 = 50
    });

    it("ignora RTTs absurdos (>30s o <=0)", () => {
        const e = estadoCon("controlador", [], [orden(1000, 1050), orden(2000, 100), orden(3000, 31000)]);
        expect(calcularRtt(e)).toBe(50);
    });

    it("usa EMA si ya hay valor previo", () => {
        const e = estadoCon("controlador", [], [orden(1000, 1100)], 50); // rttEma = 50, nueva media = 100
        // EMA = 50 * 0.7 + 100 * 0.3 = 35 + 30 = 65
        expect(calcularRtt(e)).toBe(65);
    });
});

describe("calidad · inferirMedio", () => {
    it("desconocido si kbps = 0", () => {
        expect(inferirMedio(0, 10)).toBe("desconocido");
    });

    it("bluetooth: kbps bajo y rtt alto", () => {
        expect(inferirMedio(1000, 150)).toBe("bluetooth");
    });

    it("wifi-directo: kbps medio, rtt medio", () => {
        expect(inferirMedio(5000, 60)).toBe("wifi-directo");
    });

    it("red-local: kbps alto", () => {
        expect(inferirMedio(60000, 10)).toBe("red-local");
    });

    it("relevo: rtt muy alto", () => {
        expect(inferirMedio(3000, 200)).toBe("relevo");
    });

    it("red-local por defecto", () => {
        expect(inferirMedio(10000, 20)).toBe("red-local");
    });
});

describe("calidad · perdidasPct", () => {
    it("0% sin cuadros", () => {
        const e = estadoCon("controlador", []);
        expect(perdidasPct(e, 1000)).toBe(0);
    });

    it("calcula porcentaje con una decimal", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000, 1280, 720, 0, true), cuadro(2, 1100, 1000), cuadro(3, 1200, 1000)]);
        expect(perdidasPct(e, 2000)).toBe(33.3);
    });

    it("100% si todos perdidos", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000, 1280, 720, 0, true), cuadro(2, 1100, 1000, 1280, 720, 0, true)]);
        expect(perdidasPct(e, 2000)).toBe(100);
    });

    it("respeta la ventana de 3 s", () => {
        const e = estadoCon("controlador", [cuadro(1, 1000, 1000, 1280, 720, 0, true), cuadro(2, 5000, 1000)]);
        expect(perdidasPct(e, 7000)).toBe(0); // el perdido está fuera de ventana
    });
});

describe("calidad · formatearLinea", () => {
    it("formato correcto con todos los valores", () => {
        const linea = formatearLinea({
            fps: 15.5,
            rttMs: 42.3,
            kbps: 1250.7,
            resolucion: { ancho: 1280, alto: 720 },
            nivelCalidad: 1,
            codec: "jpeg",
            perdidasPct: 2.5,
            medio: "red-local",
            lado: "controlador",
            timestamp: 10000,
        });
        expect(linea).toBe("control-calidad fps=15.5 rtt_ms=42.3 kbps=1250.7 lado=controlador calidad=1 medio=red-local");
    });

    it("sin-medir para valores nulos", () => {
        const linea = formatearLinea({
            fps: NaN,
            rttMs: NaN,
            kbps: NaN,
            resolucion: null,
            nivelCalidad: 0,
            codec: "jpeg",
            perdidasPct: 0,
            medio: "desconocido",
            lado: "aparato",
            timestamp: 10000,
        } as Parameters<typeof formatearLinea>[0]);
        expect(linea).toBe("control-calidad fps=sin-medir rtt_ms=sin-medir kbps=sin-medir lado=aparato calidad=0 medio=desconocido");
    });
});

describe("calidad · MedidorCalidad clase", () => {
    let medidor: MedidorCalidad;
    const ahora = () => 10000;

    beforeEach(() => {
        medidor = crearMedidorControlador();
    });

    it("registra cuadros y calcula fps", () => {
        // 3 frames spanning 1s: 9000, 9500, 10000
        medidor.registrarCuadro(cuadro(1, 9000, 10000));
        medidor.registrarCuadro(cuadro(2, 9500, 10000));
        medidor.registrarCuadro(cuadro(3, 10000, 10000));
        const c = medidor.calcular(ahora());
        expect(c.fps).toBe(3);
        expect(c.lado).toBe("controlador");
    });

    it("registra órdenes y calcula rtt", () => {
        medidor.registrarOrden(orden(9000, 9050));
        medidor.registrarOrden(orden(9100, 9160));
        const c = medidor.calcular(ahora());
        expect(c.rttMs).toBe(55); // (50+60)/2 = 55
    });

    it("emite línea de registro cada 10 s", () => {
        let linea = "";
        medidor.alRegistrar((l) => (linea = l));
        medidor.registrarCuadro(cuadro(1, 9000, 10000));
        medidor.calcular(10000, true);
        expect(linea).toBe("");
        medidor.calcular(19999, true);
        expect(linea).toBe("");
        medidor.calcular(20000, true);
        expect(linea).toContain("control-calidad fps=");
    });

    it("suscribe y desuscribe callbacks", () => {
        const resultados: number[] = [];
        const off = medidor.suscribir((c) => resultados.push(c.fps));
        medidor.registrarCuadro(cuadro(1, 9000, 10000));
        medidor.calcular(ahora());
        expect(resultados).toHaveLength(1);
        off();
        medidor.calcular(ahora());
        expect(resultados).toHaveLength(1);
    });

    it("reiniciar limpia el estado", () => {
        medidor.registrarCuadro(cuadro(1, 9000, 10000));
        medidor.reiniciar();
        const c = medidor.calcular(ahora());
        expect(c.fps).toBe(0);
        expect(c.kbps).toBe(0);
    });

    it("medio() devuelve el medio actual", () => {
        // Need 2 frames for kbps calculation
        medidor.registrarCuadro(cuadro(1, 9000, 60000));
        medidor.registrarCuadro(cuadro(2, 9500, 60000));
        medidor.calcular(ahora());
        expect(medidor.medio()).toBe("red-local");
    });
});

describe("calidad · crearMedidorControlador / crearMedidorAparato", () => {
    it("crea medidor con lado correcto", () => {
        const mc = crearMedidorControlador();
        mc.registrarCuadro(cuadro(1, 9000, 10000));
        expect(mc.calcular(10000).lado).toBe("controlador");

        const ma = crearMedidorAparato();
        ma.registrarCuadro(cuadro(1, 9000, 10000));
        expect(ma.calcular(10000).lado).toBe("aparato");
    });
});