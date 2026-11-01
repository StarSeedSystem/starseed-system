import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";
import { destinatariosDe, modeloTarjeta, resolverRespuesta } from "../estado-tarjeta";

/**
 * Rescate de RTXR1010Q. En main la tarjeta no se modela aparte: `entenderVoz` devuelve
 * el fallo con sus candidatos y la tarjeta con título, líneas y acciones. Solo se
 * conservan los casos que main todavía no cubría.
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

/** «Banda vieja» responde también a «banda»: dos exactos y, por tanto, nunca se adivina. */
const CTX_AMB: ContextoVoz = {
    ...CTX,
    grupos: [
        { id: "g1", nombre: "Banda", miembros: 6 },
        { id: "g2", nombre: "Banda vieja", miembros: 3, alias: ["banda"] },
    ],
};

type Ok = Extract<ResultadoVoz, { ok: true }>;
type Fallo = Extract<ResultadoVoz, { ok: false }>;

const okDe = (frase: string): Ok => {
    const r = entenderVoz(frase, CTX);
    if (!r.ok) throw new Error(`Se esperaba ok y fue fallo ${r.razon}: ${r.pregunta}`);
    return r;
};

const falloDe = (frase: string): Fallo => {
    const r = entenderVoz(frase, CTX);
    if (r.ok) throw new Error("Se esperaba un fallo y fue ok");
    return r;
};

const falloDeAmb = (frase: string): Fallo => {
    const r = entenderVoz(frase, CTX_AMB);
    if (r.ok) throw new Error("Se esperaba un fallo ambiguo y fue ok");
    return r;
};

describe("el estado de la tarjeta de confirmación (XR1010Q)", () => {
    it("«crea un mundo… e invita al grupo Banda» da título, acciones y una línea por paso", () => {
        const ok = okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda");
        expect(ok.confirmar).toBe(true);
        const tarjeta = ok.tarjeta;
        if (!tarjeta) throw new Error("faltó la tarjeta de confirmación");
        expect(tarjeta.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(tarjeta.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(tarjeta.lineas).toHaveLength(3);
        expect(tarjeta.lineas[0]).toContain("Crear un mundo");
        expect(tarjeta.lineas[0]).toContain("cielo de noche");
        expect(tarjeta.lineas[1]).toBe("Poner gravedad «cero»");
        expect(tarjeta.lineas[2]).toBe("Invitar a «Banda» (6 personas)");
    });

    it("dos candidatos: la pregunta «¿Cuál?» trae a cada uno con sus miembros", () => {
        const f = falloDeAmb("invita a la banda");
        expect(f.razon).toBe("ambiguo");
        expect(f.pregunta).toContain("¿Cuál?");
        expect(f.candidatos).toEqual([
            { tipo: "grupo", id: "g1", nombre: "Banda", miembros: 6 },
            { tipo: "grupo", id: "g2", nombre: "Banda vieja", miembros: 3 },
        ]);
    });

    it("«invita a este grupo» sin nada señalado lo pide y no inventa candidatos", () => {
        const f = falloDe("invita a este grupo");
        expect(f.razon).toBe("falta-dato");
        expect(f.pregunta).toContain("señalado");
        expect(f.candidatos).toBeUndefined();
    });
});

describe("el modelo y la respuesta de la tarjeta (XR1010Q)", () => {
    const cartaDe = (frase: string, ctx: ContextoVoz = CTX) => modeloTarjeta(entenderVoz(frase, ctx));

    it("confirmación «crear mundo + invitar»: título, tres líneas y lo que se enviará a", () => {
        const r = okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda");
        const m = modeloTarjeta(r);
        if (!m || m.tipo !== "confirmar") throw new Error("se esperaba una tarjeta de confirmación");
        expect(m.titulo).toContain("¿Lo hago");
        expect(m.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(m.lineas.some((l) => l.startsWith("Crear un mundo"))).toBe(true);
        expect(m.lineas.some((l) => l === "Invitar a «Banda» (6 personas)")).toBe(true);
        expect(destinatariosDe(r.pasos)).toEqual(["Banda (6 personas)"]);
    });

    it("guardar en la Biblioteca propia no sale de la cuenta ni pide confirmación", () => {
        expect(destinatariosDe(okDe("súbelo a la biblioteca").pasos)).toEqual([]);
        expect(modeloTarjeta(okDe("súbelo a la biblioteca"))).toBeNull();
    });

    it("dos candidatos: pregunta con una opción por cada uno, con sus miembros", () => {
        const m = cartaDe("invita a la banda", CTX_AMB);
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba pregunta");
        expect(m.pregunta).toContain("¿Cuál?");
        expect(m.opciones).toEqual([
            { id: "g1", etiqueta: "Banda (6 personas)" },
            { id: "g2", etiqueta: "Banda vieja (3 personas)" },
        ]);
    });

    it("«sí» con varias opciones NUNCA confirma; «el segundo» sí elige", () => {
        const m = cartaDe("invita a la banda", CTX_AMB);
        if (!m || m.tipo !== "preguntar") throw new Error("falta la pregunta");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "sí" })).toBeNull();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "vale" })).toBeNull();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "el segundo" })).toEqual({ elegir: "g2" });
        expect(resolverRespuesta(m, { tipo: "voz", frase: "Banda vieja" })).toEqual({ elegir: "g2" });
        expect(resolverRespuesta(m, { tipo: "boton", id: "g2" })).toEqual({ elegir: "g2" });
    });

    it("«cancela» cancela desde la pregunta y desde la confirmación", () => {
        const p = cartaDe("invita a la banda", CTX_AMB);
        expect(resolverRespuesta(p, { tipo: "voz", frase: "cancela" })).toBe("cancelar");
        expect(resolverRespuesta(p, { tipo: "boton", id: "cancelar" })).toBe("cancelar");
    });

    it("confirmación por voz y por botón: vale/hazlo confirma, cambiar cambia", () => {
        const m = modeloTarjeta(okDe("crea un mundo con cielo de noche e invita al grupo Banda"));
        for (const frase of ["confirmar", "sí", "vale", "hazlo"]) expect(resolverRespuesta(m, { tipo: "voz", frase })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "no" })).toBe("cancelar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "confirmar" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "lluvia" })).toBeNull();
    });

    it("«¿te refieres a…?» y «sin contexto» son pregunta sin opciones: cancela o repites", () => {
        const m = cartaDe("invita a este grupo");
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba pregunta");
        expect(m.opciones).toEqual([]);
        expect(resolverRespuesta(m, { tipo: "voz", frase: "sí" })).toBeNull();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "cancela" })).toBe("cancelar");
    });

    it("frases desconocidas son estado de error, con su mensaje", () => {
        const m = cartaDe("habla con Eli");
        if (!m || m.tipo !== "error") throw new Error("se esperaba error");
        expect(m.mensaje).toContain("No he entendido");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "sí" })).toBeNull();
        expect(resolverRespuesta(m, { tipo: "boton", id: "confirmar" })).toBeNull();
    });

    it("null-ish y sin tarjeta no dan modelo", () => {
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
    });
});
