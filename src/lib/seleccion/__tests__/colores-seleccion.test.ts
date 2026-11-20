import { afterEach, describe, expect, it } from "vitest";
import {
    PALETA_SELECCION_USUARIOS,
    PREFERENCIA_SELECCION_DEFECTO,
    asignarColoresUnicos,
    colorSeleccionUsuario,
    estiloSeleccionUsuario,
    guardarPreferenciaSeleccion,
    hexDePreferencia,
    leerPreferenciaSeleccion,
} from "../colores-seleccion";

describe("colores-seleccion", () => {
    afterEach(() => {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.clear();
        }
    });

    it("genera estilos RGBA accesibles y variables CSS válidas para ::selection", () => {
        const est = estiloSeleccionUsuario("#007FFF");
        expect(est.hex).toBe("#007FFF");
        expect(est.fondo).toBe("rgba(0, 127, 255, 0.42)");
        expect(est.texto).toBe("#FFFFFF");
        expect(est.cssVars["--selection-background"]).toBe("rgba(0, 127, 255, 0.42)");
        expect(est.cssVars["--selection-foreground"]).toBe("#FFFFFF");

        const claro = estiloSeleccionUsuario("#FFBF00");
        expect(claro.texto).toBe("#071019");
    });

    it("asigna colores deterministas y únicos sin colisiones en sesiones compartidas y transmisiones", () => {
        const participantes = [
            { id: "maggasukha", nombre: "Alex", colorPreferido: "#007FFF" },
            { id: "hermes", nombre: "Hermes", colorPreferido: "#007FFF" }, // colisión intencional
            { id: "nodo-oracle-a1", nombre: "Oracle A1" },
            { id: "maggabox", nombre: "Maggabox" },
            { id: "transmision-canal-1", nombre: "Transmisión 1" },
            { id: "invitado-1", nombre: "Invitado 1" },
        ];
        const asignados = asignarColoresUnicos(participantes);
        const colores = Object.values(asignados).map((u) => u.hex);
        expect(colores).toHaveLength(participantes.length);
        expect(new Set(colores).size).toBe(participantes.length);
        expect(asignados.maggasukha.hex).toBe("#007FFF");
        expect(asignados.hermes.hex).not.toBe("#007FFF");
    });

    it("soporta salas con más usuarios que la paleta base sin repetir colores", () => {
        const muchos = Array.from({ length: PALETA_SELECCION_USUARIOS.length + 6 }, (_, i) => ({
            id: `usuario-${i + 1}`,
            nombre: `Usuario ${i + 1}`,
        }));
        const asignados = asignarColoresUnicos(muchos);
        const colores = Object.values(asignados).map((u) => u.hex);
        expect(new Set(colores).size).toBe(muchos.length);
    });

    it("persiste y lee preferencias de selección en localStorage / Storage", () => {
        const mapa = new Map<string, string>();
        const almacen = {
            getItem: (k: string) => mapa.get(k) ?? null,
            setItem: (k: string, v: string) => {
                mapa.set(k, v);
            },
        };
        expect(leerPreferenciaSeleccion(almacen)).toEqual(PREFERENCIA_SELECCION_DEFECTO);
        guardarPreferenciaSeleccion(
            {
                colorId: "horizon",
                hexPersonalizado: "#10B981",
                unicidadCompartida: true,
            },
            almacen,
        );
        const leida = leerPreferenciaSeleccion(almacen);
        expect(leida.colorId).toBe("horizon");
        expect(hexDePreferencia(leida)).toBe("#10B981");
        expect(colorSeleccionUsuario("maggasukha", leida).hex).toBe("#10B981");
    });
});
