import { describe, expect, it, vi } from "vitest";
import { manejarAccionProtomolecula } from "../accion-agente";

describe("acción de agente · orbe de la Protomolécula", () => {
  it("activar llama a fijarOrbe con true y devuelve ok con mensaje", () => {
    const fijarOrbe = vi.fn(() => true);
    const r = manejarAccionProtomolecula({ accion: "activar" }, { fijarOrbe });
    expect(fijarOrbe).toHaveBeenCalledTimes(1);
    expect(fijarOrbe).toHaveBeenCalledWith(true);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Activé la orbe de la Protomolécula en todas tus neuronas.");
  });

  it("desactivar llama a fijarOrbe con false y devuelve ok con mensaje", () => {
    const fijarOrbe = vi.fn(() => false);
    const r = manejarAccionProtomolecula({ accion: "desactivar" }, { fijarOrbe });
    expect(fijarOrbe).toHaveBeenCalledTimes(1);
    expect(fijarOrbe).toHaveBeenCalledWith(false);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Desactivé la orbe de la Protomolécula en todas tus neuronas.");
  });

  it("alternar llama a alternarOrbe y devuelve ok con mensaje", () => {
    const alternarOrbe = vi.fn(() => false);
    const r = manejarAccionProtomolecula({ accion: "alternar" }, { alternarOrbe });
    expect(alternarOrbe).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Cambié el estado de la orbe de la Protomolécula.");
  });

  it("cerrar llama a cerrarOrbe y devuelve ok con mensaje", () => {
    const cerrarOrbe = vi.fn();
    const r = manejarAccionProtomolecula({ accion: "cerrar" }, { cerrarOrbe });
    expect(cerrarOrbe).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Cerré el panel de la Protomolécula.");
  });
});
