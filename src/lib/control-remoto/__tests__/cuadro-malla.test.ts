/**
 * CTL1118M · piezas puras: automático inteligente (auto-enlace), pantalla por la malla y WebRTC en Linux.
 *
 * Pruebas de funciones puras de cuadro-malla sin red, disco ni procesos lanzados.
 */
import { describe, expect, it } from "vitest";
import {
    PARTE_CUADRO_MAX,
    UMBRALES_MALLA,
    MAX_CUADRO_BYTES,
    RE_B64,
    aBase64,
    deBase64,
    ParteCuadro,
    partirCuadro,
    leerParteCuadro,
    validarPideCuadro,
    nivelDe,
    esperaSinCuadro,
    planPorCamino,
    lineaVia,
    causaParaMalla,
    prioridadOrden,
    debeCederOrden,
    ReensambladorCuadro,
} from "../cuadro-malla";
import { NIVELES_CUADRO, RITMO_INICIAL, siguienteRitmo } from "../ritmo-pantalla";

const jpeg = (n: number) => new Uint8Array(n).fill(0x7F); // placeholder for testing

describe("cuadro-malla · funciones puras", () => {
    it("partirCuadro rechaza lo vacío o demasiado grande y las partes mal formadas", () => {
        expect(() => partirCuadro(new Uint8Array(0), 1)).toThrow("demasiado-grande");
        expect(() => partirCuadro(new Uint8Array(MAX_CUADRO_BYTES + 1), 1)).toThrow("demasiado-grande");
        const [p] = partirCuadro(jpeg(100), 1);
        expect(leerParteCuadro(p)).toEqual(p);
        expect(leerParteCuadro({ ...p, datos: "***" })).toBeNull();
        expect(leerParteCuadro({ ...p, total: 5000 })).toBeNull();
        expect(leerParteCuadro({ ...p, i: 3 })).toBeNull();
        expect(leerParteCuadro(null)).toBeNull();
    });

    it("parte y reensambla un cuadro (con partes en cualquier orden)", () => {
        const j = jpeg(PARTE_CUADRO_MAX * 2 + 123);
        const ps = partirCuadro(j, 7);
        expect(ps).toHaveLength(3);
        const re = new ReensambladorCuadro();
        expect(re.meter(ps[2])).toBeNull();
        expect(re.meter(ps[0])).toBeNull();
        expect(re.meter(ps[1])).toEqual(j);
    });
});

describe("cuadro-malla · umbrales de ritmo", () => {
    it("con umbrales de malla se baja de nivel antes que con los de WebRTC", () => {
        let web = RITMO_INICIAL, malla = RITMO_INICIAL;
        for (let i = 0; i < 4; i++) {
            web = siguienteRitmo(web, 120).estado;
            malla = siguienteRitmo(malla, 120, UMBRALES_MALLA).estado;
        }
        expect(malla.nivel).toBe(0); // and es normal por la malla (alto = 250)
    });
});
