import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";
import { modeloTarjeta, resolverRespuesta, type ModeloPreguntar } from "../estado-tarjeta";

/**
 * XR1010Q · estado de la tarjeta de confirmación 3D (contrato `architecture/starseed-xr.md` §3 f).
 * Los casos que solo prueban `entenderVoz` del núcleo ya están en `src/lib/xr/__tests__/intenciones-voz.test.ts`;
 * aquí se prueba lo que la tarjeta AÑADE: el modelo (confirmar/preguntar/error/null) y la respuesta
 * por botón y por voz, que NUNCA toma un «sí» ambiguo como confirmación.
 */

const CTX: ContextoVoz = {
    grupos: [
        { id: "g1", nombre: "Banda", miembros: 6 },
        { id: "g2", nombre: "Banda vieja", miembros: 3 },
    ],
    contactos: [{ id: "p1", nombre: "Ana" }],
    estaciones: [{ id: "e1", nombre: "Cumbre" }],
    servidores: [],
    enfoque: null,
    mundoActual: { id: "m1", nombre: "Ensayo" },
};

/** «Banda vieja» responde también a «banda» (alias): dos exactos y, por tanto, nunca se adivina. */
const CTX_AMB: ContextoVoz = {
    ...CTX,
    grupos: [...CTX.grupos.slice(0, 1), { ...CTX.grupos[1], alias: ["banda"] }],
};

const resultado = (frase: string, ctx: ContextoVoz = CTX): ResultadoVoz => entenderVoz(frase, ctx);

describe("modeloTarjeta (XR1010Q)", () => {
    it("«crea un mundo… e invita al grupo Banda» da confirmación con título, 3 líneas, acciones y destino", () => {
        const m = modeloTarjeta(resultado("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        if (m?.tipo !== "confirmar") throw new Error(`se esperaba confirmar, fue ${m?.tipo}`);
        expect(m.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(m.lineas).toHaveLength(3);
        expect(m.lineas[0]).toContain("Crear un mundo");
        expect(m.lineas[2]).toBe("Invitar a «Banda» (6 personas)");
        expect(m.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(m.envia).toEqual(["Banda"]);
    });

    it("lo que NO sale de la cuenta no muestra tarjeta (null)", () => {
        expect(modeloTarjeta(resultado("crea un mundo con cielo de noche"))).toBeNull();
    });

    it("«invita a la banda» con dos encajes da una opción por candidato, con sus miembros", () => {
        const m = modeloTarjeta(resultado("invita a la banda", CTX_AMB));
        if (m?.tipo !== "preguntar" || !m.candidatos) throw new Error("se esperaba preguntar con candidatos");
        expect(m.pregunta).toContain("¿Cuál?");
        expect(m.opciones).toEqual([
            { id: "g1", etiqueta: "Banda (6 personas)" },
            { id: "g2", etiqueta: "Banda vieja (3 personas)" },
        ]);
    });

    it("«invita a este grupo» sin nada señalado da la pregunta tal cual y SIN opciones", () => {
        const m = modeloTarjeta(resultado("invita a este grupo"));
        if (m?.tipo !== "preguntar") throw new Error("se esperaba preguntar");
        expect(m.pregunta).toContain("señalado");
        expect(m.opciones).toEqual([]);
        expect(m.candidatos).toBeUndefined();
    });

    it("«no entendido» da una tarjeta de error con la misma pregunta", () => {
        const m = modeloTarjeta(resultado("haz una tarta de queso"));
        if (m?.tipo !== "error") throw new Error("se esperaba un error");
        expect(m.mensaje).toContain("No he entendido");
    });

    it("un resultado vacío (null-ish) no pinta nada", () => {
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
    });
});

describe("resolverRespuesta (XR1010Q)", () => {
    const pregunta = (): ModeloPreguntar => {
        const m = modeloTarjeta(resultado("invita a la banda", CTX_AMB));
        if (m?.tipo !== "preguntar") throw new Error("falta la pregunta con dos candidatos");
        return m;
    };
    const confirmacion = (): Extract<NonNullable<ReturnType<typeof modeloTarjeta>>, { tipo: "confirmar" }> => {
        const m = modeloTarjeta(resultado("invita al grupo Banda"));
        if (m?.tipo !== "confirmar") throw new Error("falta la confirmación");
        return m;
    };

    it("por voz en la pregunta: «el segundo» elige g2 y «banda vieja» elige por nombre", () => {
        const m = pregunta();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "El segundo" })).toEqual({ elegir: "g2" });
        expect(resolverRespuesta(m, { tipo: "voz", frase: "banda vieja" })).toEqual({ elegir: "g2" });
    });

    it("«sí» con varias opciones NUNCA confirma ni elige: null", () => {
        expect(resolverRespuesta(pregunta(), { tipo: "voz", frase: "Sí" })).toBeNull();
    });

    it("«cancela» en la pregunta cancela, y el botón de una opción elige su id", () => {
        const m = pregunta();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "cancela" })).toBe("cancelar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "g1" })).toEqual({ elegir: "g1" });
        expect(resolverRespuesta(m, { tipo: "boton", id: "g9" })).toBeNull();
    });

    it("en la confirmación: «hazlo»/«vale» confirman, «cambiar» cambia, «no» cancela y un botón raro da null", () => {
        const m = confirmacion();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "hazlo" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "no" })).toBe("cancelar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "salir" })).toBeNull();
    });

    it("sin tarjeta o con error no se responde nada", () => {
        expect(resolverRespuesta(null, { tipo: "voz", frase: "hazlo" })).toBeNull();
        const m = modeloTarjeta(resultado("haz una tarta de queso"));
        if (m?.tipo !== "error") throw new Error("falta el error");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "hazlo" })).toBeNull();
    });
});
