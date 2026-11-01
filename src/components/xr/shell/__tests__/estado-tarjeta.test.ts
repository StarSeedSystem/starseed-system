import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz } from "../../../../lib/xr/intenciones-voz";
import { modeloTarjeta, resolverRespuesta, nombresDeEnvio, type ModeloTarjeta } from "../estado-tarjeta";

type Confirmar = Extract<ModeloTarjeta, { tipo: "confirmar" }>;
type Preguntar = Extract<ModeloTarjeta, { tipo: "preguntar" }>;

const CTX: ContextoVoz = {
    grupos: [
        { id: "g1", nombre: "Banda", miembros: 6 },
        { id: "g2", nombre: "Banda vieja", miembros: 3 },
    ],
    contactos: [{ id: "p1", nombre: "Ana" }], estaciones: [{ id: "e1", nombre: "Cumbre" }],
    servidores: [], enfoque: null, mundoActual: { id: "m1", nombre: "Ensayo" },
};

/** Con «banda» como alias de la vieja, la frase da DOS exactos: se pregunta, nunca se adivina. */
const CTX_AMB: ContextoVoz = {
    ...CTX,
    grupos: [
        { id: "g1", nombre: "Banda", miembros: 6 },
        { id: "g2", nombre: "Banda vieja", miembros: 3, alias: ["banda"] },
    ],
};
const ok = (frase: string, ctx: ContextoVoz = CTX) => {
    const r = entenderVoz(frase, ctx);
    if (!r.ok) throw new Error(`Se esperaba ok y fue fallo ${r.razon}: ${r.pregunta}`);
    return r;
};

/** La duda («¿Cuál? Banda (6 personas) · Banda vieja (3)») ya queda convertida en tarjeta. */
const preguntaDe = (frase: string): Preguntar => {
    const r = entenderVoz(frase, CTX_AMB);
    if (r.ok) throw new Error("Se esperaba una pregunta y la voz entendió la orden");
    const m = modeloTarjeta(r);
    if (!m) throw new Error("La pregunta no pintó ninguna tarjeta");
    if (m.tipo !== "preguntar") throw new Error("la duda salió confirmada: no es honesto");
    return m;
};

const confirmacion = (): Confirmar => {
    const m = modeloTarjeta(ok("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
    if (!m || m.tipo !== "confirmar") throw new Error("faltó la tarjeta de confirmación");
    return m;
};

describe("modeloTarjeta (XR1010Q)", () => {
    it("«crea un mundo… e invita al grupo Banda» da la tarjeta de confirmación con una línea por paso", () => {
        const m = confirmacion();
        expect(m.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(m.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(m.lineas).toHaveLength(3);
        expect(m.lineas[0]).toContain("Crear un mundo");
        expect(m.lineas[1]).toBe("Poner gravedad «cero»");
        expect(m.lineas[2]).toBe("Invitar a «Banda» (6 personas)");
    });

    it("dos candidatos: pregunta «¿Cuál?» con una opción por grupo y sus personas", () => {
        expect(preguntaDe("invita a la banda").opciones).toEqual([
            { id: "g1", etiqueta: "Banda (6 personas)" },
            { id: "g2", etiqueta: "Banda vieja (3 personas)" },
        ]);
    });

    it("«este grupo» sin nada señalado deja la pregunta tal cual y sin opciones", () => {
        const m = preguntaDe("invita a este grupo");
        expect(m.pregunta).toContain("señalado");
        expect(m.opciones).toEqual([]);
    });

    it("«no entendido» da una tarjeta de error y sin nada que confirmar no la hay", () => {
        const error = modeloTarjeta(entenderVoz("comprame una pizza", CTX));
        if (!error || error.tipo !== "error") throw new Error("falta la tarjeta de error");
        expect(error.mensaje).toContain("No he entendido");
        const biblioteca = ok("subelo a la biblioteca");
        expect(biblioteca.confirmar).toBe(false);
        expect(modeloTarjeta(biblioteca)).toBeNull();
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
    });

    it("la línea «Esto se enviará a: …» nombra a quien recibe la orden", () => {
        const r = ok("crea un mundo y mandaselo a Ana e invita al grupo Banda");
        expect(nombresDeEnvio(r.pasos)).toEqual(["«Ana»", "«Banda»"]);
    });
});

describe("resolverRespuesta (XR1010Q)", () => {
    const voz = (m: ModeloTarjeta, frase: string) => resolverRespuesta(m, { tipo: "voz", frase });
    const boton = (m: ModeloTarjeta, id: string) => resolverRespuesta(m, { tipo: "boton", id });

    it("«sí» con varias opciones NO confirma: primero hay que elegir", () => {
        expect(voz(preguntaDe("invita a la banda"), "sí")).toBeNull();
    });
    it("«el segundo» y el propio nombre eligen; «cancela» corta la pregunta", () => {
        const m = preguntaDe("invita a la banda");
        expect(voz(m, "el segundo")).toEqual({ elegir: "g2" });
        expect(voz(m, "banda vieja")).toEqual({ elegir: "g2" });
        expect(voz(m, "cancela")).toBe("cancelar");
    });
    it("una opción se elige tocándola y un id desconocido no hace nada", () => {
        expect(boton(preguntaDe("invita a la banda"), "g1")).toEqual({ elegir: "g1" });
        expect(boton(preguntaDe("invita a la banda"), "fuera")).toBeNull();
    });
    it("la confirmación por voz: «sí», «vale» o «hazlo» confirman y «cambiar» pide otra ronda", () => {
        expect(voz(confirmacion(), "sí")).toBe("confirmar");
        expect(voz(confirmacion(), "vale, hazlo")).toBe("confirmar");
        expect(voz(confirmacion(), "no")).toBe("cancelar");
        expect(voz(confirmacion(), "cancela")).toBe("cancelar");
        expect(voz(confirmacion(), "cambiar")).toBe("cambiar");
        expect(voz(confirmacion(), "el primero")).toBeNull();
    });
    it("los tres botones responden y un id raro no hace nada", () => {
        const m = confirmacion();
        expect(boton(m, "confirmar")).toBe("confirmar");
        expect(boton(m, "cambiar")).toBe("cambiar");
        expect(boton(m, "cancelar")).toBe("cancelar");
        expect(boton(m, "otra")).toBeNull();
    });
});
