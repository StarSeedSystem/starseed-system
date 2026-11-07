import { describe, it, expect } from "vitest";

import {
  suscribirCambiosVinculos,
  type ClienteVinculosRealtime,
  type CanalVinculoRealtime,
} from "@/lib/network/vinculos-realtime";

interface Escucha {
  tipo: string;
  filtro: Record<string, unknown>;
  cb: (payload: unknown) => void;
}

class CanalFalso implements Partial<CanalVinculoRealtime> {
  readonly escuchas: Escucha[] = [];
  suscribio = false;
  on(tipo: string, filtro: Record<string, unknown>, cb: (p: unknown) => void): CanalFalso {
    this.escuchas.push({ tipo, filtro, cb });
    return this;
  }
  subscribe(cb?: (estado: string) => void): CanalFalso {
    this.suscribio = true;
    return this;
  }
}

class ClienteFalso {
  readonly canales: CanalFalso[] = [];
  readonly quitados: CanalFalso[] = [];
  lastName?: string;
  romperChannel = false;
  romperOn = false;
  channel(name?: string): CanalFalso {
    this.lastName = name;
    if (this.romperChannel) throw new Error("canal roto");
    const c = new CanalFalso();
    if (this.romperOn) {
      return { on: () => { throw new Error("on roto"); }, subscribe: () => c } as unknown as CanalFalso;
    }
    this.canales.push(c);
    return c;
  }
  removeChannel(c: CanalFalso): void {
    this.quitados.push(c);
  }
}

interface Tarea {
  fn: () => void;
  ms: number;
}

/** Reloj de mentira: guarda las tareas y las quita al cancelarlas. */
function relojFalso() {
  const tareas: (Tarea | null)[] = [];
  const programa = (fn: () => void, ms: number): unknown => {
    tareas.push({ fn, ms });
    return tareas.length;
  };
  const cancela = (id: unknown): void => {
    tareas[Number(id) - 1] = null;
  };
  return { tareas, programa, cancela };
}

describe("suscribirCambiosVinculos", () => {
  it("abre UN canal con esquema, tabla y los dos filtros correctos", () => {
    const cliente = new ClienteFalso();
    const soltar = suscribirCambiosVinculos(cliente, "u-abc", () => {});
    expect(cliente.lastName).toBe("vinculos:u-abc");
    expect(cliente.canales.length).toBe(1);
    const canal = cliente.canales[0];
    expect(canal.escuchas.length).toBe(2);
    for (const e of canal.escuchas) {
      expect(e.tipo).toBe("postgres_changes");
      expect(e.filtro).toEqual(
        expect.objectContaining({ event: "*", schema: "public", table: "os_mesh_vinculos" }),
      );
    }
    const filtros = canal.escuchas.map((e) => e.filtro.filter);
    expect(filtros).toContain("a_owner=eq.u-abc");
    expect(filtros).toContain("de_owner=eq.u-abc");
    expect(canal.suscribio).toBe(true);
    soltar();
  });

  it("tres eventos seguidos llegan en una sola llamada alCambiar", () => {
    const cliente = new ClienteFalso();
    const { tareas, programa, cancela } = relojFalso();
    const llamadas: number[] = [];
    const soltar = suscribirCambiosVinculos(cliente, "u-abc", () => llamadas.push(llamadas.length + 1), {
      programar: programa,
      cancelar: cancela,
    });
    const cb = cliente.canales[0].escuchas[0].cb;
    cb({}); cb({}); cb({});
    expect(llamadas.length).toBe(0);
    expect(tareas.length).toBe(1);
    expect(tareas[0]?.ms).toBe(1500);
    (tareas[0] as Tarea).fn();
    expect(llamadas).toEqual([1]);
  });

  it("soltar cancela lo pendiente, quita el canal y después no crea nada nuevo", () => {
    const cliente = new ClienteFalso();
    const { tareas, programa, cancela } = relojFalso();
    let llamadas = 0;
    const soltar = suscribirCambiosVinculos(
      cliente,
      "u-abc",
      () => { llamadas += 1; },
      { programar: programa, cancelar: cancela },
    );
    const canal = cliente.canales[0];
    canal.escuchas[0].cb({});
    soltar();
    expect(tareas[0]).toBeNull();
    expect(cliente.quitados).toEqual([canal]);
    canal.escuchas[0].cb({});
    expect(llamadas).toBe(0);
    expect(tareas.every((t) => t === null)).toBe(true);
    expect(cliente.canales.length).toBe(1);
    soltar();
    expect(cliente.quitados.length).toBe(1);
  });
});

describe("suscribirCambiosVinculos · malos caminos", () => {
  it("sin uid no abre canal y devuelve una función vacía", () => {
    const cliente = new ClienteFalso();
    const soltar = suscribirCambiosVinculos(cliente, null, () => {});
    expect(cliente.canales.length).toBe(0);
    expect(typeof soltar).toBe("function");
    expect(() => soltar()).not.toThrow();
  });

  it("un cliente que lanza en channel no lanza y devuelve una función vacía", () => {
    const cliente = new ClienteFalso();
    cliente.romperChannel = true;
    const llamadas: number[] = [];
    expect(() => suscribirCambiosVinculos(cliente, "u-abc", () => llamadas.push(1))).not.toThrow();
    expect(llamadas.length).toBe(0);
  });

  it("un cliente sin método channel devuelve una función vacía", () => {
    const sinChannel = {} as unknown as ClienteVinculosRealtime;
    const soltar = suscribirCambiosVinculos(sinChannel, "u-abc", () => {});
    expect(() => soltar()).not.toThrow();
  });

  it("un alCambiar que lanza no tumba los eventos posteriores", () => {
    const cliente = new ClienteFalso();
    const { tareas, programa, cancela } = relojFalso();
    let llamadas = 0;
    const soltar = suscribirCambiosVinculos(
      cliente,
      "u-abc",
      () => { llamadas += 1; throw new Error("oyente torpe"); },
      { programar: programa, cancelar: cancela },
    );
    const cb = cliente.canales[0].escuchas[0].cb;
    cb({});
    (tareas[0] as Tarea).fn();
    expect(llamadas).toBe(1);
    cb({});
    expect(tareas[1]?.ms).toBe(1500);
    (tareas[1] as Tarea).fn();
    expect(llamadas).toBe(2);
    soltar();
    expect(cliente.quitados.length).toBe(1);
  });
});
