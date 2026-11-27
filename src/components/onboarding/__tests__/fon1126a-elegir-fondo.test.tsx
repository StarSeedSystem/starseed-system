import { describe, it, expect } from "vitest";
import {
  TARJETAS_ANADIR_FONDO, elegirFondoUnico, incorporarFondo, modoVistaPrevia, opcionElegida, opcionesFondoCompletas,
} from "@/lib/onboarding/fondo-inicial";

const a = { id: "actual", nombre: "Fondo actual" };
const b = { id: "aurora", nombre: "Aurora" };
const c = { id: "cristal", nombre: "Cristal" };

describe("«Elige tu fondo» · lógica", () => {
  it("elige uno solo: el nuevo sustituye al anterior", () => {
    expect(elegirFondoUnico("aurora", "cristal")).toBe("cristal");
    expect(elegirFondoUnico(null, "actual")).toBe("actual");
  });

  it("junta todo el catálogo sin repetir ids", () => {
    const todo = opcionesFondoCompletas([a], [b, c], [{ id: "aurora", nombre: "Otra" }, { id: "mio", nombre: "Mío" }]);
    expect(todo.map((o) => o.id)).toEqual(["actual", "aurora", "cristal", "mio"]);
    expect(todo[1].nombre).toBe("Aurora");
  });

  it("la vista previa del elegido cae en la primera si el id no existe", () => {
    expect(opcionElegida([a, b], "aurora")).toBe(b);
    expect(opcionElegida([a, b], "borrado")).toBe(a);
    expect(opcionElegida([], "x")).toBeNull();
  });

  it("añadir mete al catálogo y personalizar reemplaza por id", () => {
    const con = incorporarFondo([a, b], c);
    expect(con.map((o) => o.id)).toEqual(["actual", "aurora", "cristal"]);
    const editado = incorporarFondo(con, { id: "aurora", nombre: "Aurora (mía)" });
    expect(editado).toHaveLength(3);
    expect(editado[1].nombre).toBe("Aurora (mía)");
  });

  it("siempre hay dos tarjetas de añadir: Librería y mis archivos", () => {
    expect(TARJETAS_ANADIR_FONDO.map((t) => t.origen)).toEqual(["libreria", "archivos"]);
    expect(TARJETAS_ANADIR_FONDO[0].titulo).toBe("Añadir desde la Librería");
    expect(TARJETAS_ANADIR_FONDO[1].titulo).toBe("Desde mis archivos");
  });

  it("la miniatura respeta WebGPU, movimiento reducido y rendimiento", () => {
    const base = { webgpu: true, movimientoReducido: false, rendimientoBajo: false, activa: false };
    expect(modoVistaPrevia({ ...base, webgpu: false, activa: true })).toBe("imagen");
    expect(modoVistaPrevia({ ...base, movimientoReducido: true, activa: true })).toBe("quieta");
    expect(modoVistaPrevia({ ...base, rendimientoBajo: true, activa: true })).toBe("quieta");
    expect(modoVistaPrevia(base)).toBe("quieta");
    expect(modoVistaPrevia({ ...base, activa: true })).toBe("animada");
  });
});
