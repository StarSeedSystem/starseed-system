/** DIR1125H · el puente nativo deja medir lo que tarda atender cada evento y marca cuándo llega la respuesta de una orden. Sin medidor, nada cambia. */
import { afterEach, describe, expect, it } from "vitest";
import { crearPuente } from "../puente";
import { ponerMedidorHilo } from "@/lib/perf/medidor-hilo";

type Manejador = (e: { payload: unknown }) => void;

function tauriDeMentira() {
  const manejadores: Record<string, Manejador> = {};
  return {
    manejadores,
    tauri: {
      core: {
        invoke: async (cmd: string) => {
          if (cmd === "falla") throw new Error("no se pudo");
          return 42;
        },
      },
      event: {
        listen: async (evento: string, cb: Manejador) => {
          manejadores[evento] = cb;
          return () => {};
        },
      },
    },
  };
}

describe("DIR1125H · puente nativo medido", () => {
  afterEach(() => ponerMedidorHilo(null));

  it("los eventos nativos se miden con su nombre y las órdenes dejan marca al responder", async () => {
    const medidos: string[] = [];
    const marcas: string[] = [];
    ponerMedidorHilo({
      medir: (clave, f) => {
        medidos.push(clave);
        return f();
      },
      marcar: (clave) => {
        marcas.push(clave);
      },
    });
    const t = tauriDeMentira();
    const puente = crearPuente(t.tauri);
    const vistos: unknown[] = [];
    await puente.escuchar("malla-local://evento", (p) => vistos.push(p));
    t.manejadores["malla-local://evento"]({ payload: { a: 1 } });
    expect(vistos).toEqual([{ a: 1 }]);
    expect(medidos).toEqual(["ev:malla-local://evento"]);

    expect(await puente.llamar<number>("malla_estado")).toEqual({ ok: true, valor: 42 });
    expect(marcas).toEqual(["inv:malla_estado"]);
    const fallo = await puente.llamar("falla");
    expect(fallo.ok).toBe(false);
    expect(marcas).toEqual(["inv:malla_estado"]); // una orden que falla no deja marca de respuesta
  });

  it("sin medidor puesto todo pasa tal cual", async () => {
    const t = tauriDeMentira();
    const puente = crearPuente(t.tauri);
    const vistos: unknown[] = [];
    await puente.escuchar("antenas://cambio", (p) => vistos.push(p));
    t.manejadores["antenas://cambio"]({ payload: 2 });
    expect(vistos).toEqual([2]);
    expect(await puente.llamar<number>("lo_que_sea")).toEqual({ ok: true, valor: 42 });
  });
});
