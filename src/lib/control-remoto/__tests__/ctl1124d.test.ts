/**
 * CTL1124D · la pantalla por la malla no se queda negra: los cuadros que llegan
 * por la malla cuentan en cuadros/s y resolución, y una fuente «proyeccion»
 * no devuelve respuesta vacía. Solo funciones puras (sin red, sin disco).
 */
import { describe, expect, it } from "vitest";
import {
    calcularMetricas,
    añadirCuadro,
    estadoInicial,
    type CuadroRecibido,
    type TipoMedio,
} from "../calidad";
import {
    estadoCuadros,
    textoFps,
    rotuloFuenteMedida,
    veredictoFuente,
    fuenteActivaDe,
    proyeccionConcedida,
    rotuloFuente,
    type FuentePedida,
    type FuenteReal,
    type MedidaCuadros,
} from "../fuente-pantalla";

const AHORA = 1_000_000;
const medioMalla: TipoMedio = "red-local";

function mCuadro(t: number, bytes: number, ancho: number, alto: number): CuadroRecibido {
    return { t, bytes, ancho, alto, completo: true, codec: "jpeg" };
}

function medida(parcial: Partial<MedidaCuadros> = {}): MedidaCuadros {
    return { fuente: "proyeccion", cuadros: 0, desdeInicioMs: 0, desdeUltimoMs: null, ...parcial };
}

describe("CTL1124D · cuadros por la malla cuentan en el medidor", () => {
    it("varios cuadros llegados por la malla dan fps > 0 y resolución del último", () => {
        const e = estadoInicial("controlador", medioMalla);
        for (let i = 0; i < 5; i++) {
            añadirCuadro(e, mCuadro(AHORA - 2_000 + i * 200, 30_000, 1280, 720));
        }
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBeGreaterThan(0);
        expect(m.resolucion).toEqual({ ancho: 1280, alto: 720 });
        expect(m.cuadrosEnVentana).toBe(5);
    });

    it("un solo cuadro da resolución aunque no fps (único en la ventana)", () => {
        const e = estadoInicial("controlador", medioMalla);
        añadirCuadro(e, mCuadro(AHORA - 200, 30_000, 1920, 1080));
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBe(0);
        expect(m.resolucion).toEqual({ ancho: 1920, alto: 1080 });
        expect(m.codec).toBe("jpeg");
    });
});

describe("CTL1124D · el rótulo muestra cuadros/s", () => {
    it("textoFps: un decimal con coma por debajo de 10, entero por encima", () => {
        expect(textoFps(2.75)).toBe("2,8");
        expect(textoFps(2.74)).toBe("2,7");
        expect(textoFps(15)).toBe("15");
        expect(textoFps(0)).toBe("0,0");
        expect(textoFps(undefined)).toBeNull();
        expect(textoFps(-1)).toBeNull();
    });

    it("rotuloFuenteMedida anexa los cuadros medidos a la fuente real", () => {
        expect(rotuloFuenteMedida("proyeccion", 2.7)).toBe("Pantalla fluida (proyección) · 2,7 cuadros/s");
        expect(rotuloFuenteMedida("accesibilidad", 4)).toBe("Pantalla por accesibilidad · 4,0 cuadros/s");
        expect(rotuloFuenteMedida("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(rotuloFuenteMedida(null)).toBe("Pantalla: aún sin fuente");
    });
});

describe("CTL1124D · fuente «proyeccion» no es una respuesta vacía", () => {
    it("veredictoFuente: pedida proyeccion y real proyeccion = cumplida", () => {
        expect(veredictoFuente("proyeccion", "proyeccion")).toEqual({ cumplida: true, aviso: null });
    });

    it("veredictoFuente: pedida proyeccion pero real accesibilidad = no cumplida con aviso", () => {
        const v = veredictoFuente("proyeccion", "accesibilidad");
        expect(v.cumplida).toBe(false);
        expect(v.aviso).toContain("proyección");
    });

    it("veredictoFuente: real null (no hay fuente todavía) = no cumplida", () => {
        expect(veredictoFuente("proyeccion", null)).toEqual({ cumplida: false, aviso: null });
    });

    it("fuenteActivaDe lee fuente_activa de las capacidades del aparato", () => {
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "proyeccion" } })).toBe("proyeccion");
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "accesibilidad" } })).toBe("accesibilidad");
        expect(fuenteActivaDe({ pantalla: {} })).toBeNull();
        expect(fuenteActivaDe(null)).toBeNull();
    });

    it("proyeccionConcedida solo es true si pantalla.proyeccion === true", () => {
        expect(proyeccionConcedida({ pantalla: { proyeccion: true } })).toBe(true);
        expect(proyeccionConcedida({ pantalla: { proyeccion: false } })).toBe(false);
        expect(proyeccionConcedida({ pantalla: {} })).toBe(false);
        expect(proyeccionConcedida(null)).toBe(false);
    });

    it("rotuloFuente nombra la fuente real (proyección / accesibilidad / sin determinar)", () => {
        expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
        expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
    });
});

describe("CTL1124D · salud de los cuadros con fuente proyeccion", () => {
    it("con fuente proyeccion y cuadros recibidos la pantalla da imagen", () => {
        expect(estadoCuadros(medida({ cuadros: 3, desdeUltimoMs: 100 }))).toBe("dando");
    });

    it("sin fuente no hay imagen aunque pasen los ms", () => {
        expect(estadoCuadros(medida({ fuente: null, desdeInicioMs: 9_000 }))).toBe("sin-fuente");
    });
});
