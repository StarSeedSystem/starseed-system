import { describe, expect, it } from "vitest";
import { migrarPrefsChatsGenesis, type Descarte } from "../vinculos";
import { MAX_VINCULOS, type VinculoChat } from "../tipos";

const ISO = "2026-11-13T10:00:00.000Z";

function vinculo(convId: string, extra: Partial<VinculoChat> = {}): VinculoChat {
    return {
        v: 1,
        id: `astraura:${convId}`,
        fuente: { tipo: "astraura", convId },
        nivel: "genesis",
        en: ["chats", "genesis"],
        creado: ISO,
        actualizado: ISO,
        ...extra,
    };
}

/** Todo lo descartado, en texto: para comprobar que el valor original está dentro. */
const texto = (d: unknown[]) => JSON.stringify(d);

describe("migrarPrefsChatsGenesis · pura, nunca null, nada se pierde", () => {
    it("undefined y null → vacías y sin descartes", () => {
        for (const crudo of [undefined, null]) {
            const r = migrarPrefsChatsGenesis(crudo);
            expect(r).not.toBeNull();
            expect(r.prefs).toEqual({ v: 1, vinculos: [], conexiones: {} });
            expect(r.descartado).toEqual([]);
        }
    });

    it("{} → vacías y sin descartes", () => {
        expect(migrarPrefsChatsGenesis({})).toEqual({ prefs: { v: 1, vinculos: [], conexiones: {} }, descartado: [] });
    });

    it("lo que no es un objeto se conserva entero en descartado", () => {
        for (const crudo of ["texto", 42, true, [1, 2]]) {
            const r = migrarPrefsChatsGenesis(crudo);
            expect(r.prefs.vinculos).toEqual([]);
            expect((r.descartado[0] as Descarte).valor).toEqual(crudo);
        }
    });

    it("una versión válida pasa igual y una segunda pasada no cambia nada (idempotente)", () => {
        const crudo = {
            v: 1,
            vinculos: [vinculo("a"), vinculo("b", { nivel: "poligenesis", entidad: "grupo-1", en: ["genesis"], titulo: "Mi grupo" })],
            conexiones: { genesis: { activo: true, memoria: false }, poligenesis: { activo: true, entidades: ["grupo-1"] }, metagenesis: { activo: true } },
        };
        const r = migrarPrefsChatsGenesis(crudo);
        expect(r.descartado).toEqual([]);
        expect(r.prefs).toEqual(crudo);
        expect(migrarPrefsChatsGenesis(JSON.parse(JSON.stringify(r.prefs)))).toEqual({ prefs: r.prefs, descartado: [] });
    });

    it("no muta lo que recibe", () => {
        const crudo = { v: 1, vinculos: [vinculo("a", { titulo: "  con espacios  " })], raro: 1 };
        const copia = JSON.parse(JSON.stringify(crudo));
        migrarPrefsChatsGenesis(crudo);
        expect(crudo).toEqual(copia);
    });
});

