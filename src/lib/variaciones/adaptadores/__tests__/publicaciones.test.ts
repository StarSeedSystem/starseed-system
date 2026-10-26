import { describe, it, expect, beforeEach } from "vitest";
import { __resetRegistros, familiasRegistradas, adaptadorDe } from "../../familias";
import { registrarAdaptadoresPublicaciones, validarPayload, type DepsPublicaciones } from "../publicaciones";

function depsDePrueba(): DepsPublicaciones {
  const store = new Map<string, unknown>();
  return {
    leer: (k) => store.get(k) ?? null,
    escribir: (k, v) => { store.set(k, v); },
  };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador publicaciones y mensajes", () => {
  it("registra familias post y mensaje", () => {
    registrarAdaptadoresPublicaciones(depsDePrueba());
    expect(familiasRegistradas()).toEqual(expect.arrayContaining(["post", "mensaje"]));
    expect(adaptadorDe("post:123")?.familia).toBe("post");
  });

  it("captura estilo solo con parte válida", () => {
    const deps = depsDePrueba();
    deps.escribir("mensaje:chat#estilo", { fuente: "inter", tamano: 16 });
    registrarAdaptadoresPublicaciones(deps);
    const adapt = adaptadorDe("mensaje:chat") as any;
    expect(adapt.capturar("mensaje:chat#estilo")).toEqual({ fuente: "inter", tamano: 16 });
    expect(adapt.capturar("mensaje:chat#plantilla")).toBeNull();
    expect(adapt.capturar("post:123#estilo")).toBeNull();
  });

  it("valida payload sin texto ni destinatarios", () => {
    expect(validarPayload({ fuente: "inter", tamano: 16 }).ok).toBe(true);
    expect(validarPayload({ body: "hola" }).ok).toBe(false);
    expect(validarPayload({ destinatarios: ["a"] }).ok).toBe(false);
    expect(validarPayload("string")).toBeTruthy();
  });

  it("aplicar escribe y deshacer restaura", () => {
    const deps = depsDePrueba();
    deps.escribir("post:1#estilo", { color: "#fff" });
    registrarAdaptadoresPublicaciones(deps);
    const adapt = adaptadorDe("post:1") as any;
    const { deshacer } = adapt.aplicar("post:1#estilo", { color: "#000" });
    expect(deps.leer("post:1#estilo")).toEqual({ color: "#000" });
    deshacer();
    expect(deps.leer("post:1#estilo")).toEqual({ color: "#fff" });
  });

  it("no captura claves sin parte o familia equivocada", () => {
    const deps = depsDePrueba();
    registrarAdaptadoresPublicaciones(deps);
    const adapt = adaptadorDe("mensaje:chat") as any;
    expect(adapt.capturar("mensaje:chat")).toBeNull();
    expect(adapt.capturar("mensaje:invalida#")).toBeNull();
  });
});
