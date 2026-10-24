import { describe, expect, it } from "vitest";

import { agentesDeCloudroom, filasCloudroom, paradoDe, tareaEnCloudroom, DONDE_CLOUDROOM, VISTO_VIGENTE_MS } from "../agentes-cloudroom";

const AHORA = Date.UTC(2026, 9, 24, 20, 0, 0);
const s = (minutosAntes: number) => (AHORA - minutosAntes * 60_000) / 1000; // el lanzador escribe segundos

describe("agentes de Cloudroom (hilos de la nube vivos)", () => {
    const progreso = {
        A: { estado: "reasignada", medio: "cloudroom" },
        B: { estado: "reasignada", medio: "cloudroom" },
        C: { estado: "commit", medio: "cloudroom" },
        D: { estado: "reasignada", medio: "nube" },
    };

    it("pinta un agente por tarea viva, con harness/modelo, minutos e hilo", () => {
        const registro = [
            { tarea: "A", hilo: "thr_a", t: s(30), harness: "pi", modelo: "nvidia/z-ai/glm-5.3", rama_pedida: "nube/cr-20261024/ola/A" },
            { tarea: "B", hilo: "thr_b", t: s(5), harness: "codex", modelo: "gpt-6-luna" },
        ];
        const ag = agentesDeCloudroom(registro, progreso, AHORA);
        expect(ag.map((a) => a.tarea)).toEqual(["A", "B"]);
        expect(ag[0]).toMatchObject({ donde: DONDE_CLOUDROOM, fase: "escribiendo", modelo: "pi/nvidia/z-ai/glm-5.3", minutos: 30, hilo: "thr_a", rama: "nube/cr-20261024/ola/A" });
        expect(ag[1].modelo).toBe("codex/gpt-6-luna");
    });

    it("no pinta hilos cerrados, tareas ya integradas ni tareas de otro medio", () => {
        const registro = [
            { tarea: "A", hilo: "thr_a", t: s(10), final: "traida" },
            { tarea: "C", hilo: "thr_c", t: s(10) },
            { tarea: "D", hilo: "thr_d", t: s(10) },
            { tarea: "Z", hilo: "thr_z", t: s(10) },
        ];
        expect(agentesDeCloudroom(registro, progreso, AHORA)).toEqual([]);
    });

    it("un relanzamiento cuenta una sola vez: el hilo más reciente", () => {
        const registro = [
            { tarea: "A", hilo: "viejo", t: s(120), harness: "codex", modelo: "gpt-6-luna" },
            { tarea: "A", hilo: "nuevo", t: s(3), harness: "pi", modelo: "nvidia/z-ai/glm-5.3" },
        ];
        const ag = agentesDeCloudroom(registro, progreso, AHORA);
        expect(ag).toHaveLength(1);
        expect(ag[0]).toMatchObject({ hilo: "nuevo", minutos: 3 });
    });

    it("lee el formato del piloto ({hilos}) y tolera basura", () => {
        expect(filasCloudroom({ hilos: [{ tarea: "A" }, null, 3] })).toEqual([{ tarea: "A" }]);
        expect(filasCloudroom(null)).toEqual([]);
        expect(agentesDeCloudroom("x", progreso, AHORA)).toEqual([]);
        expect(tareaEnCloudroom(undefined)).toBe(false);
    });

    it("CRM1024K: un hilo que seguir vio parado no se pinta escribiendo (y dice por qué)", () => {
        const registro = [
            { tarea: "A", hilo: "thr_a", t: s(40), harness: "pi", modelo: "nvidia/z-ai/glm-5.3", visto: { estado: "terminado", t: s(2), corte: "cupo" }, reanudaciones: 1 },
            { tarea: "B", hilo: "thr_b", t: s(40), harness: "pi", modelo: "nvidia/x", visto: { estado: "trabajando", t: s(2), corte: "" } },
        ];
        const [a, b] = agentesDeCloudroom(registro, progreso, AHORA);
        expect(a).toMatchObject({ fase: "parado", parado: "cupo", reanudaciones: 1 });
        expect(b.fase).toBe("escribiendo");
        expect(b.parado).toBeUndefined();
    });

    it("CRM1024K: paradoDe solo cree un «visto» reciente", () => {
        expect(paradoDe({ estado: "terminado", t: s(1), corte: "modelo" }, AHORA)).toBe("modelo");
        expect(paradoDe({ estado: "terminado", t: s(1), corte: "" }, AHORA)).toBe("terminado");
        expect(paradoDe({ estado: "terminado", t: (AHORA - VISTO_VIGENTE_MS - 60_000) / 1000, corte: "cupo" }, AHORA)).toBe("");
        expect(paradoDe({ estado: "trabajando", t: s(1) }, AHORA)).toBe("");
        expect(paradoDe(null, AHORA)).toBe("");
    });
});
