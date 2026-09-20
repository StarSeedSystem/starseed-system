import { describe, it, expect } from "vitest";
import {
  parsearVeredictos,
  leerVeredictos,
  veredictoDe,
  tonoDe,
  type ListaVeredictos,
} from "@/lib/mando/veredictos";

const lista: ListaVeredictos = parsearVeredictos({
  t: "2026-09-20T10:00:00Z",
  veredictos: [
    {
      id: "RI1",
      estado: "fallida",
      veredicto: "reintentar",
      cambio: "",
      motivo: "error transitorio de red",
      confianza: 1,
      fuente: "regla",
    },
    {
      id: "RI2",
      estado: "fallida",
      veredicto: "reintentar_con_cambio",
      cambio: "usa la ruta /api/mando/colas en vez del socket",
      motivo: "jev cree que la ruta es otra",
      confianza: 0.45,
      fuente: "jev",
    },
    {
      id: "BX7",
      estado: "fallida",
      veredicto: "descartar",
      cambio: "",
      motivo: "ya está en main bajo otro id",
      confianza: 0.9,
      fuente: "regla",
    },
  ],
});

describe("parsearVeredictos", () => {
  it("acepta la forma completa", () => {
    expect(lista.t).toBe("2026-09-20T10:00:00Z");
    expect(lista.veredictos).toHaveLength(3);
  });

  it("rechaza filas irreconocibles y fija la confianza entre 0 y 1", () => {
    const r = parsearVeredictos({
      veredictos: [
        { id: "", veredicto: "reintentar" },
        { id: "A", veredicto: "inventado" },
        { id: "B", veredicto: "esperar", confianza: 9, fuente: "desconocida" },
      ],
    });
    expect(r.veredictos).toHaveLength(1);
    expect(r.veredictos[0].confianza).toBe(1);
    expect(r.veredictos[0].fuente).toBe("nadie");
  });

  it("devuelve lista vacía ante bruto no objeto", () => {
    expect(parsearVeredictos(null)).toEqual({ t: null, veredictos: [] });
    expect(parsearVeredictos("texto")).toEqual({ t: null, veredictos: [] });
  });
});

describe("leerVeredictos", () => {
  it("sin archivo devuelve lista vacía y no lanza", async () => {
    const r = await leerVeredictos("/no/existe/esta/raiz");
    expect(r).toEqual({ t: null, veredictos: [] });
  });
});

describe("veredictoDe", () => {
  it("encuentra por id", () => {
    expect(veredictoDe(lista, "RI2")?.fuente).toBe("jev");
  });

  it("id ausente o vacío → null", () => {
    expect(veredictoDe(lista, "NOPE")).toBeNull();
    expect(veredictoDe(lista, "")).toBeNull();
  });
});

describe("tonoDe", () => {
  it("regla firme → verde sin etiqueta extra", () => {
    const t = tonoDe(lista.veredictos[0]);
    expect(t.tono).toBe("verde");
    expect(t.etiqueta).toBe("reintentar");
  });

  it("jev con confianza baja → verde pero dudoso", () => {
    const t = tonoDe(lista.veredictos[1]);
    expect(t.tono).toBe("verde");
    expect(t.etiqueta).toBe("reintentar_con_cambio · dudoso: lo mira el director");
  });

  it("descartar → gris", () => {
    const t = tonoDe(lista.veredictos[2]);
    expect(t.tono).toBe("gris");
    expect(t.etiqueta).toBe("descartar");
  });

  it("esperar → ámbar", () => {
    const t = tonoDe({
      id: "E1",
      estado: "bloqueada",
      veredicto: "esperar",
      cambio: "",
      motivo: "espera a la ola 344",
      confianza: 0.8,
      fuente: "jev",
    });
    expect(t.tono).toBe("ambar");
    expect(t.etiqueta).toBe("esperar");
  });
});