describe("migrarPrefsChatsGenesis · versión rota", () => {
    const rota = {
        v: "uno",
        vinculos: [
            vinculo("bueno"),
            "basura",
            { v: 1, fuente: { tipo: "astraura" }, nivel: "genesis", en: ["chats"] },
            vinculo("sin-bandeja", { en: [] }),
            vinculo("poli-sin-entidad", { nivel: "poligenesis" }),
            { ...vinculo("con-extra"), color: "azul", id: "otro-id", en: ["genesis", "genesis", "papelera"] },
            vinculo("titulo-largo", { titulo: "x".repeat(130) }),
            vinculo("repetido", { actualizado: "2026-11-01T00:00:00.000Z", titulo: "viejo" }),
            vinculo("repetido", { actualizado: "2026-11-12T00:00:00.000Z", titulo: "nuevo" }),
            vinculo("fecha-mala", { creado: "nunca" }),
        ],
        conexiones: { genesis: { activo: "si" }, poligenesis: { activo: true, entidades: ["e1", 7, "e1"] }, otra: { activo: true } },
        clave_desconocida: { algo: 1 },
    };
    const r = migrarPrefsChatsGenesis(rota);
    const d = r.descartado as Descarte[];

    it("quedan los vínculos que se entienden, limpios", () => {
        expect(r.prefs.v).toBe(1);
        const ids = r.prefs.vinculos.map((v) => v.id);
        expect(ids).toEqual(["astraura:bueno", "astraura:con-extra", "astraura:titulo-largo", "astraura:repetido", "astraura:fecha-mala"]);
        const extra = r.prefs.vinculos[1];
        expect(extra).not.toHaveProperty("color");
        expect(extra.en).toEqual(["genesis"]);
        expect(r.prefs.vinculos[2].titulo).toHaveLength(120);
        expect(r.prefs.vinculos[3].titulo).toBe("nuevo");
        expect(r.prefs.vinculos[4].creado).toBe(ISO); // toma `actualizado`
        expect(r.prefs.conexiones).toEqual({ poligenesis: { activo: true, entidades: ["e1"] } });
    });

    it("todo lo demás está en descartado, con su valor original", () => {
        const t = texto(d);
        for (const trozo of ['"basura"', '"poli-sin-entidad"', '"sin-bandeja"', '"azul"', '"otro-id"', '"papelera"', "x".repeat(130), '"viejo"', '"nunca"', '"si"', '"conexiones.otra"', '"clave_desconocida"', '"uno"']) {
            expect(t).toContain(trozo);
        }
        expect(d.find((x) => x.campo === "conexiones.poligenesis.entidades")?.valor).toEqual(["e1", 7, "e1"]);
    });

    it("lo descartado se puede guardar como JSON (va a prefs.chatsGenesisDescartado)", () => {
        expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    });
});

describe("migrarPrefsChatsGenesis · versión futura", () => {
    const futura = {
        v: 2,
        vinculos: [vinculo("sigue-v1"), { ...vinculo("ya-v2"), v: 2, bot: { personalidad: "x" } }],
        conexiones: { metagenesis: { activo: false } },
        compartidos: [{ servidor: "s1" }],
    };
    const r = migrarPrefsChatsGenesis(futura);

    it("el original entero va a descartado (una sola entrada) y se rescata lo que lleva su v:1", () => {
        expect(r.descartado).toHaveLength(1);
        expect((r.descartado[0] as Descarte).valor).toEqual(futura);
        expect(r.prefs.vinculos.map((v) => v.id)).toEqual(["astraura:sigue-v1"]);
        expect(r.prefs.conexiones).toEqual({ metagenesis: { activo: false } });
    });
});

describe("migrarPrefsChatsGenesis · límites", () => {
    it("con más de 500 quedan los 500 más recientes y el resto va a descartado", () => {
        const vinculos = Array.from({ length: MAX_VINCULOS + 3 }, (_, i) =>
            vinculo(`c${i}`, { actualizado: new Date(Date.parse(ISO) + i * 1000).toISOString() }),
        );
        const r = migrarPrefsChatsGenesis({ v: 1, vinculos, conexiones: {} });
        expect(r.prefs.vinculos).toHaveLength(MAX_VINCULOS);
        expect(r.prefs.vinculos[0].id).toBe("astraura:c3");
        expect((r.descartado as Descarte[]).map((x) => x.vinculo)).toEqual(["astraura:c0", "astraura:c1", "astraura:c2"]);
    });

    it("un objeto con propiedades que lanzan no rompe nada", () => {
        const trampa = Object.defineProperty({}, "vinculos", { enumerable: true, get: () => { throw new Error("boom"); } });
        const r = migrarPrefsChatsGenesis(trampa);
        expect(r.prefs).toEqual({ v: 1, vinculos: [], conexiones: {} });
        expect(r.descartado).toHaveLength(1);
    });
});
