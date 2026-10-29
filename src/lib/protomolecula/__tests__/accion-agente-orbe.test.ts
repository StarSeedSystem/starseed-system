import { describe, it, expect, vi } from "vitest";
import { manejarAccionProtomolecula } from "../accion-agente";

describe("accion-agente orbe", () => {
  it("activar llama a fijarOrbe con true y devuelve ok", () => {
    const fijar = vi.fn(() => true);
    const r = manejarAccionProtomolecula({ accion: "activar" }, { fijarOrbe: fijar });
    expect(fijar).toHaveBeenCalledWith(true);
    expect(r).toEqual({ ok: true, message: "Activé la orbe de la Protomolécula en todas tus neuronas.", status: "Protomolécula" });
  });

  it("desactivar llama a fijarOrbe con false y devuelve ok", () => {
    const fijar = vi.fn(() => false);
    const r = manejarAccionProtomolecula({ accion: "desactivar" }, { fijarOrbe: fijar });
    expect(fijar).toHaveBeenCalledWith(false);
    expect(r).toEqual({ ok: true, message: "Desactivé la orbe de la Protomolécula en todas tus neuronas.", status: "Protomolécula" });
  });

  it("cerrar llama a cerrarOrbe y devuelve ok", () => {
    const cerrar = vi.fn();
    const r = manejarAccionProtomolecula({ accion: "cerrar" }, { cerrarOrbe: cerrar });
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, message: "Cerré el panel de la Protomolécula.", status: "Protomolécula" });
  });

  it("abrir con orbe apagada activa primero y luego abre", () => {
    const fijar = vi.fn(() => true);
    const abrirRuta = vi.fn();
    const avisar = vi.fn(() => false);
    const r = manejarAccionProtomolecula({ accion: "abrir" }, { fijarOrbe: fijar, avisarOrbe: avisar, abrirRuta });
    expect(fijar).toHaveBeenCalledWith(true);
    expect(abrirRuta).toHaveBeenCalledWith("/protomolecula");
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Abrí la Protomolécula en su página.");
  });

  it("acción desconocida sigue fallando", () => {
    const r = manejarAccionProtomolecula({ accion: "noexiste" }, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain("No conozco la acción");
  });
});
