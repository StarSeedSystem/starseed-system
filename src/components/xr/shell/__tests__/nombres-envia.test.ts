import { describe, expect, it } from "vitest";
import {
    entenderVoz,
    saleDeLaCuenta,
    type ContextoVoz,
    type Intencion,
    type ResultadoVoz,
} from "../../../../lib/xr/intenciones-voz";

/**
 * Rescate de RTXR1010Q. En main ya no hay un `nombres-envia.ts`: los nombres que
 * vería la tarjeta se obtienen de la intención y de `saleDeLaCuenta`. Se prueban
 * los casos de la rama que main aún no cubría, adaptados a esa API.
 */

const CTX: ContextoVoz = {
    grupos: [{ id: "g1", nombre: "Banda", miembros: 6 }],
    contactos: [
        { id: "p1", nombre: "Ana" },
        { id: "p2", nombre: "Álex" },
    ],
    estaciones: [{ id: "e1", nombre: "Cumbre" }],
    servidores: [],
    enfoque: null,
    mundoActual: { id: "m1", nombre: "Ensayo" },
};

type Ok = Extract<ResultadoVoz, { ok: true }>;

const okDe = (frase: string): Ok => {
    const r = entenderVoz(frase, CTX);
    if (!r.ok) throw new Error(`Se esperaba ok y fue fallo ${r.razon}: ${r.pregunta}`);
    return r;
};

const soloIntencion = (frase: string): Intencion => {
    const paso = okDe(frase).pasos[0];
    if (!paso) throw new Error(`«${frase}» no produjo ningún paso`);
    return paso.intencion;
};

const lineas = (frase: string): string[] => okDe(frase).tarjeta?.lineas ?? [];

describe("nombres de «esto se enviará a»", () => {
    it("invitar sale de la cuenta; guardar en la biblioteca no", () => {
        const invitar = soloIntencion("invita al grupo Banda");
        expect(invitar).toMatchObject({ tipo: "invitar", a: [{ nombre: "Banda" }] });
        expect(saleDeLaCuenta(invitar)).toBe(true);

        const biblioteca = soloIntencion("súbelo a la biblioteca");
        expect(biblioteca).toMatchObject({ tipo: "subir", destino: { donde: "biblioteca" } });
        expect(saleDeLaCuenta(biblioteca)).toBe(false);
        expect(okDe("súbelo a la biblioteca").tarjeta).toBeNull();
    });

    it("subir a una estación con nombre sale de la cuenta y la tarjeta lo nombra", () => {
        const intencion = soloIntencion("súbelo a la estación Cumbre");
        expect(intencion).toMatchObject({
            tipo: "subir",
            destino: { donde: "estacion", ref: { nombre: "Cumbre" }, nueva: false },
        });
        expect(saleDeLaCuenta(intencion)).toBe(true);
        expect(lineas("súbelo a la estación Cumbre")).toEqual(["Subir a la estación «Cumbre»"]);
    });

    it("la publicación del grupo lleva su nombre en la tarjeta", () => {
        const intencion = soloIntencion("publícalo para el grupo Banda");
        expect(intencion).toMatchObject({
            tipo: "subir",
            destino: { donde: "publicacion", visibilidad: "grupo", ref: { nombre: "Banda" } },
        });
        expect(saleDeLaCuenta(intencion)).toBe(true);
        expect(lineas("publícalo para el grupo Banda")).toEqual(["Publicar para «Banda»"]);
    });

    it("mensaje con varios destinatarios los lista en la tarjeta", () => {
        const intencion = soloIntencion("mándaselo a Álex y a Ana");
        expect(intencion).toMatchObject({
            tipo: "subir",
            destino: { donde: "mensaje", para: [{ nombre: "Álex" }, { nombre: "Ana" }] },
        });
        expect(lineas("mándaselo a Álex y a Ana")).toEqual(["Mandar por mensaje a «Álex», «Ana»"]);
    });

    it("sin nombres repetidos: invitar dos veces al mismo grupo lo lista una sola vez", () => {
        const intencion = soloIntencion("invita al grupo Banda y al grupo Banda");
        if (intencion.tipo !== "invitar") throw new Error("no es invitar");
        expect(intencion.a).toHaveLength(1);
        expect(intencion.a[0]).toMatchObject({ id: "g1", nombre: "Banda" });
        expect(lineas("invita al grupo Banda y al grupo Banda")).toEqual(["Invitar a «Banda» (6 personas)"]);
    });
});
