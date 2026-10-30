/** XR1010O · reductor puro del orbe de Astraura. Node: sin red, audio, hardware ni WebGL. */
import { describe, expect, it } from "vitest";
import { capaDe } from "../../../../lib/xr/intenciones-voz";
import type { Intencion } from "../../../../lib/xr/intenciones-tipos";
import { COLORES_NODO } from "../../../../lib/xr/tokens-3d";
import {
    ESTADO_ORBE_INICIAL,
    TEXTO_ERROR_ORBE,
    eventoEntendido,
    lineasDe,
    parametrosVisuales,
    siguienteEstadoOrbe,
} from "../estado-orbe";

const libre: Intencion = {
    tipo: "crear-mundo",
    descripcion: "un bosque con luciérnagas",
    caracteristicas: [],
    modo: "vr",
    libre: true,
};

describe("siguienteEstadoOrbe", () => {
    it("recorre reposo → escuchando → pensando → hablando → reposo", () => {
        let e = ESTADO_ORBE_INICIAL;
        e = siguienteEstadoOrbe(e, { tipo: "escucha-inicio" });
        expect(e.fase).toBe("escuchando");
        e = siguienteEstadoOrbe(e, { tipo: "escucha-fin" });
        expect(e.fase).toBe("pensando");
        e = siguienteEstadoOrbe(e, { tipo: "habla-inicio" });
        expect(e.fase).toBe("hablando");
        e = siguienteEstadoOrbe(e, { tipo: "habla-fin" });
        expect(e).toMatchObject({ fase: "reposo", nivelVoz: 0 });
    });

    it("un error vuelve a reposo con su texto y sin capa", () => {
        const escuchando = siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" });
        const e = siguienteEstadoOrbe(escuchando, { tipo: "error", texto: "Sin conexión con Astraura." });
        expect(e).toMatchObject({ fase: "reposo", capa: null, nivelVoz: 0, texto: "Sin conexión con Astraura." });
        expect(siguienteEstadoOrbe(escuchando, { tipo: "error" }).texto).toBe(TEXTO_ERROR_ORBE);
    });

    it("rellena la capa con capaDe: mundo libre → razón", () => {
        expect(capaDe(libre)).toBe("razon");
        const e = siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, eventoEntendido(libre));
        expect(e).toMatchObject({ fase: "pensando", capa: "razon" });
    });

    it("rellena la capa con capaDe: orden cerrada → reflejo", () => {
        const salir: Intencion = { tipo: "sistema", orden: "salir" };
        expect(capaDe(salir)).toBe("reflejo");
        expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, eventoEntendido(salir)).capa).toBe("reflejo");
        expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "entendido", capa: "palabra" }).capa).toBe("palabra");
    });

    it("sustituye el texto parcial y conserva el final al pasar por pensando y habla", () => {
        let e = siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" });
        e = siguienteEstadoOrbe(e, { tipo: "texto-parcial", texto: "crea un" });
        e = siguienteEstadoOrbe(e, { tipo: "texto-parcial", texto: "crea un mundo con noche" });
        expect(e.texto).toBe("crea un mundo con noche");
        e = siguienteEstadoOrbe(e, { tipo: "escucha-fin" });
        expect(e.texto).toBe("crea un mundo con noche");
        e = siguienteEstadoOrbe(e, { tipo: "habla-inicio", texto: "Listo, ya está el mundo." });
        expect(e.texto).toBe("Listo, ya está el mundo.");
        e = siguienteEstadoOrbe(e, { tipo: "habla-fin" });
        expect(e.texto).toBe("Listo, ya está el mundo.");
    });

    it("una escucha nueva limpia la capa y el texto anterior", () => {
        const entendido = siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, eventoEntendido(libre));
        const e = siguienteEstadoOrbe(entendido, { tipo: "escucha-inicio" });
        expect(e).toMatchObject({ fase: "escuchando", capa: null, texto: "" });
    });

    it("suena la voz: el nivel de voz se recorta a 0…1 y se reinicia al hablar", () => {
        expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "nivel-voz", nivel: 2 }).nivelVoz).toBe(1);
        expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "nivel-voz", nivel: -1 }).nivelVoz).toBe(0);
        expect(siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "nivel-voz", nivel: Number.NaN }).nivelVoz).toBe(0);
        const alto = siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "nivel-voz", nivel: 0.9 });
        expect(siguienteEstadoOrbe(alto, { tipo: "escucha-fin" }).nivelVoz).toBe(0);
        expect(siguienteEstadoOrbe(alto, { tipo: "habla-fin" }).nivelVoz).toBe(0);
    });
});

describe("parametrosVisuales", () => {
    it("con movimiento reducido el pulso es siempre 0", () => {
        const escuchando = siguienteEstadoOrbe(
            siguienteEstadoOrbe(ESTADO_ORBE_INICIAL, { tipo: "escucha-inicio" }),
            { tipo: "nivel-voz", nivel: 0.8 },
        );
        for (const fase of ["reposo", "escuchando", "pensando", "hablando"] as const) {
            expect(parametrosVisuales({ ...escuchando, fase }, true).pulso).toBe(0);
        }
    });

    it("sin movimiento reducido late más fuerte con la voz y crece de radio", () => {
        const base = { ...ESTADO_ORBE_INICIAL, fase: "escuchando" as const };
        const callado = parametrosVisuales({ ...base, nivelVoz: 0 }, false);
        const conVoz = parametrosVisuales({ ...base, nivelVoz: 1 }, false);
        expect(callado.pulso).toBeGreaterThan(0);
        expect(conVoz.pulso).toBeGreaterThan(callado.pulso);
        expect(conVoz.radio).toBeGreaterThan(callado.radio);
        expect(conVoz.color).toBe(COLORES_NODO.zenith.vivo);
        expect(parametrosVisuales(ESTADO_ORBE_INICIAL, false).color).toBe(COLORES_NODO.zenith.base);
    });
});

describe("lineasDe", () => {
    it("recorta a tres líneas y descarta las vacías", () => {
        expect(lineasDe("una\n\n  dos  \ntres\ncuatro")).toEqual(["una", "dos", "tres"]);
        expect(lineasDe("sola", 5)).toEqual(["sola"]);
    });
});
