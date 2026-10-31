import { describe, expect, it } from "vitest";
import { modeloTarjeta, resolverRespuesta, type ModeloTarjeta } from "../estado-tarjeta";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";

/** Dos grupos cuyos nombres encajan igual: la voz no debe adivinar entre ellos. */
const CTX_AMBIGUO: ContextoVoz = {
    grupos: [
        { id: "g1", nombre: "Banda", miembros: 6 },
        { id: "g2", nombre: "banda", miembros: 3 },
    ],
    contactos: [],
    estaciones: [],
    servidores: [],
    enfoque: null,
    mundoActual: { id: "m1", nombre: "Ensayo" },
};

const CTX: ContextoVoz = {
    grupos: [{ id: "g1", nombre: "Banda", miembros: 6 }],
    contactos: [],
    estaciones: [],
    servidores: [],
    enfoque: null,
    mundoActual: { id: "m1", nombre: "Ensayo" },
};

const OK = (r: ResultadoVoz): Extract<ResultadoVoz, { ok: true }> => {
    if (!r.ok) throw new Error(`Se esperaba ok y fue: ${r.razon} · ${r.pregunta}`);
    return r;
};

/** «Crear un mundo + invitar al grupo Banda» → la tarjeta de confirmación que pinta XR1010Q. */
const CONFIRMAR: ModeloTarjeta = (() => {
    const m = modeloTarjeta(OK(entenderVoz("crea un mundo con cielo de noche y gravedad cero e invita al grupo Banda", CTX)));
    if (!m || m.tipo !== "confirmar") throw new Error("La orden de crear e invitar debía pedir confirmación");
    return m;
})();

/** Ambigüedad real con DOS candidatos: «invita a Banda» con dos grupos que encajan igual. */
const PREGUNTA: Extract<ModeloTarjeta, { tipo: "preguntar" }> = (() => {
    const m = modeloTarjeta(entenderVoz("invita a Banda", CTX_AMBIGUO));
    if (!m || m.tipo !== "preguntar") throw new Error("Se esperaba una pregunta con opciones");
    return m;
})();

describe("la tarjeta de confirmación (XR1010Q · contrato §3 f)", () => {
    it("«crear mundo + invitar al grupo Banda» da la tarjeta de confirmación con sus líneas", () => {
        expect(CONFIRMAR.tipo).toBe("confirmar");
        expect(CONFIRMAR.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(CONFIRMAR.lineas.some((l) => l.startsWith("Crear un mundo"))).toBe(true);
        expect(CONFIRMAR.lineas.some((l) => l.includes("«Banda» (6 personas)"))).toBe(true);
        expect(CONFIRMAR.lineas).toContain("Esto se enviará a: Banda");
        expect(CONFIRMAR.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
    });

    it("guardar en la biblioteca NO sale de la cuenta: sin tarjeta ni línea de envío", () => {
        const m = modeloTarjeta(OK(entenderVoz("súbelo a la biblioteca", CTX)));
        expect(m).toBeNull();
    });

    it("la ambigüedad con dos candidatos da una pregunta con una opción por candidato", () => {
        expect(PREGUNTA.tipo).toBe("preguntar");
        expect(PREGUNTA.opciones).toHaveLength(2);
        expect(PREGUNTA.opciones[0]).toEqual({ id: "g1", etiqueta: "Banda (6 personas)" });
        expect(PREGUNTA.opciones[1].id).toBe("g2");
        expect(PREGUNTA.opciones[1].etiqueta).toContain("(3 personas)");
    });

    it("«sí» con varias opciones NO confirma ni elige: no se adivina", () => {
        expect(resolverRespuesta(PREGUNTA, { tipo: "voz", frase: "sí" })).toBeNull();
        expect(resolverRespuesta(PREGUNTA, { tipo: "voz", frase: "vale" })).toBeNull();
        // En la confirmación, en cambio, «sí» ES la confirmación (acción única y clara).
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "sí" })).toBe("confirmar");
    });

    it("«el segundo» elige el segundo candidato", () => {
        expect(resolverRespuesta(PREGUNTA, { tipo: "voz", frase: "el segundo" })).toEqual({ elegir: "g2" });
        expect(resolverRespuesta(PREGUNTA, { tipo: "voz", frase: "el primero" })).toEqual({ elegir: "g1" });
    });

    it("«cancela» cancela, en la pregunta y en la confirmación", () => {
        expect(resolverRespuesta(PREGUNTA, { tipo: "voz", frase: "cancela" })).toBe("cancelar");
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "no" })).toBe("cancelar");
    });

    it("por voz, la confirmación acepta «confirmar», «vale» y «hazlo»; «cambiar» cambia; lo raro, null", () => {
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "hazlo" })).toBe("confirmar");
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "confirmar" })).toBe("confirmar");
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "cambiar" })).toBe("cambiar");
        expect(resolverRespuesta(CONFIRMAR, { tipo: "voz", frase: "qué hora es" })).toBeNull();
    });

    it("«sin-contexto» y «falta-dato» muestran la pregunta tal cual, sin opciones", () => {
        const sinCtx = entenderVoz("pon cielo de noche", { ...CTX, mundoActual: null, grupos: [], contactos: [], estaciones: [], servidores: [], enfoque: null });
        const m = modeloTarjeta(sinCtx);
        expect(m?.tipo).toBe("preguntar");
        if (m?.tipo === "preguntar") {
            expect(m.opciones).toEqual([]);
            expect(m.pregunta).toBe("No hay ningún mundo abierto que cambiar. Di «crea un mundo…» o entra en uno.");
        }
    });

    it("el estado de error muestra el mensaje (por ejemplo, no entendido)", () => {
        const m = modeloTarjeta(entenderVoz("lárgate a Marte con la banda de jazz", CTX));
        expect(m?.tipo).toBe("error");
        if (m?.tipo === "error") expect(m.mensaje).toContain("No he entendido");
    });

    it("modeloTarjeta(null/undefined) → null y sus respuestas también", () => {
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
        expect(resolverRespuesta(null, { tipo: "boton", id: "confirmar" })).toBeNull();
        expect(resolverRespuesta(null, { tipo: "voz", frase: "confirmar" })).toBeNull();
    });

    it("los botones responden: acción simple en la confirmación, opción en la pregunta", () => {
        expect(resolverRespuesta(CONFIRMAR, { tipo: "boton", id: "confirmar" })).toBe("confirmar");
        expect(resolverRespuesta(CONFIRMAR, { tipo: "boton", id: "cancelar" })).toBe("cancelar");
        expect(resolverRespuesta(PREGUNTA, { tipo: "boton", id: "g1" })).toEqual({ elegir: "g1" });
        expect(resolverRespuesta(PREGUNTA, { tipo: "boton", id: "inexistente" })).toBeNull();
    });
});

