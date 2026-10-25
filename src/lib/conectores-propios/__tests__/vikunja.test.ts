import { describe, it, expect } from "vitest";
import {
  asegurarProyecto,
  tareaDesdeDecision,
  tituloProyecto,
  type Entidad,
  type Pedir,
} from "../vikunja";

const TOKEN = "tk-secreto";
const BASE = "https://v.example.com/api/v1/";
const grupo: Entidad = { tipo: "grupo", id: "g7", nombre: "Alfa" };
const TITULO = "grupo · Alfa · g7";

function falso(status = 200, cuerpo: unknown = []) {
  const llamadas: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const pedir: Pedir = async (url, init) => {
    llamadas.push({ url, ...init });
    const r = typeof cuerpo === "function" ? (cuerpo as (n: number) => unknown)(llamadas.length) : cuerpo;
    return { ok: status < 400, status, text: async () => JSON.stringify(r) };
  };
  return { pedir, llamadas };
}

describe("vikunja · cliente puro", () => {
  it("el título lleva tipo, nombre e id", () => {
    expect(tituloProyecto(grupo)).toBe(TITULO);
  });

  it("crea una vez y reutiliza después", async () => {
    const existentes: unknown[] = [];
    const llamadas: string[] = [];
    const pedir: Pedir = async (url, init) => {
      llamadas.push(init.method);
      if (init.method === "PUT") {
        existentes.push({ id: 5, title: JSON.parse(init.body ?? "{}").title });
        return { ok: true, status: 201, text: async () => JSON.stringify(existentes[0]) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(existentes) };
    };
    const a = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    const b = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(a).toEqual({ ok: true, proyecto: { id: "5", titulo: TITULO }, creado: true });
    expect(b).toEqual({ ok: true, proyecto: { id: "5", titulo: TITULO }, creado: false });
    expect(llamadas.filter((m) => m === "PUT")).toHaveLength(1);
  });

  it("ignora coincidencias parciales y manda el token solo en la cabecera", async () => {
    const { pedir, llamadas } = falso(200, (n: number) => (n === 1 ? [{ id: 1, title: `${TITULO} bis` }] : { id: 9 }));
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r.ok && r.proyecto.id).toBe("9");
    expect(llamadas[0].url).toContain("https://v.example.com/api/v1/projects?s=");
    expect(llamadas[0].url).not.toContain(TOKEN);
    expect(llamadas[1].method).toBe("PUT");
    expect(JSON.parse(llamadas[1].body ?? "{}").title).toBe(TITULO);
    expect(llamadas[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("401 da un motivo claro sin excepción ni token", async () => {
    const { pedir } = falso(401, { message: TOKEN });
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("rechazó el token");
      expect(r.motivo).not.toContain(TOKEN);
    }
  });

  it("un fallo de red no lanza", async () => {
    const pedir: Pedir = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("No se pudo hablar") });
  });

  it("crea la tarea enlazando la propuesta aprobada", async () => {
    const { pedir, llamadas } = falso(201, { id: 11 });
    const r = await tareaDesdeDecision(BASE, TOKEN, "5", {
      propuestaId: "p-1",
      titulo: "Abrir huerto",
      aprobadaEn: "2026-10-20",
      sector: "recursos",
    }, pedir);
    expect(r).toEqual({ ok: true, tarea: { id: "11", titulo: "Abrir huerto" } });
    expect(llamadas[0].method).toBe("PUT");
    expect(llamadas[0].url).toBe("https://v.example.com/api/v1/projects/5/tasks");
    const cuerpo = JSON.parse(llamadas[0].body ?? "{}");
    expect(cuerpo.title).toBe("Abrir huerto");
    expect(cuerpo.description).toContain("p-1");
    expect(cuerpo.description).toContain("recursos");
  });

  it("409 al crear el proyecto se devuelve como fallo con motivo HTTP", async () => {
    const metodos: string[] = [];
    const pedir: Pedir = async (_url, init) => {
      metodos.push(init.method);
      if (init.method === "PUT") return { ok: false, status: 409, text: async () => "" };
      return { ok: true, status: 200, text: async () => "[]" };
    };
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(metodos).toEqual(["GET", "PUT"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("409");
      expect(r.motivo).not.toContain(TOKEN);
    }
  });

  it("404 y 500 al crear tarea dan motivo legible", async () => {
    const d = { propuestaId: "p", titulo: "t", aprobadaEn: "2026-10-20" };
    const r404 = await tareaDesdeDecision(BASE, TOKEN, "5", d, falso(404, {}).pedir);
    const r500 = await tareaDesdeDecision(BASE, TOKEN, "5", d, falso(500, {}).pedir);
    expect(!r404.ok && r404.motivo).toContain("404");
    expect(!r500.ok && r500.motivo).toContain("falló");
  });

  it("un 409 al crear el proyecto no finge éxito y no reintenta", async () => {
    const metodos: string[] = [];
    const pedir: Pedir = async (_url, init) => {
      metodos.push(init.method);
      const status = init.method === "PUT" ? 409 : 200;
      return { ok: status < 400, status, text: async () => "[]" };
    };
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("409");
    expect("proyecto" in r).toBe(false);
    expect(metodos.filter((m) => m === "PUT")).toHaveLength(1);
  });

  it("un 500 al buscar el proyecto corta sin crear nada", async () => {
    const metodos: string[] = [];
    const pedir: Pedir = async (_url, init) => {
      metodos.push(init.method);
      return { ok: false, status: 500, text: async () => "" };
    };
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("falló");
    expect("proyecto" in r).toBe(false);
    expect(metodos).toEqual(["GET"]);
  });
});
