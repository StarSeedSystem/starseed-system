import { describe, it, expect } from "vitest";

import {
    CANALES,
    MODELO_DIRECTOR_DEFECTO,
    MOTORES_DIRECTOR,
    canalesQueEsperan,
    motorDe,
    ultimoModeloDirector,
    type CanalId,
    type MensajeDirector,
} from "@/lib/mando/chat-director-tipos";

/** Un MENSAJE del contrato con los campos obligatorios ya puestos. */
function mensaje(parcial: Partial<MensajeDirector>): MensajeDirector {
    return {
        id: "md-1760000000000-ab12",
        t: "2026-10-04T10:00:00-06:00",
        de: "astra",
        rol: "director",
        tipo: "mensaje",
        texto: "Texto de prueba del chat del Director.",
        canal: "mando",
        ...parcial,
    };
}

describe("motorDe", () => {
    it("cada prefijo de motor lleva a su canal", () => {
        expect(motorDe("claude-cowork/claude-opus-5-5")).toBe("claude-cowork");
        expect(motorDe("claude-mac/claude-opus-5-5")).toBe("claude-mac");
        expect(motorDe("hermes/predeterminado")).toBe("hermes");
        expect(motorDe("codex/gpt-5.6-sol")).toBe("chatgpt");
    });

    it("cualquier otro modelo (o un texto vacío) va por la API del Mando", () => {
        expect(motorDe("nim/kimi-k3")).toBe("api");
        expect(motorDe("xkiro/qwen3.8-max")).toBe("api");
        expect(motorDe("")).toBe("api");
    });
});

describe("ultimoModeloDirector", () => {
    it("el modelo guardado manda mientras no esté vacío", () => {
        const respuestas = [mensaje({ tipo: "respuesta", modelo: "hermes/predeterminado" })];
        expect(ultimoModeloDirector(respuestas, "codex/gpt-5.6-sol")).toBe("codex/gpt-5.6-sol");
        expect(ultimoModeloDirector(respuestas, null)).toBe("hermes/predeterminado");
        expect(ultimoModeloDirector(respuestas, "")).toBe("hermes/predeterminado");
    });

    it("sin guardado usa el modelo de la última respuesta del director que lo lleve", () => {
        const mensajes = [
            mensaje({ tipo: "respuesta", rol: "agente", modelo: "nim/kimi-k3" }),
            mensaje({ tipo: "respuesta", modelo: "hermes/predeterminado" }),
            mensaje({ tipo: "respuesta", modelo: undefined }),
            mensaje({ tipo: "aviso", modelo: "codex/gpt-5.6-sol" }),
        ];
        expect(ultimoModeloDirector(mensajes)).toBe("hermes/predeterminado");
    });

    it("sin guardado ni respuestas del director cae en el modelo por defecto", () => {
        expect(ultimoModeloDirector([])).toBe(MODELO_DIRECTOR_DEFECTO);
        expect(ultimoModeloDirector([mensaje({ tipo: "respuesta", rol: "alex" })], "")).toBe(MODELO_DIRECTOR_DEFECTO);
    });
});

describe("CANALES", () => {
    it("son los nueve ids del contrato, únicos y en su orden", () => {
        const ids = CANALES.map((c) => c.id);
        expect(ids).toEqual(["mando", "claude-cowork", "claude-mac", "hermes", "telegram", "chatgpt", "antigravity", "ide", "terminal"]);
        expect(new Set(ids).size).toBe(9);
    });

    it("cada motor tiene canal de verdad y el de defecto es el de Cowork", () => {
        const idsCanales = new Set(CANALES.map((c) => c.id));
        for (const motor of MOTORES_DIRECTOR) {
            expect(idsCanales.has(motor.canal)).toBe(true);
        }
        expect(MODELO_DIRECTOR_DEFECTO).toBe("claude-cowork/claude-opus-5-5");
    });
});

describe("claude-cowork contesta al momento (2026-10-04)", () => {
    it("es «inmediata» y aun así guarda copia en su bandeja", () => {
        expect(CANALES.find((c) => c.id === "claude-cowork")?.respuesta).toBe("inmediata");
        expect(canalesQueEsperan(["claude-cowork"])).toEqual(["claude-cowork"]);
        expect(motorDe("claude-cowork/claude-opus-5-5")).toBe("claude-cowork");
    });
});

describe("canalesQueEsperan", () => {
    it("deja solo los que responden en revisión o por archivo", () => {
        const pedidos: CanalId[] = ["mando", "claude-cowork", "telegram", "terminal"];
        expect(canalesQueEsperan(pedidos)).toEqual(["claude-cowork", "terminal"]);
    });

    it("los que contestan al momento no esperan; repetidos y desconocidos se toleran", () => {
        expect(canalesQueEsperan(["hermes", "chatgpt", "claude-mac"])).toEqual([]);
        expect(canalesQueEsperan(["antigravity", "antigravity", "ide"])).toEqual(["antigravity", "ide"]);
        expect(canalesQueEsperan(["desconocido" as CanalId])).toEqual([]);
        expect(canalesQueEsperan([])).toEqual([]);
    });
});
