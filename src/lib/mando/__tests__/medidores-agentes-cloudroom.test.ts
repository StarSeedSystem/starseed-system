/**
 * (CRM1024K) El medidor «Agentes» con los hilos de la nube de Cloudroom.
 *
 * Alex (2026-10-24): «ningún agente de MetaGenesis dice ser de los de Cloudroom». Ahora salen, y con la
 * verdad: 14 hilos de Pi parados por un 429 de NIM salían «escribiendo»; un hilo parado dice por qué.
 */
import { describe, expect, it } from "vitest";

import { agentesDeCloudroom } from "../agentes-cloudroom";
import { detalleDeMedidor } from "../medidores";

const AHORA = Date.now();
const s = (minutosAntes: number) => (AHORA - minutosAntes * 60_000) / 1000;
const progreso = { A: { estado: "reasignada", medio: "cloudroom" }, B: { estado: "reasignada", medio: "cloudroom" }, C: { estado: "reasignada", medio: "cloudroom" } };

describe("agentes de Cloudroom en el medidor", () => {
    const registro = [
        { tarea: "A", hilo: "thr_a", t: s(30), harness: "pi", modelo: "nvidia/z-ai/glm-5.3", visto: { estado: "terminado", t: s(1), corte: "cupo" } },
        { tarea: "B", hilo: "thr_b", t: s(30), harness: "pi", modelo: "xkiro/qwen/qwen3-coder-plus:free", visto: { estado: "trabajando", t: s(1) }, reanudaciones: 1 },
        { tarea: "C", hilo: "thr_c", t: s(30), harness: "codex", modelo: "gpt-6-luna", visto: { estado: "terminado", t: s(1), corte: "" } },
    ];

    it("cada hilo dice su estado real y que es de Cloudroom", () => {
        const d = detalleDeMedidor("agentes", { latidos: agentesDeCloudroom(registro, progreso, AHORA), escritores: {}, progreso });
        const porTarea = Object.fromEntries(d.filas.map((f) => [String(f.id).split(" · ")[0], f]));
        expect(porTarea.A.estado).toBe("esperando modelo");
        expect(porTarea.A.porque).toContain("su proveedor cortó por cupo (429)");
        expect(porTarea.A.porque).toContain("MISMO hilo");
        expect(porTarea.B.estado).toBe("escribiendo");
        expect(porTarea.B.porque).toContain("reanudado 1 vez");
        expect(porTarea.C.estado).toBe("sin escribir");
        expect(porTarea.C.porque).toContain("el hilo terminó");
        expect(JSON.stringify(d.filas)).toContain("Cloudroom");
        expect(JSON.stringify(d.filas)).not.toContain("undefined");
    });
});
