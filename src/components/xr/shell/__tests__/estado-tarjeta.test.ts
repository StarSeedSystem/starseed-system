import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz, type ResultadoVoz } from "../../../../lib/xr/intenciones-voz";

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
