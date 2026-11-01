import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";
import { modeloTarjeta, resolverRespuesta, type ModeloTarjeta } from "../estado-tarjeta";

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

/** XR1010Q · modelo de la tarjeta y sus respuestas (estado-tarjeta.ts, puro). */
describe("el modelo de la tarjeta de confirmación (XR1010Q)", () => {
    const confirmarDe = (): Extract<ModeloTarjeta, { tipo: "confirmar" }> => {
        const m = modeloTarjeta(okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        if (!m || m.tipo !== "confirmar") throw new Error(`Se esperaba «confirmar» y fue ${JSON.stringify(m)}`);
        return m;
    };

    it("la confirmación de «crear mundo + invitar al grupo Banda» da título, líneas y las tres acciones", () => {
        const m = confirmarDe();
        expect(m.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(m.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(m.lineas).toHaveLength(4);
        expect(m.lineas[0]).toContain("Crear un mundo");
        expect(m.lineas[1]).toBe("Poner gravedad «cero»");
        expect(m.lineas[2]).toBe("Invitar a «Banda» (6 personas)");
    });

    it("el séptima línea dice a quién se enviará: saleDeLaCuenta con los nombres", () => {
        expect(confirmarDe().lineas[3]).toBe("Esto se enviará a: Banda");
    });

    it("«ok» sin confirmar y null-ish dan null", () => {
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(okDe("recentra"))).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
    });

    it("la ambigüedad se vuelve una pregunta con una opción por candidato", () => {
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba «preguntar»");
        expect(m.pregunta).toContain("¿Cuál?");
        expect(m.opciones).toEqual([
            { id: "g1", etiqueta: "Banda (6 personas)" },
            { id: "g2", etiqueta: "Banda vieja (3 personas)" },
        ]);
    });

    it("«sí» con varias opciones NUNCA confirma: la delegación de elegirCandidato lo descarta", () => {
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba «preguntar»");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "sí" })).toBeNull();
    });

    it("«el segundo» nuestro «Banda vieja» eligen por orden y nombre", () => {
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba «preguntar»");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "el segundo" })).toEqual({ elegir: "g2" });
        expect(resolverRespuesta(m, { tipo: "voz", frase: "Banda vieja" })).toEqual({ elegir: "g2" });
    });

    it("«cancela» cancela, por voz y en cuanto la tarjeta lista opciones", () => {
        expect(resolverRespuesta(confirmarDe(), { tipo: "voz", frase: "cancela" })).toBe("cancelar");
        expect(resolverRespuesta(confirmarDe(), { tipo: "boton", id: "cancelar" })).toBe("cancelar");
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba «preguntar»");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "no" })).toBe("cancelar");
    });

    it("voz positiva («sí», «vale», «hazlo») confirma y «cambiar» cambia en la tarjeta de confirmación", () => {
        const m = confirmarDe();
        expect(resolverRespuesta(m, { tipo: "voz", frase: "sí" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "vale" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "hazlo" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "voz", frase: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "confirmar" })).toBe("confirmar");
        expect(resolverRespuesta(m, { tipo: "boton", id: "cambiar" })).toBe("cambiar");
    });

    it("sin contexto o falta de dato: la pregunta tal cual y sin opciones", () => {
        const m = modeloTarjeta(falloDe("invita a este grupo"));
        if (!m || m.tipo !== "preguntar") throw new Error("se esperaba «preguntar»");
        expect(m.opciones).toEqual([]);
        expect(m.pregunta).toContain("señalado");
    });

    it("«vacío» y «no entendido» dan estado de error con su mensaje", () => {
        const e1 = modeloTarjeta(falloDe(""));
        expect(e1).toEqual({ tipo: "error", mensaje: "No te he oído. Dime qué quieres hacer." });
        const e2 = modeloTarjeta(falloDe("cocina luna"));
        if (!e2 || e2.tipo !== "error") throw new Error("se esperaba «error»");
        expect(e2.mensaje).toContain("No he entendido");
    });

    it("un botón que no existe no hace nada", () => {
        expect(resolverRespuesta(confirmarDe(), { tipo: "boton", id: "olo" })).toBeNull();
    });

    it("sin modelo, cualquier entrada desemboca en null", () => {
        expect(resolverRespuesta(null, { tipo: "voz", frase: "sí" })).toBeNull();
        expect(resolverRespuesta(null, { tipo: "boton", id: "confirmar" })).toBeNull();
    });
});
