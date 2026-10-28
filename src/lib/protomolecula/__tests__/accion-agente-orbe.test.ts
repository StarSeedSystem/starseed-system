/**
 * PMO1020C · la orbe de la Protomolécula desde Astraura: «activar», «desactivar»,
 * «alternar» y «cerrar» + «abrir» con la orbe apagada (la activa y abre).
 * Todo se inyecta: sin `window`, sin red, sin disco (vitest corre con `globals: false`).
 */
import { describe, it, expect } from "vitest";
import {
  manejarAccionProtomolecula,
  MENSAJE_ORBE_ACTIVADA,
  MENSAJE_ORBE_DESACTIVADA,
  MENSAJE_ORBE_CERRADA,
  type ContextoAccionProto,
} from "@/lib/protomolecula/accion-agente";

interface ValsAccionProto {
  fijos: boolean[];
  avisos: Array<string | undefined>;
  cierres: number;
}

const registro = (): ValsAccionProto => ({ fijos: [], avisos: [], cierres: 0 });

const ctx = (r: ValsAccionProto, orbeActivada: () => boolean = () => false): ContextoAccionProto => ({
  fijarOrbe: (v) => { r.fijos.push(v); return v; },
  avisarOrbe: (id) => { r.avisos.push(id); return true; },
  cerrarOrbe: () => { r.cierres++; },
  orbeActivada,
});

describe("acción del agente sobre la orbe (PMO1020C)", () => {
  it("«activar» llama a fijarOrbe(true) y responde con su mensaje", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "activar" }, ctx(r));
    expect(r.fijos).toEqual([true]);
    expect(x.ok).toBe(true);
    expect(x.message).toBe(MENSAJE_ORBE_ACTIVADA);
  });

  it("«desactivar» llama a fijarOrbe(false) y responde con su mensaje", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "desactivar" }, ctx(r));
    expect(r.fijos).toEqual([false]);
    expect(x.ok).toBe(true);
    expect(x.message).toBe(MENSAJE_ORBE_DESACTIVADA);
  });

  it("«alternar» con la orbe apagada la enciende", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "alternar" }, ctx(r, () => false));
    expect(r.fijos).toEqual([true]);
    expect(x.ok).toBe(true);
    expect(x.message).toBe(MENSAJE_ORBE_ACTIVADA);
  });

  it("«alternar» con la orbe encendida la apaga", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "alternar" }, ctx(r, () => true));
    expect(r.fijos).toEqual([false]);
    expect(x.message).toBe(MENSAJE_ORBE_DESACTIVADA);
  });

  it("«cerrar» despacha el cierre y responde con su mensaje", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "cerrar" }, ctx(r));
    expect(r.cierres).toBe(1);
    expect(r.fijos).toEqual([]);
    expect(x.ok).toBe(true);
    expect(x.message).toBe(MENSAJE_ORBE_CERRADA);
  });

  it("«abrir» con la orbe apagada la activa y después abre", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "abrir" }, ctx(r));
    expect(r.fijos).toEqual([true]);
    expect(r.avisos).toEqual([undefined]);
    expect(x.ok).toBe(true);
    expect(x.message).toContain(MENSAJE_ORBE_ACTIVADA);
    expect(x.status).toBe("Abriendo la Protomolécula…");
  });

  it("«abrir» con la orbe encendida no toca fijarOrbe", () => {
    const r = registro();
    manejarAccionProtomolecula({ accion: "abrir" }, ctx(r, () => true));
    expect(r.fijos).toEqual([]);
    expect(r.avisos).toEqual([undefined]);
  });

  it("una acción desconocida sigue fallando, ahora con las cuatro nuevas listadas", () => {
    const r = registro();
    const x = manejarAccionProtomolecula({ accion: "desaparecer" }, ctx(r));
    expect(r.fijos).toEqual([]);
    expect(x.ok).toBe(false);
    for (const nva of ["activar", "desactivar", "alternar", "cerrar"]) {
      expect(x.message).toContain(nva);
    }
  });
});
