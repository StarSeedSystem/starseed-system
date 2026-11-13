import { describe, expect, it } from "vitest";
import {
    cambiarBandejas,
    chatsEn,
    conMetaGenesisInicial,
    fusionarMetaGenesis,
    idDeVinculo,
    vincular,
    vinculoDe,
} from "../vinculos";
import { prefsVacias, type FuenteChat } from "../tipos";

const T1 = "2026-11-13T10:00:00.000Z";
const T2 = "2026-11-13T11:00:00.000Z";

describe("idDeVinculo · determinista", () => {
    it("da el mismo id para la misma fuente, siempre, y uno distinto para cada fuente", () => {
        const fuentes: FuenteChat[] = [
            { tipo: "astraura", convId: "c-1" },
            { tipo: "direccion" },
            { tipo: "puente", puente: "hermes-avisos" },
            { tipo: "puente", puente: "peticiones" },
            { tipo: "puente", puente: "avisos-directores" },
            { tipo: "telegram-sincronizado", chatId: "-100123" },
        ];
        const ids = fuentes.map(idDeVinculo);
        expect(ids).toEqual(["astraura:c-1", "direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores", "tg:-100123"]);
        expect(fuentes.map((f) => idDeVinculo(JSON.parse(JSON.stringify(f))))).toEqual(ids);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("no depende del orden de los campos ni de campos de más", () => {
        const a = idDeVinculo({ convId: "x", tipo: "astraura" } as FuenteChat);
        const b = idDeVinculo({ tipo: "astraura", convId: "x", sobra: 1 } as unknown as FuenteChat);
        expect(a).toBe(b);
    });
});

describe("vincular · un chat en las dos bandejas", () => {
    const astraura: FuenteChat = { tipo: "astraura", convId: "c-1" };

    it("lo pone en Chats y en Genesis a la vez, sin tocar la entrada", () => {
        const p0 = prefsVacias();
        const p1 = vincular(p0, { fuente: astraura, nivel: "genesis", en: ["genesis", "chats"] }, T1);
        expect(p0.vinculos).toEqual([]);
        expect(p1.vinculos).toEqual([
            { v: 1, id: "astraura:c-1", fuente: astraura, nivel: "genesis", en: ["chats", "genesis"], creado: T1, actualizado: T1 },
        ]);
        expect(chatsEn(p1, "chats").map((v) => v.id)).toEqual(["astraura:c-1"]);
        expect(chatsEn(p1, "genesis", "genesis").map((v) => v.id)).toEqual(["astraura:c-1"]);
        expect(chatsEn(p1, "genesis", "metagenesis")).toEqual([]);
    });

    it("quitar una bandeja lo deja solo en la otra; quitar las dos quita el vínculo", () => {
        const p1 = vincular(prefsVacias(), { fuente: astraura, nivel: "genesis", en: ["chats", "genesis"], titulo: "Mi chat" }, T1);
        const p2 = cambiarBandejas(p1, "astraura:c-1", ["genesis"], T2);
        expect(chatsEn(p2, "chats")).toEqual([]);
        expect(chatsEn(p2, "genesis")[0]).toMatchObject({ en: ["genesis"], creado: T1, actualizado: T2, titulo: "Mi chat" });
        expect(cambiarBandejas(p2, "astraura:c-1", [], T2).vinculos).toEqual([]);
        expect(cambiarBandejas(p2, "no-existe", ["chats"], T2)).toBe(p2);
    });

    it("volver a vincular conserva creado y título, y no duplica", () => {
        const p1 = vincular(prefsVacias(), { fuente: astraura, nivel: "genesis", en: ["chats"], titulo: "Uno" }, T1);
        const p2 = vincular(p1, { fuente: { tipo: "astraura", convId: "c-1" }, nivel: "poligenesis", entidad: "g-1", en: ["genesis"] }, T2);
        expect(p2.vinculos).toHaveLength(1);
        expect(p2.vinculos[0]).toMatchObject({ nivel: "poligenesis", entidad: "g-1", titulo: "Uno", creado: T1, actualizado: T2 });
        expect(chatsEn(p2, "genesis", "poligenesis", "g-1")).toHaveLength(1);
        expect(chatsEn(p2, "genesis", "poligenesis", "g-2")).toHaveLength(0);
        expect(vinculoDe(p2, astraura)?.id).toBe("astraura:c-1");
    });

    it("rechaza lo que no tiene sentido", () => {
        expect(() => vincular(prefsVacias(), { fuente: { tipo: "astraura", convId: "" }, nivel: "genesis", en: ["chats"] }, T1)).toThrow(TypeError);
        expect(() => vincular(prefsVacias(), { fuente: astraura, nivel: "poligenesis", en: ["chats"] }, T1)).toThrow(TypeError);
        expect(vincular(prefsVacias(), { fuente: astraura, nivel: "genesis", en: [] }, T1).vinculos).toEqual([]);
    });

    it("no pasa de 500 vínculos", () => {
        let p = prefsVacias();
        for (let i = 0; i < 500; i++) p = vincular(p, { fuente: { tipo: "astraura", convId: `c${i}` }, nivel: "genesis", en: ["chats"] }, T1);
        expect(() => vincular(p, { fuente: { tipo: "direccion" }, nivel: "metagenesis", en: ["chats"] }, T1)).toThrow(RangeError);
        // Rehacer uno que ya existe sí se puede.
        expect(vincular(p, { fuente: { tipo: "astraura", convId: "c0" }, nivel: "genesis", en: ["genesis"] }, T2).vinculos).toHaveLength(500);
    });
});

describe("conexiones y meta.genesis", () => {
    it("la primera vez de un miembro activa MetaGenesis; después no cambia lo que decidió", () => {
        expect(conMetaGenesisInicial(prefsVacias()).conexiones.metagenesis).toEqual({ activo: true });
        const apagada = { ...prefsVacias(), conexiones: { metagenesis: { activo: false } } };
        expect(conMetaGenesisInicial(apagada)).toBe(apagada);
    });

    it("fusionarMetaGenesis conserva todas las demás claves de meta", () => {
        const meta = { config: { pinned: true }, voiceNotes: { h: { url: "x" } } };
        const fuera = fusionarMetaGenesis(meta, { nivel: "metagenesis", en: ["chats", "genesis"] });
        expect(fuera).toEqual({ ...meta, genesis: { nivel: "metagenesis", en: ["chats", "genesis"] } });
        expect(meta).not.toHaveProperty("genesis");
        expect(fusionarMetaGenesis({ ...meta, genesis: { nivel: "genesis", en: ["genesis"] } }, null)).toEqual(meta);
        expect(fusionarMetaGenesis(null, { nivel: "genesis", en: ["genesis"] })).toEqual({ genesis: { nivel: "genesis", en: ["genesis"] } });
        expect(fusionarMetaGenesis("no-objeto", { nivel: "genesis", en: ["genesis"] })).toBeNull();
    });
});
