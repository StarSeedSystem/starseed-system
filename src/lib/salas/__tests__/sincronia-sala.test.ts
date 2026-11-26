import { describe, it, expect } from "vitest";
import {
  ElementoSala,
  EstadoSala,
  fusionarEstados,
  prioridadDeElemento,
  resumirDivergencia,
  LIMITE_ELEMENTOS,
} from "../sincronia-sala";

function elemento(id: string, tipo: string, actualizadoEn: number, porDispositivo: string, borrado?: boolean): ElementoSala {
  return { id, tipo, datos: {}, actualizadoEn, porDispositivo, borrado };
}

function estado(salaId: string, elementos: Record<string, ElementoSala>, reloj: number): EstadoSala {
  return { salaId, elementos, reloj };
}

describe("ElementoSala", () => {
  it("almacena el tipo tal cual viene", () => {
    const el = elemento("e1", "Cursor:Ana", 100, "device-1");
    // El tipo se almacena tal como viene, sin normalizar automáticamente
    expect(el.tipo).toBe("Cursor:Ana");
  });

  it("el tipo puede contener dos puntos", () => {
    const el = elemento("e1", "posicion:xy", 100, "device-1");
    expect(el.tipo).toBe("posicion:xy");
  });
});

describe("prioridadDeElemento", () => {
  it("efímero P0: presencia", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "presencia", actualizadoEn: 100, porDispositivo: "d1", borrado: undefined })).toBe(0);
  });

  it("efímero P0: cursor", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "cursor", actualizadoEn: 100, porDispositivo: "d1" })).toBe(0);
  });

  it("efímero P0: voz", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "voz", actualizadoEn: 100, porDispositivo: "d1" })).toBe(0);
  });

  it("estado P2: posicion", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "posicion", actualizadoEn: 100, porDispositivo: "d1" })).toBe(2);
  });

  it("estado P2: camara", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "camara", actualizadoEn: 100, porDispositivo: "d1" })).toBe(2);
  });

  it("masivo P3: historial", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "historial", actualizadoEn: 100, porDispositivo: "d1" })).toBe(3);
  });

  it("masivo P3: textura", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "textura", actualizadoEn: 100, porDispositivo: "d1" })).toBe(3);
  });

  it("lápida prioridad 1", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "cualquier", actualizadoEn: 100, porDispositivo: "d1", borrado: true })).toBe(1);
  });

  it("tipo desconocido default P1", () => {
    expect(prioridadDeElemento({ id: "e1", tipo: "algo-rare", actualizadoEn: 100, porDispositivo: "d1" })).toBe(1);
  });
});

describe("fusionarEstados", () => {
  it("salas distintas retorna error", () => {
    const local = estado("sala-1", {}, 0);
    const remoto = estado("sala-2", {}, 0);
    const { conflictos } = fusionarEstados(local, remoto, "device-1");
    expect(conflictos).toContain("sala-distinta");
  });

  it("añade elemento nuevo cuando no existe en local", () => {
    const local = estado("sala-1", {}, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 0);
    const { resultado } = fusionarEstados(local, remoto, "device-2");
    expect(resultado.elementos.e1).toBeDefined();
    expect(resultado.elementos.e1!.actualizadoEn).toBe(100);
  });

  it("mantiene local cuando el remoto es más antiguo", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 200, "d1") }, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d2") }, 0);
    const { resultado } = fusionarEstados(local, remoto, "device-3");
    expect(resultado.elementos.e1!.actualizadoEn).toBe(200);
  });

  it("gana el más reciente cuando actualizadoEn es diferente", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 200, "d2") }, 0);
    const { resultado } = fusionarEstados(local, remoto, "device-3");
    expect(resultado.elementos.e1!.actualizadoEn).toBe(200);
  });

  it("empata actualizadoEn, gana menor porDispositivo alfabéticamente", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d2") }, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 0);
    const { resultado } = fusionarEstados(local, remoto, "device-3");
    expect(resultado.elementos.e1!.porDispositivo).toBe("d1");
  });

  it("gana lápida cuando empatan actualizadoEn y porDispositivo", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1", false) }, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1", true) }, 0);
    const { resultado } = fusionarEstados(local, remoto, "device-3");
    expect(resultado.elementos.e1!.borrado).toBe(true);
  });

  it("conflicta cuando dos dispositivos distintos tocan lo mismo", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "device-local") }, 0);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "device-other") }, 0);
    const { conflictos } = fusionarEstados(local, remoto, "device-3");
    expect(conflictos).toContain("e1");
  });

  it("no supera el techo de elementos", () => {
    const muchosElementos: Record<string, ElementoSala> = {};
    for (let i = 0; i < LIMITE_ELEMENTOS + 1; i++) {
      muchosElementos[`e${i}`] = elemento(`e${i}`, "posicion", 100, `d${i}`);
    }
    const local = estado("sala-1", muchosElementos, 0);
    const remoto = estado("sala-1", {}, 0);
    const { conflictos } = fusionarEstados(local, remoto, "device-extra");
    expect(conflictos).toContain("limite-excedido");
  });
});

describe("resumirDivergencia", () => {
  it("todo sincronizado sin cambios pendientes", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 100);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 100);
    const res = resumirDivergencia(local, remoto);
    // Mensaje completo: "Todo sincronizado: no tienes cambios pendientes en esta sala."
    expect(res).toBe("Todo sincronizado: no tienes cambios pendientes en esta sala.");
  });

  it("muestra cambios pendientes y de otras personas", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 100, "d1") }, 100);
    const remoto = estado("sala-1", { "e2": elemento("e2", "posicion", 100, "d2") }, 200);
    const res = resumirDivergencia(local, remoto);
    // El mensaje incluye "Además hay 1 cambio de otras personas por recibir"
    expect(res).toContain("Además hay 1 cambio de otras personas por recibir");
  });

  it("muestra antigüedad de cambios sin sincronizar", () => {
    const local = estado("sala-1", { "e1": elemento("e1", "posicion", 50, "d1") }, 100);
    const remoto = estado("sala-1", { "e1": elemento("e1", "posicion", 10, "d2") }, 200);
    const res = resumirDivergencia(local, remoto);
    expect(res).toContain("hace");
  });

  it("sala distinta retorna mensaje apropiado", () => {
    const local = estado("sala-1", {}, 0);
    const remoto = estado("sala-2", {}, 0);
    const res = resumirDivergencia(local, remoto);
    expect(res).toContain("no son la misma");
  });
});