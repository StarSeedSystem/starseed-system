// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ activa: null as null | { motor: { cerrada: boolean } } }));
vi.mock("@/lib/llamadas/store", () => ({ leerLlamadas: () => ({ activa: h.activa }) }));

import { marcarOcupado, medirMomento, permitirDatosMoviles } from "../momento-navegador";

afterEach(() => {
  h.activa = null;
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("momento medido en el navegador", () => {
  it("una llamada activa del almacén cuenta; una colgada no", async () => {
    h.activa = { motor: { cerrada: false } };
    expect((await medirMomento()).enLlamada).toBe(true);
    h.activa = { motor: { cerrada: true } };
    expect((await medirMomento()).enLlamada).toBe(false);
  });

  it("marcas del DOM y registro de ocupado (directo)", async () => {
    document.body.innerHTML = '<div data-en-directo></div>';
    expect((await medirMomento()).enDirecto).toBe(true);
    document.body.innerHTML = "";
    const soltar = marcarOcupado("d1", "directo");
    expect((await medirMomento()).enDirecto).toBe(true);
    soltar();
    expect((await medirMomento()).enDirecto).toBe(false);
  });

  it("escribir en un campo cuenta como escribiendo", async () => {
    document.body.innerHTML = '<input id="x" />';
    (document.getElementById("x") as HTMLInputElement).focus();
    expect((await medirMomento()).escribiendo).toBe(true);
  });

  it("sin APIs de batería ni conexión: no se inventan; datos móviles se recuerdan por aparato", async () => {
    const m = await medirMomento();
    expect(m.bateriaPct).toBeNull();
    expect(m.wifi).toBeNull();
    expect(m.datosPermitidos).toBe(false);
    permitirDatosMoviles(true);
    expect((await medirMomento()).datosPermitidos).toBe(true);
  });
});
