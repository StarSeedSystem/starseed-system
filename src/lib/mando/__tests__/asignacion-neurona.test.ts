import { describe, it, expect } from "vitest";
import {
    elegirNeurona,
    reparto,
    type NeuronaOpcion,
} from "@/lib/mando/asignacion-neurona";

const mac: NeuronaOpcion = { id: "mac", tipo: "esta máquina", responde: true, motores: ["claude", "ollama"], carga: 0 };
const ollama: NeuronaOpcion = { id: "motor-local", tipo: "motor local", responde: true, motores: ["ollama"], carga: 0 };
const nube: NeuronaOpcion = { id: "nube", tipo: "nube", responde: true, motores: [], carga: 0 };

describe("elegirNeurona", () => {
    it("respeta la preferencia de Alex si la neurona responde y tiene el motor", () => {
        const r = elegirNeurona({ id: "t1", motor: "ollama" }, [mac, ollama], "motor-local");
        expect(r).toMatchObject({ neurona: "motor-local", forzada: true });
    });

    it("cae a otra neurona si la preferida no responde, diciéndolo en el motivo", () => {
        const caida = { ...nube, responde: false };
        const r = elegirNeurona({ id: "t1", motor: "ollama" }, [mac, caida], "nube");
        expect(r.neurona).toBe("mac");
        expect(r.forzada).toBe(false);
        expect(r.motivo).toContain("no responde o le falta el motor");
    });

    it("cae a otra si la preferida no existe", () => {
        const r = elegirNeurona({ id: "t1", motor: "ollama" }, [mac], "fantasma");
        expect(r.neurona).toBe("mac");
        expect(r.motivo).toContain("no existe");
    });

    it("elige la de menor carga y, en empate, la más cercana", () => {
        const ocupada = { ...mac, carga: 3 };
        const r = elegirNeurona({ id: "t1", motor: "" }, [ocupada, nube]);
        expect(r.neurona).toBe("nube");
        const empate = elegirNeurona({ id: "t2", motor: "" }, [nube, mac]);
        expect(empate.neurona).toBe("mac");
    });

    it("exige el motor pedido", () => {
        const r = elegirNeurona({ id: "t1", motor: "claude" }, [ollama, nube]);
        expect(r.neurona).toBe("nube");
    });

    it("sin candidatas vivas, no asigna y lo dice", () => {
        const r = elegirNeurona({ id: "t1", motor: "gpt" }, [mac, ollama]);
        expect(r.neurona).toBe("");
        expect(r.motivo).toContain("ninguna neurona responde");
    });
});

describe("reparto", () => {
    it("reparte la tanda sin amontonar todo en la primera", () => {
        const tareas = [
            { id: "a", motor: "" }, { id: "b", motor: "" },
            { id: "c", motor: "" }, { id: "d", motor: "" },
        ];
        const rs = reparto(tareas, [mac, nube]);
        expect(rs.map((r) => r.neurona)).toEqual(["mac", "nube", "mac", "nube"]);
    });

    it("no mete nada en neuronas muertas", () => {
        const rs = reparto(
            [{ id: "a", motor: "" }, { id: "b", motor: "" }],
            [{ ...mac, responde: false }, nube],
        );
        expect(rs.every((r) => r.neurona === "nube")).toBe(true);
    });
});
