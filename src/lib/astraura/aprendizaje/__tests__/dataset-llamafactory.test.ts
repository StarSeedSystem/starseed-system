import { describe, expect, it } from "vitest";

import type { Experiencia } from "../../experiencias";
import type { AjustesAprendizaje } from "../../experiencias-aprendizaje";
import { paraLlamaFactory, permitido } from "../dataset-llamafactory";

const ajustes = (extra: Partial<AjustesAprendizaje> = {}): AjustesAprendizaje => ({
    aprendizajeColectivo: true,
    porAmbito: { salud: { permite: true, privacidad: "ambito" } },
    ...extra,
});

const exp = (extra: Partial<Experiencia> = {}): Experiencia => ({
    id: "e1",
    t: "2026-10-25 12:00:00",
    medio: "os-web",
    capa: "llm",
    tipo: "valoracion",
    dominio: "salud",
    entrada: "¿Qué hago con la fiebre?",
    salida: "Bebe agua y descansa.",
    confianza: null,
    ms: null,
    resultado: null,
    valoracion: "positiva",
    ...extra,
});

const op = { ambito: "salud", destino: "privado" as const, nombre: "salud" };

describe("permitido", () => {
    it("deja pasar siempre el destino privado", () => {
        expect(permitido("privado", "salud", { aprendizajeColectivo: false, porAmbito: {} }).ok).toBe(true);
    });

    it("exige el interruptor, el permiso del ámbito y privacidad no privada", () => {
        expect(permitido("ambito", "salud", ajustes({ aprendizajeColectivo: false })).ok).toBe(false);
        expect(permitido("ambito", "salud", ajustes({ porAmbito: {} })).ok).toBe(false);
        expect(permitido("ambito", "salud", ajustes({ porAmbito: { salud: { permite: true, privacidad: "privada" } } })).ok).toBe(false);
        expect(permitido("ambito", "salud", ajustes()).ok).toBe(true);
    });

    it("solo deja el destino público con privacidad pública", () => {
        expect(permitido("publico", "salud", ajustes()).ok).toBe(false);
        expect(permitido("publico", "salud", ajustes({ porAmbito: { salud: { permite: true, privacidad: "publica" } } })).ok).toBe(true);
    });
});
describe("paraLlamaFactory", () => {
    it("una valoración positiva produce SFT y KTO aprobado", () => {
        const r = paraLlamaFactory([exp()], ajustes(), op);
        expect(r.sft).toHaveLength(1);
        expect(r.sft[0].messages).toEqual([
            { role: "user", content: "¿Qué hago con la fiebre?" },
            { role: "assistant", content: "Bebe agua y descansa." },
        ]);
        expect(r.kto).toHaveLength(1);
        expect(r.kto[0].label).toBe(true);
    });

    it("una valoración negativa solo produce KTO suspenso", () => {
        const r = paraLlamaFactory([exp({ valoracion: "negativa" })], ajustes(), op);
        expect(r.sft).toHaveLength(0);
        expect(r.kto).toHaveLength(1);
        expect(r.kto[0].label).toBe(false);
    });

    it("una corrección produce SFT corregido y KTO suspenso más aprobado", () => {
        const r = paraLlamaFactory(
            [exp({ tipo: "correccion", valoracion: "negativa", correccion: "Ve al médico." })],
            ajustes(),
            op,
        );
        expect(r.sft).toHaveLength(1);
        expect(r.sft[0].messages[1].content).toBe("Ve al médico.");
        expect(r.kto).toHaveLength(2);
        expect(r.kto[0].label).toBe(false);
        expect(r.kto[0].messages[1].content).toBe("Bebe agua y descansa.");
        expect(r.kto[1].label).toBe(true);
        expect(r.kto[1].messages[1].content).toBe("Ve al médico.");
    });
    it("bloquea y no genera filas si la privacidad no lo permite", () => {
        const r = paraLlamaFactory(
            [exp()],
            ajustes({ porAmbito: { salud: { permite: true, privacidad: "privada" } } }),
            { ...op, destino: "publico" },
        );
        expect(r.sft).toHaveLength(0);
        expect(r.kto).toHaveLength(0);
        expect(r.descartadas).toEqual({ bloqueado: 1 });
    });

    it("descarta un texto con pinta de secreto", () => {
        const r = paraLlamaFactory([exp({ salida: "usa sk-abcdefghijklmnop1234" })], ajustes(), op);
        expect(r.sft).toHaveLength(0);
        expect(r.kto).toHaveLength(0);
        expect(r.descartadas.secreto).toBe(1);
    });

    it("descarta duplicados exactos aunque cambie el id", () => {
        const r = paraLlamaFactory([exp(), exp({ id: "e2" })], ajustes(), op);
        expect(r.sft).toHaveLength(1);
        expect(r.descartadas.duplicado).toBe(1);
    });

    it("reparte de forma estable y cuadra partes con las filas SFT", () => {
        const a = paraLlamaFactory([exp({ id: "estable" })], ajustes(), op);
        const b = paraLlamaFactory([exp({ id: "estable" })], ajustes(), op);
        expect(a.sft[0].parte).toBe(b.sft[0].parte);
        const varias = Array.from({ length: 5 }, (_, i) => exp({ id: `e${i}`, entrada: `pregunta ${i}` }));
        const c = paraLlamaFactory(varias, ajustes(), op);
        expect(c.partes.train + c.partes.val + c.partes.test).toBe(c.sft.length);
        expect(c.sft).toHaveLength(5);
    });
    it("describe los dos datasets de LlamaFactory", () => {
        const r = paraLlamaFactory([exp()], ajustes(), op);
        const kto = r.info.salud_kto as { columns: Record<string, string> };
        expect(r.info.salud_sft).toBeDefined();
        expect(kto.columns.kto_tag).toBe("label");
    });
});
