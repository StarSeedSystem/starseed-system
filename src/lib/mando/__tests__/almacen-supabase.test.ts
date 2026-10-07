import { describe, it, expect } from "vitest";
import { crearAlmacenSupabase, type ConsultaSupabase, type ClienteSupabaseMando } from "../almacen-supabase";
import type { TareaOla } from "../protocolo";

interface Llamada { tabla: string; metodo: string; args: unknown[] }

function crearFalso({ datos = [] as unknown[], error = null as { message: string } | null } = {}) {
  const llamadas: Llamada[] = [];
  const cliente: ClienteSupabaseMando = {
    from(tabla: string): ConsultaSupabase {
      const registrar = (metodo: string, args: unknown[]) => { llamadas.push({ tabla, metodo, args }); };
      const resolver = () => ({ data: datos, error });
      const q: ConsultaSupabase = {
        then: (onOk, onErr) => Promise.resolve(resolver()).then(onOk, onErr),
        select(...a: unknown[]) { registrar("select", a); return q; },
        eq(...a: [string, unknown]) { registrar("eq", a); return q; },
        gte(...a: [string, unknown]) { registrar("gte", a); return q; },
        order(...a: unknown[]) { registrar("order", a); return q; },
        limit(...a: [number]) { registrar("limit", a); return q; },
        upsert(...a: unknown[]) { registrar("upsert", a); return Promise.resolve({ data: null, error }); },
        update(...a: unknown[]) { registrar("update", a); return q; },
      };
      return q as unknown as ConsultaSupabase;
    },
  };
  return { cliente, llamadas };
}

const tarea: TareaOla = { id: "t1", ola: "O1", depende: [], titulo: "T", archivos: [], prompt: "p" };

describe("crearAlmacenSupabase", () => {
  it("leerTareas filtra por ambito_id y mapea", async () => {
    const fila = { tarea_id: "t1", ola: "O1", titulo: "T", depende: [], archivos: [], prompt: "p" };
    const { cliente, llamadas } = crearFalso({ datos: [fila] });
    const a = crearAlmacenSupabase(cliente, "amb1");
    expect(await a.leerTareas()).toEqual([tarea]);
    expect(llamadas[0].tabla).toBe("mando_tareas");
    expect(llamadas.some((l) => l.metodo === "eq" && l.args[0] === "ambito_id" && l.args[1] === "amb1")).toBe(true);
  });

  it("leerProgreso agrupa estado y avance por tarea", async () => {
    const { cliente } = crearFalso({ datos: [{ tarea_id: "t1", estado: "escribiendo", avance: 3 }] });
    const a = crearAlmacenSupabase(cliente, "amb1");
    expect(await a.leerProgreso()).toEqual({ t1: { estado: "escribiendo", avance: 3 } });
  });

  it("leerEventos ordena por t, aplica techo 500 y filtro gte", async () => {
    const { cliente, llamadas } = crearFalso({ datos: [{ t: "2026-01-01T00:00:00Z", tipo: "ola", texto: "x" }] });
    const a = crearAlmacenSupabase(cliente, "amb1");
    const ev = await a.leerEventos("2025-12-31", 9999);
    expect(ev).toHaveLength(1);
    expect(llamadas[0].tabla).toBe("mando_eventos");
    expect(llamadas.find((l) => l.metodo === "limit")?.args[0]).toBe(500);
    expect(llamadas.find((l) => l.metodo === "order")?.args[0]).toBe("t");
    const gte = llamadas.find((l) => l.metodo === "gte");
    expect(gte?.args[0]).toBe("t");
    expect(typeof gte?.args[1]).toBe("string");
  });

  it("leerChat filtra canal, techo 200 y devuelve cronológico", async () => {
    const datos = [
      { canal: "general", autor: "b", rol: "r", texto: "segundo" },
      { canal: "general", autor: "a", rol: "r", texto: "primero" },
    ];
    const { cliente, llamadas } = crearFalso({ datos });
    const a = crearAlmacenSupabase(cliente, "amb1");
    const msg = await a.leerChat("general", 300);
    expect(llamadas[0].tabla).toBe("mando_chat");
    expect(llamadas.some((l) => l.metodo === "eq" && l.args[0] === "canal" && l.args[1] === "general")).toBe(true);
    expect(llamadas.find((l) => l.metodo === "limit")?.args[0]).toBe(200);
    expect(msg.map((m) => m.texto)).toEqual(["primero", "segundo"]);
  });

  it("leerMedidores devuelve el doc más reciente", async () => {
    const { cliente, llamadas } = crearFalso({ datos: [{ doc: { agentes: 2 } }] });
    const a = crearAlmacenSupabase(cliente, "amb1");
    expect(await a.leerMedidores()).toEqual({ agentes: 2 });
    expect(llamadas[0].tabla).toBe("mando_medidores");
  });

  it("encolar valida con protocolo y hace upsert pendiente", async () => {
    const { cliente, llamadas } = crearFalso();
    const a = crearAlmacenSupabase(cliente, "amb1");
    const r = await a.encolarOrden({ tipo: "encolar", datos: tarea });
    expect(r.ok).toBe(true);
    const up = llamadas.find((l) => l.metodo === "upsert");
    expect(up?.tabla).toBe("mando_tareas");
    expect((up?.args[0] as Record<string, unknown>).estado).toBe("pendiente");
  });

  it("orden inválida se rechaza sin llamar al cliente", async () => {
    const { cliente, llamadas } = crearFalso();
    const a = crearAlmacenSupabase(cliente, "amb1");
    const r = await a.encolarOrden({ tipo: "encolar", datos: { id: "" } });
    expect(r.ok).toBe(false);
    expect(llamadas).toHaveLength(0);
  });

  it("aprobar actualiza estado aprobada y frenar pone freno en el ámbito", async () => {
    const { cliente, llamadas } = crearFalso();
    const a = crearAlmacenSupabase(cliente, "amb1");
    expect((await a.encolarOrden({ tipo: "aprobar", datos: { id: "t1" } })).ok).toBe(true);
    expect(llamadas.some((l) => l.tabla === "mando_tareas" && l.metodo === "update"
      && (l.args[0] as Record<string, unknown>).estado === "aprobada")).toBe(true);
    llamadas.length = 0;
    expect((await a.encolarOrden({ tipo: "frenar", datos: {} })).ok).toBe(true);
    expect(llamadas.some((l) => l.tabla === "mando_ambitos" && l.metodo === "update"
      && (l.args[0] as Record<string, unknown>).freno === true)).toBe(true);
  });

  it("error del cliente devuelve vacío o ok:false sin lanzar", async () => {
    const { cliente } = crearFalso({ error: { message: "RLS deniega" } });
    const a = crearAlmacenSupabase(cliente, "amb1");
    expect(await a.leerTareas()).toEqual([]);
    expect(await a.leerProgreso()).toEqual({});
    expect(await a.leerEventos()).toEqual([]);
    expect(await a.leerChat("general")).toEqual([]);
    expect(await a.leerMedidores()).toBeNull();
    const r = await a.encolarOrden({ tipo: "encolar", datos: tarea });
    expect(r).toEqual({ ok: false, motivo: "RLS deniega" });
    expect(r.motivo).not.toMatch(/key|secret|token/i);
  });
});
