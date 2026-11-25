/**
 * CTL1124G · Android controlado: la pantalla por accesibilidad no da ni el cuadro inicial y la ventana
 * se queda a 0,0 cuadros/s. Lo puro: cuándo se considera que no hay imagen, cuándo se avisa de la
 * pantalla fluida (que se acepta EN el aparato, nunca por la persona), el registro de lo no aceptado
 * y el ciclo del bucle de captura (que no puede quedarse «en marcha» sin bucle al reabrir).
 */
import { describe, expect, it } from "vitest";
import {
    AVISO_PANTALLA_FLUIDA,
    ESPERA_PRIMER_CUADRO_MS,
    SILENCIO_CUADRO_MS,
    debeAvisarPantallaFluida,
    estadoCuadros,
    lineaProyeccionNoAceptada,
    lineaSinCuadros,
    textoCuadros,
    type MedidaCuadros,
} from "../fuente-pantalla";
import { bucleAlAbrir, bucleAlCerrar, type EstadoBucle } from "../pantalla-origen";

function medida(parcial: Partial<MedidaCuadros>): MedidaCuadros {
    return {
        fuente: "accesibilidad",
        cuadros: 0,
        desdeInicioMs: 0,
        desdeUltimoMs: null,
        ...parcial,
    };
}

describe("CTL1124G · salud de los cuadros de pantalla", () => {
    it("sin fuente no se puede decir nada del estado", () => {
        expect(estadoCuadros(medida({ fuente: null }))).toBe("sin-fuente");
    });

    it("al abrir se espera el cuadro inicial durante la ventana corta", () => {
        expect(estadoCuadros(medida({ desdeInicioMs: 0 }))).toBe("esperando");
        expect(estadoCuadros(medida({ desdeInicioMs: ESPERA_PRIMER_CUADRO_MS - 1 }))).toBe("esperando");
    });

    it("sin ningún cuadro al vencer la ventana es una pantalla parada (0 cuadros/s)", () => {
        expect(estadoCuadros(medida({ desdeInicioMs: ESPERA_PRIMER_CUADRO_MS }))).toBe("parada");
        expect(estadoCuadros(medida({ desdeInicioMs: 60_000 }))).toBe("parada");
    });

    it("con un cuadro inicial ya da imagen aunque no haya llegado otro todavía", () => {
        expect(estadoCuadros(medida({ cuadros: 1, desdeInicioMs: 900, desdeUltimoMs: 900 }))).toBe("dando");
    });

    it("un silencio mayor que el máximo (sin pausa) vuelve a ser pantalla parada", () => {
        expect(estadoCuadros(medida({ cuadros: 4, desdeInicioMs: 9_000, desdeUltimoMs: SILENCIO_CUADRO_MS - 1 }))).toBe("dando");
        expect(estadoCuadros(medida({ cuadros: 4, desdeInicioMs: 9_000, desdeUltimoMs: SILENCIO_CUADRO_MS }))).toBe("parada");
    });

    it("una pausa local no se confunde con una pantalla rota", () => {
        expect(estadoCuadros(medida({ cuadros: 2, desdeUltimoMs: 30_000, pausada: true }))).toBe("pausa");
        expect(estadoCuadros(medida({ fuente: null, pausada: true }))).toBe("sin-fuente");
    });
});

describe("CTL1124G · aviso de la pantalla fluida", () => {
    it("solo se avisa si va por accesibilidad, está parada y no se pidió ya", () => {
        expect(debeAvisarPantallaFluida("accesibilidad", "parada", false)).toBe(true);
        expect(debeAvisarPantallaFluida("accesibilidad", "parada", true)).toBe(false);
        expect(debeAvisarPantallaFluida("accesibilidad", "esperando", false)).toBe(false);
        expect(debeAvisarPantallaFluida("accesibilidad", "dando", false)).toBe(false);
        expect(debeAvisarPantallaFluida("proyeccion", "parada", false)).toBe(false);
        expect(debeAvisarPantallaFluida(null, "parada", false)).toBe(false);
    });

    it("el texto es claro, nombra la tableta y dice que nadie acepta por la persona", () => {
        expect(textoCuadros("accesibilidad", "parada")).toBe(AVISO_PANTALLA_FLUIDA);
        expect(AVISO_PANTALLA_FLUIDA).toMatch(/tableta/);
        expect(AVISO_PANTALLA_FLUIDA).toMatch(/nadie puede aceptarla por ti/);
        expect(textoCuadros("accesibilidad", "esperando")).toMatch(/primera imagen/);
        expect(textoCuadros("accesibilidad", "dando")).toBeNull();
        expect(textoCuadros("proyeccion", "parada")).toBeNull();
        expect(textoCuadros(null, "parada")).toBeNull();
    });
});

describe("CTL1124G · registro de lo que no se acepta", () => {
    it("la línea de pantalla sin cuadros dice estado, número y fuente", () => {
        expect(lineaSinCuadros("parada", "accesibilidad", 0)).toBe(
            "control-fuente paso=sin-cuadros estado=parada cuadros=0 fuente=accesibilidad sigue=accesibilidad",
        );
        expect(lineaSinCuadros("parada", null, -3)).toContain("cuadros=0");
        expect(lineaSinCuadros("parada", null, Number.NaN)).toContain("cuadros=0");
    });

    it("la línea de fluida no aceptada deja el motivo y que sigue la accesibilidad", () => {
        const l = lineaProyeccionNoAceptada(0, "parada");
        expect(l).toContain("paso=fluida-no-aceptada");
        expect(l).toContain("motivo=sin-consentimiento");
        expect(l).toContain("sigue=accesibilidad");
        expect(l).toContain("estado=parada");
    });
});

describe("CTL1124G · el bucle de captura no se queda «en marcha» sin bucle", () => {
    const parado: EstadoBucle = { enMarcha: false, gen: 0 };

    it("arranca solo con alguna pantalla viva y si no hay bucle", () => {
        expect(bucleAlAbrir(parado, 1)).toEqual({ arrancar: true, gen: 1 });
        expect(bucleAlAbrir(parado, 0)).toEqual({ arrancar: false, gen: 0 });
        expect(bucleAlAbrir({ enMarcha: true, gen: 4 }, 1)).toEqual({ arrancar: false, gen: 4 });
    });

    it("al cerrar la última pantalla limpia el bucle aunque no queden vivas", () => {
        expect(bucleAlCerrar({ enMarcha: true, gen: 3 }, 3, 0)).toEqual({ enMarcha: false, rearmar: false });
    });

    it("si queda otra pantalla, se rearma en vez de dejarlo parado", () => {
        expect(bucleAlCerrar({ enMarcha: true, gen: 3 }, 3, 2)).toEqual({ enMarcha: false, rearmar: true });
    });

    it("un bucle viejo (otra generación) no toca el estado del actual", () => {
        expect(bucleAlCerrar({ enMarcha: true, gen: 5 }, 3, 0)).toEqual({ enMarcha: true, rearmar: false });
    });

    it("reabrir tras cerrar la última vuelve a arrancar: la generación vieja no lo deja muerto", () => {
        const trasCerrar = bucleAlCerrar({ enMarcha: true, gen: 1 }, 1, 0);
        const estadoTrasCerrar: EstadoBucle = { enMarcha: trasCerrar.enMarcha, gen: 1 };
        expect(bucleAlAbrir(estadoTrasCerrar, 1)).toEqual({ arrancar: true, gen: 2 });
    });
});
