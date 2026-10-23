import { describe, it, expect } from "vitest";
import {
  asegurarProyecto,
  tareaDesdeDecision,
  tituloProyecto,
  type Pedir,
  type Entidad,
  type Decision,
} from "../vikunja";

const TOKEN = "tk-secreto";
const BASE = "https://vk.example.com";
const grupo: Entidad = { tipo: "grupo", id: "g7", nombre: "Huerta" };
const decision: Decision = { propuestaId: "prop-1", titulo: "Comprar semillas", aprobadaEn: "2026-10-20", sector: "huerta" };

function falso(...resp: Array<{ status: number; cuerpo?: unknown }>) {
  const llamadas: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const pedir: Pedir = async (url, init) => {
    llamadas.push({ url, ...init });
    const r = resp[Math.min(llamadas.length - 1, resp.length - 1)];
    return { ok: r.status < 300, status: r.status, text: async () => (r.cuerpo === undefined ? "" : JSON.stringify(r.cuerpo)) };
  };
  return { pedir, llamadas };
}

describe("vikunja · cliente puro", () => {
  it("el título lleva tipo, nombre e id", () => {
    expect(tituloProyecto(grupo)).toBe("grupo · Huerta · g7");
  });

  it("crea el proyecto una vez y reutiliza el existente", async () => {
    const t = "grupo · Huerta · g7";
    const a = falso({ status: 200, cuerpo: [] }, { status: 201, cuerpo: { id: 5, title: t } });
    const r1 = await asegurarProyecto(BASE, TOKEN, grupo, a.pedir);
    expect(r1).toEqual({ ok: true, proyecto: { id: 5, titulo: t }, creado: true });
    expect(a.llamadas[1].method).toBe("PUT");
    expect(a.llamadas[1].url).toBe(`${BASE}/api/v1/projects`);
    expect(a.llamadas[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(a.llamadas[0].url).not.toContain(TOKEN);

    const b = falso({ status: 200, cuerpo: [{ id: 9, title: "otro" }, { id: 5, title: t }] });
    const r2 = await asegurarProyecto(BASE, TOKEN, grupo, b.pedir);
    expect(r2).toEqual({ ok: true, proyecto: { id: 5, titulo: t }, creado: false });
    expect(b.llamadas).toHaveLength(1);
  });

  it("401 da un motivo claro sin filtrar el token", async () => {
    const { pedir } = falso({ status: 401, cuerpo: `malo ${TOKEN}` });
    const r = await asegurarProyecto(BASE, TOKEN, grupo, pedir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("token");
      expect(r.motivo).not.toContain(TOKEN);
    }
  });

  it("un fallo de red o de servidor no lanza excepción", async () => {
    const caido: Pedir = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await asegurarProyecto(BASE, TOKEN, grupo, caido);
    expect(r).toEqual({ ok: false, motivo: "No se pudo conectar con Vikunja." });
    const s = await tareaDesdeDecision(BASE, TOKEN, 5, decision, falso({ status: 500 }).pedir);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.motivo).toContain("HTTP 500");
  });

  it("la tarea enlaza la propuesta aprobada", async () => {
    const { pedir, llamadas } = falso({ status: 201, cuerpo: { id: 12, title: "Comprar semillas" } });
    const r = await tareaDesdeDecision(BASE, TOKEN, 5, decision, pedir);
    expect(r).toEqual({ ok: true, tarea: { id: 12, titulo: "Comprar semillas" } });
    expect(llamadas[0].method).toBe("PUT");
    expect(llamadas[0].url).toBe(`${BASE}/api/v1/projects/5/tasks`);
    const cuerpo = JSON.parse(llamadas[0].body ?? "{}");
    expect(cuerpo.description).toContain("prop-1");
    expect(cuerpo.description).toContain("ya aprobado");
  });

  it("respuesta sin id da motivo legible", async () => {
    const r = await tareaDesdeDecision(BASE, TOKEN, 5, decision, falso({ status: 201, cuerpo: {} }).pedir);
    expect(r.ok).toBe(false);
  });
});
