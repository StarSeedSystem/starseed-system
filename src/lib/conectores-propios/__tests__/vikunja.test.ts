import { describe, it, expect } from "vitest";
import { asegurarProyecto, tareaDesdeDecision, tituloDeProyecto, type Pedir, type RespuestaHttp, type Entidad, type Decision } from "../vikunja";

const TOKEN = "tk-secreto";
const BASE = "https://v.example.com/api/v1/";
const res = (cuerpo: unknown, status = 200): RespuestaHttp => ({ ok: status < 400, status, text: async () => JSON.stringify(cuerpo) });

function falso(...respuestas: RespuestaHttp[]) {
  const llamadas: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const pedir: Pedir = async (url, init) => {
    llamadas.push({ url, ...init });
    return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
  };
  return { pedir, llamadas };
}

const grupo: Entidad = { tipo: "grupo", id: "g7", nombre: "Huerta" };
const decision: Decision = { propuestaId: "prop-1", titulo: "Montar compostera", aprobadaEn: "2026-10-20", sector: "oikos" };

describe("vikunja · proyectos", () => {
  it("el título lleva tipo, nombre e id", () => {
    expect(tituloDeProyecto(grupo)).toBe("grupo · Huerta · g7");
  });

  it("crea una vez (PUT) y reutiliza al encontrarlo", async () => {
    const titulo = tituloDeProyecto(grupo);
    const a = falso(res([]), res({ id: 5, title: titulo }, 201));
    const r1 = await asegurarProyecto(a.pedir, BASE, TOKEN, grupo);
    expect(r1).toEqual({ ok: true, proyecto: { id: "5", titulo } });
    expect(a.llamadas[1].method).toBe("PUT");
    expect(a.llamadas[1].url).toBe("https://v.example.com/api/v1/projects");
    expect(JSON.parse(a.llamadas[1].body ?? "{}")).toEqual({ title: titulo });
    const b = falso(res([{ id: 9, title: "otro" }, { id: 5, title: titulo }]));
    const r2 = await asegurarProyecto(b.pedir, BASE, TOKEN, grupo);
    expect(r2).toEqual({ ok: true, proyecto: { id: "5", titulo } });
    expect(b.llamadas).toHaveLength(1);
  });

  it("401 da un motivo claro y el token no sale en la URL ni en el motivo", async () => {
    const f = falso(res({}, 401));
    const r = await asegurarProyecto(f.pedir, BASE, TOKEN, grupo);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("rechazó el token");
      expect(r.motivo).not.toContain(TOKEN);
    }
    expect(f.llamadas[0].url).not.toContain(TOKEN);
    expect(f.llamadas[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("una excepción de red se vuelve motivo, no se propaga", async () => {
    const pedir: Pedir = async () => {
      throw new Error("boom");
    };
    const r = await asegurarProyecto(pedir, BASE, TOKEN, grupo);
    expect(r.ok).toBe(false);
  });

  it("falla con motivo si la creación no devuelve id", async () => {
    const r = await asegurarProyecto(falso(res([]), res({})).pedir, BASE, TOKEN, grupo);
    expect(r.ok).toBe(false);
  });
});

describe("vikunja · tareas desde lo aprobado", () => {
  it("crea la tarea (PUT) enlazando la propuesta", async () => {
    const f = falso(res({ id: 11, title: decision.titulo }, 201));
    const r = await tareaDesdeDecision(f.pedir, BASE, TOKEN, "5", decision);
    expect(r).toEqual({ ok: true, tarea: { id: "11", titulo: "Montar compostera" } });
    expect(f.llamadas[0].method).toBe("PUT");
    expect(f.llamadas[0].url).toBe("https://v.example.com/api/v1/projects/5/tasks");
    const cuerpo = JSON.parse(f.llamadas[0].body ?? "{}") as { description: string };
    expect(cuerpo.description).toContain("prop-1");
    expect(cuerpo.description).toContain("oikos");
  });

  it("404 y 500 dan motivos legibles", async () => {
    const r404 = await tareaDesdeDecision(falso(res({}, 404)).pedir, BASE, TOKEN, "5", decision);
    const r500 = await tareaDesdeDecision(falso(res({}, 500)).pedir, BASE, TOKEN, "5", decision);
    expect(!r404.ok && r404.motivo).toContain("404");
    expect(!r500.ok && r500.motivo).toContain("falló");
  });
});
