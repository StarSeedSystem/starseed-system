import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";
import {
    medidasTarjeta,
    modeloTarjeta,
    resolverRespuesta,
    type ModeloTarjeta,
} from "../estado-tarjeta";

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

/** Contexto AMBIGUO: «Banda vieja» responde también al nombre «banda» (dos exactos → nunca se adivina). */
const CTX_AMB: ContextoVoz = {
    ...CTX,
    grupos: [...CTX.grupos.slice(0, 1), { id: "g2", nombre: "Banda vieja", miembros: 3, alias: ["banda"] }],
};

type Ok = Extract<ResultadoVoz, { ok: true }>;
type Fallo = Extract<ResultadoVoz, { ok: false }>;

const okDe = (frase: string): Ok => {
    const r = entenderVoz(frase, CTX);
    if (!r.ok) throw new Error(`Se esperaba ok y fue fallo ${r.razon}: ${r.pregunta}`);
    return r;
};
const okDeAmb = (frase: string): Ok => {
    const r = entenderVoz(frase, CTX_AMB);
    if (!r.ok) throw new Error(`Se esperaba ok y fue fallo ${r.razon}: ${r.pregunta}`);
    return r;
};
const falloDe = (frase: string): Fallo => {
    const r = entenderVoz(frase, CTX);
    if (r.ok) throw new Error("Se esperaba fallo y fue ok");
    return r;
};
const falloDeAmb = (frase: string): Fallo => {
    const r = entenderVoz(frase, CTX_AMB);
    if (r.ok) throw new Error("Se esperaba fallo y fue ok");
    return r;
};
const voz = (m: ModeloTarjeta | null, frase: string) => resolverRespuesta(m, { tipo: "voz", frase });
const boton = (m: ModeloTarjeta | null, id: string) => resolverRespuesta(m, { tipo: "boton", id });

describe("el estado de la tarjeta de confirmación (XR1010Q)", () => {
    it("«crea un mundo… e invita al grupo Banda» da la tarjeta de confirmación con sus líneas", () => {
        const ok = okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda");
        expect(ok.confirmar).toBe(true);
        const m = modeloTarjeta(ok);
        expect(m?.tipo).toBe("confirmar");
        if (m?.tipo !== "confirmar") throw new Error("no es confirmar");
        expect(m.titulo).toBe("Esto saldrá de tu cuenta. ¿Lo hago?");
        expect(m.acciones).toEqual(["confirmar", "cambiar", "cancelar"]);
        expect(m.lineas).toHaveLength(3);
        expect(m.lineas[0]).toContain("Crear un mundo");
        expect(m.lineas[0]).toContain("cielo de noche");
        expect(m.lineas[1]).toBe("Poner gravedad «cero»");
        expect(m.lineas[2]).toContain("Invitar a «Banda» (6 personas)");
    });

    it("`modeloTarjeta(null)` y `undefined` dan null; sin algo que confirmar también", () => {
        expect(modeloTarjeta(null)).toBeNull();
        expect(modeloTarjeta(undefined)).toBeNull();
        const biblioteca = okDe("súbelo a la biblioteca");
        expect(biblioteca.confirmar).toBe(false);
        expect(modeloTarjeta(biblioteca)).toBeNull();
    });

    it("dos candidatos crean una pregunta con una opción por candidato y sus miembros", () => {
        const f = falloDeAmb("invita a la banda");
        expect(f.razon).toBe("ambiguo");
        const m = modeloTarjeta(f);
        expect(m?.tipo).toBe("preguntar");
        if (m?.tipo !== "preguntar") throw new Error("no es preguntar");
        expect(m.pregunta).toContain("¿Cuál?");
        expect(m.opciones).toEqual([
            { id: "g1", etiqueta: "Banda (6 personas)" },
            { id: "g2", etiqueta: "Banda vieja (3 personas)" },
        ]);
    });

    it("un «sí» ambiguo con varias opciones NO confirma", () => {
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        expect(voz(m, "sí")).toBeNull();
        expect(voz(m, "vale")).toBeNull();
        expect(boton(m, "confirmar")).toBeNull();
    });

    it("«el segundo» elige el segundo candidato", () => {
        const m = modeloTarjeta(falloDeAmb("invita a la banda"));
        expect(voz(m, "el segundo")).toEqual({ elegir: "g2" });
        expect(voz(m, "banda vieja")).toEqual({ elegir: "g2" });
    });

    it("«cancela» cancela, en la pregunta y en la confirmación", () => {
        const q = modeloTarjeta(falloDeAmb("invita a la banda"));
        const c = modeloTarjeta(okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        expect(voz(q, "cancela")).toBe("cancelar");
        expect(voz(c, "cancela")).toBe("cancelar");
        expect(voz(c, "no")).toBe("cancelar");
    });

    it("la confirmación se dice «confirmar», «sí», «vale» o «hazlo»; «cambiar» cambia; nada más", () => {
        const c = modeloTarjeta(okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        expect(voz(c, "confirmar")).toBe("confirmar");
        expect(voz(c, "sí")).toBe("confirmar");
        expect(voz(c, "vale")).toBe("confirmar");
        expect(voz(c, "hazlo")).toBe("confirmar");
        expect(voz(c, "cambiar")).toBe("cambiar");
        expect(voz(c, "banana")).toBeNull();
    });

    it("«¿cuál?» y «sin contexto»: la pregunta del fallo, tal cual", () => {
        const f = falloDe("invita a este grupo");
        expect(f.razon).toBe("falta-dato");
        const m = modeloTarjeta(f);
        expect(m?.tipo).toBe("preguntar");
        if (m?.tipo !== "preguntar") throw new Error("no es preguntar");
        expect(m.pregunta).toBe(f.pregunta);
        expect(m.opciones).toEqual([]);
    });

    it("frase que no se entendió: estado de error con el mensaje del fallo", () => {
        const f = falloDe("grrr invisible mundo");
        const m = modeloTarjeta(f);
        expect(m?.tipo).toBe("error");
        if (m?.tipo !== "error") throw new Error("no es error");
        expect(m.mensaje).toBe(f.pregunta);
        expect(resolverRespuesta(m, { tipo: "voz", frase: "hazlo" })).toBeNull();
        expect(resolverRespuesta(m, { tipo: "boton", id: "confirmar" })).toBeNull();
    });

    it("los botones resuelven su acción; un id ajeno no hace nada", () => {
        const c = modeloTarjeta(okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        expect(boton(c, "confirmar")).toBe("confirmar");
        expect(boton(c, "cambiar")).toBe("cambiar");
        expect(boton(c, "cancelar")).toBe("cancelar");
        expect(boton(c, "otra-cosa")).toBeNull();
        const q = modeloTarjeta(falloDeAmb("invita a la banda"));
        expect(boton(q, "g1")).toEqual({ elegir: "g1" });
        expect(boton(q, "cancelar")).toBe("cancelar");
    });

    it("las medidas del panel nunca son cero con modelo y crecen con lo que se envía", () => {
        const c = modeloTarjeta(okDe("crea un mundo con cielo de noche, pon gravedad cero e invita al grupo Banda"));
        const solo = medidasTarjeta(c);
        expect(solo.ancho).toBeGreaterThan(0);
        expect(solo.alto).toBeGreaterThan(0);
        const conEnvio = medidasTarjeta(c, ["Banda (6 personas)"]);
        expect(conEnvio.alto).toBeGreaterThan(solo.alto);
        expect(medidasTarjeta(null)).toEqual({ ancho: 0, alto: 0 });
    });
});
