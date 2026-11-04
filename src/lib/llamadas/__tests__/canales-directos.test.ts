import { describe, expect, it } from "vitest";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import { canalesParaLlamada } from "@/lib/llamadas/canales-directos";

function enlace(id: string, abierto = true): EnlaceLocalVivo {
  return {
    id: `local:${id}`,
    par: { nombre: `Aparato ${id}` },
    desde: Date.now(),
    abierto: () => abierto,
    rttMs: () => null,
    ruta: () => null,
    capacidadKbps: () => null,
    enviar: () => true,
    enviarBinario: () => true,
    bufferedAmount: () => 0,
    alMensaje: () => () => undefined,
    ponerPistas: async () => true,
    alFlujoRemoto: () => () => undefined,
    cerrar: () => undefined,
  };
}

describe("canalesParaLlamada", () => {
  it("sin red Supabase y con enlaces vivos devuelve los enlaces (máx 7) y el texto directo", () => {
    const enlaces = Array.from({ length: 3 }, (_, i) => enlace(String(i)));
    const r = canalesParaLlamada({ hayRedSupabase: false, enlaces, tema: null });
    expect(r.enlaces).toHaveLength(3);
    expect(r.texto).toBe("por enlace directo (misma red)");
    expect(r.motivo).toBeUndefined();
  });

  it("sin red Supabase y sin enlaces vivos devuelve motivo de vincular", () => {
    const r = canalesParaLlamada({ hayRedSupabase: false, enlaces: [], tema: null });
    expect(r.enlaces).toHaveLength(0);
    expect(r.texto).toBe("");
    expect(r.motivo).toBe('Vincula un aparato desde "Vincular sin internet" o revisa tu conexión');
  });

  it("sin red Supabase ignora enlaces cerrados", () => {
    const enlaces = [enlace("a", true), enlace("b", false), enlace("c", true)];
    const r = canalesParaLlamada({ hayRedSupabase: false, enlaces, tema: null });
    expect(r.enlaces).toHaveLength(2);
    expect(r.enlaces.map((e) => e.id)).toEqual(["local:a", "local:c"]);
  });

  it("sin red Supabase respeta el tope de 7 enlaces", () => {
    const enlaces = Array.from({ length: 9 }, (_, i) => enlace(String(i)));
    const r = canalesParaLlamada({ hayRedSupabase: false, enlaces, tema: null });
    expect(r.enlaces).toHaveLength(7);
  });

  it("con red Supabase, enlaces vivos y tema devuelve enlaces y texto combinado", () => {
    const enlaces = [enlace("a"), enlace("b")];
    const r = canalesParaLlamada({ hayRedSupabase: true, enlaces, tema: "llamada:abc" });
    expect(r.enlaces).toHaveLength(2);
    expect(r.texto).toBe("por enlace directo (misma red) y canal privado");
    expect(r.motivo).toBeUndefined();
  });

  it("con red Supabase, enlaces vivos y sin tema devuelve enlaces y texto directo", () => {
    const enlaces = [enlace("a")];
    const r = canalesParaLlamada({ hayRedSupabase: true, enlaces, tema: null });
    expect(r.enlaces).toHaveLength(1);
    expect(r.texto).toBe("por enlace directo (misma red)");
    expect(r.motivo).toBeUndefined();
  });

  it("con red Supabase, sin enlaces y con tema devuelve motivo de servidor", () => {
    const r = canalesParaLlamada({ hayRedSupabase: true, enlaces: [], tema: "llamada:abc" });
    expect(r.enlaces).toHaveLength(0);
    expect(r.texto).toBe("");
    expect(r.motivo).toBe("El servidor no deja entrar en el canal privado de la llamada");
  });

  it("con red Supabase, sin enlaces y sin tema devuelve motivo de vincular", () => {
    const r = canalesParaLlamada({ hayRedSupabase: true, enlaces: [], tema: null });
    expect(r.enlaces).toHaveLength(0);
    expect(r.texto).toBe("");
    expect(r.motivo).toBe('Vincula un aparato desde "Vincular sin internet" o revisa tu conexión');
  });
});