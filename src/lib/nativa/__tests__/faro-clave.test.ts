import { describe, expect, it } from "vitest";
import { claveNueva, esClaveFaro, obtenerOCrearClaveFaro, type AlmacenClave } from "../faro-clave";

function almacen(inicial: string | null, otraNeurona?: string): AlmacenClave & { escrita: string | null } {
  const a = {
    escrita: inicial,
    async leer() {
      return a.escrita;
    },
    async escribirSiFalta(clave: string) {
      if (otraNeurona) a.escrita = otraNeurona; // otra neurona la escribió antes
      else if (!a.escrita) a.escrita = clave;
      return a.escrita as string;
    },
  };
  return a;
}

const fijo = (b: number) => (n: Uint8Array) => n.fill(b);

describe("clave de faro de la cuenta", () => {
  it("crea una de 32 bytes si no hay ninguna", async () => {
    const r = await obtenerOCrearClaveFaro(almacen(null), fijo(0xab));
    expect(r).toEqual({ ok: true, clave: "ab".repeat(32), nueva: true });
  });

  it("usa la que ya existe (en minúsculas) y no crea otra", async () => {
    const r = await obtenerOCrearClaveFaro(almacen("CD".repeat(32)), fijo(1));
    expect(r).toEqual({ ok: true, clave: "cd".repeat(32), nueva: false });
  });

  it("si dos neuronas la crean a la vez, las dos acaban con la misma", async () => {
    const r = await obtenerOCrearClaveFaro(almacen(null, "ef".repeat(32)), fijo(1));
    expect(r).toEqual({ ok: true, clave: "ef".repeat(32), nueva: false });
  });

  it("sin azar del sistema no inventa una clave", async () => {
    const r = await obtenerOCrearClaveFaro(almacen(null), fijo(0));
    expect(r.ok).toBe(false);
    expect(() => claveNueva(fijo(0))).toThrow(/azar/);
  });

  it("valida la forma", () => {
    expect(esClaveFaro("ab".repeat(32))).toBe(true);
    expect(esClaveFaro("AB".repeat(32))).toBe(false);
    expect(esClaveFaro("ab".repeat(31))).toBe(false);
    expect(esClaveFaro(null)).toBe(false);
    expect(esClaveFaro(claveNueva())).toBe(true);
  });
});
