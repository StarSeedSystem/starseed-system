import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_BLOCK_DEFS, RichBlockEditor } from "@/components/creation/creation-blocks";
import { CLAVE_INDICE, PREFIJO_MOLECULA, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { leerBloque, serializarBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { SelectorMolecula, TEXTO_CONFIRMACION, prepararMolecula } from "../selector-molecula";

afterEach(() => cleanup());

/** Almacén en memoria: sin disco ni navegador. */
function almacenMemoria(): AlmacenLocal {
  const datos = new Map<string, string>();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

/** Siembra moléculas con las claves reales del almacén. */
function sembrar(a: AlmacenLocal, moleculas: Array<{ id: string }>): AlmacenLocal {
  for (const m of moleculas) a.setItem(PREFIJO_MOLECULA + m.id, JSON.stringify(m));
  a.setItem(CLAVE_INDICE, JSON.stringify({ ids: moleculas.map((m) => m.id) }));
  return a;
}

/** Válida a la vez para el almacén (forma antigua) y para el núcleo (`tipos.ts`). */
function molecula(id: string, titulo: string, ambito: string, referencia: { tipo: string; id: string } | null = null, actualizadaEn = 2000) {
  return {
    id, titulo, ambito, version: 1, creadaEn: 1000, actualizadaEn, valores: { "a1::volumen": 0.5 },
    capas: [{ id: "c1", nombre: "Base", tipo: "grafo-audio", titulo: "Base", formato: "json", referencia, orden: 0, visible: true, bloqueada: false }],
    atomos: [{ id: "a1", capaId: "c1", tipo: "audio", herramientaId: "sinte-web-audio", estado: "activo" }],
  };
}

const sinReservas = () => "publica" as const;

describe("SelectorMolecula", () => {
  it("lista las moléculas del almacén, la más reciente primero, con su ámbito", () => {
    const a = sembrar(almacenMemoria(), [molecula("vieja", "Bosque", "personal", null, 10), molecula("nueva", "Río", "grupo", null, 99)]);
    render(<SelectorMolecula ambitoPost="grupo" alElegir={vi.fn()} almacen={a} ambitoDe={sinReservas} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Ríogrupo", "Bosquepersonal"]);
  });
  it("una molécula sin avisos se inserta directamente, sin casilla", () => {
    const alElegir = vi.fn();
    const a = sembrar(almacenMemoria(), [molecula("m1", "Río", "grupo")]);
    render(<SelectorMolecula ambitoPost="grupo" alElegir={alElegir} almacen={a} ambitoDe={sinReservas} />);
    fireEvent.click(screen.getByRole("button", { name: /Río/ }));
    expect(alElegir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Insertada la instantánea de «Río»");
  });
  it("con avisos exige la casilla de confirmación antes de insertar", () => {
    const alElegir = vi.fn();
    const a = sembrar(almacenMemoria(), [molecula("m1", "Diario", "personal")]);
    render(<SelectorMolecula ambitoPost="publica" alElegir={alElegir} almacen={a} ambitoDe={sinReservas} />);
    fireEvent.click(screen.getByRole("button", { name: /Diario/ }));
    expect(alElegir).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("más reservada (personal) que la publicación (pública)");
    const insertar = screen.getByRole("button", { name: "Insertar instantánea" });
    expect(insertar).toHaveProperty("disabled", true);
    fireEvent.click(insertar);
    expect(alElegir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: TEXTO_CONFIRMACION }));
    fireEvent.click(screen.getByRole("button", { name: "Insertar instantánea" }));
    expect(alElegir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("almacén vacío: lo dice y enlaza a /protomolecula", () => {
    render(<SelectorMolecula ambitoPost="publica" alElegir={vi.fn()} almacen={almacenMemoria()} />);
    expect(screen.getByText(/Aún no tienes moléculas/).textContent).toBe("Aún no tienes moléculas: crea una en Protomolécula.");
    expect(screen.getByRole("link", { name: "Protomolécula" }).getAttribute("href")).toBe("/protomolecula");
  });
  it("un almacén que lanza no rompe: avisa de que no se puede leer", () => {
    const lanza = () => { throw new Error("acceso denegado"); };
    const roto: AlmacenLocal = { getItem: lanza, setItem: lanza, removeItem: lanza };
    render(<SelectorMolecula ambitoPost="publica" alElegir={vi.fn()} almacen={roto} />);
    expect(screen.getByText(/No se pudo leer el almacén de moléculas/)).toBeTruthy();
    render(<SelectorMolecula ambitoPost="publica" alElegir={vi.fn()} almacen={null} />);
    expect(screen.getAllByText(/No se pudo leer el almacén de moléculas/)).toHaveLength(2);
  });
  it("el texto emitido lo lee leerBloque y es la misma molécula", () => {
    const alElegir = vi.fn();
    const a = sembrar(almacenMemoria(), [molecula("m1", "Río", "grupo")]);
    render(<SelectorMolecula ambitoPost="grupo" alElegir={alElegir} almacen={a} ambitoDe={sinReservas} />);
    fireEvent.click(screen.getByRole("button", { name: /Río/ }));
    const leido = leerBloque(String(alElegir.mock.calls[0][0]));
    expect(leido.ok).toBe(true);
    if (leido.ok) expect([leido.valor.id, leido.valor.titulo, leido.valor.atomos[0].herramientaId]).toEqual(["m1", "Río", "sinte-web-audio"]);
  });
  it("sin ambitoDe usa el de la Biblioteca: una capa citada cuenta como personal", () => {
    const alElegir = vi.fn();
    const a = sembrar(almacenMemoria(), [molecula("m1", "Mural", "grupo", { tipo: "entity", id: "e1" })]);
    render(<SelectorMolecula ambitoPost="grupo" alElegir={alElegir} almacen={a} />);
    fireEvent.click(screen.getByRole("button", { name: /Mural/ }));
    expect(alElegir).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("La capa \"Base\" cita una entidad más reservada (personal)");
  });
  it("una molécula de la forma antigua se lista pero no se inserta, y dice por qué", () => {
    const alElegir = vi.fn();
    const antigua = { id: "v1", titulo: "Vieja", ambito: "publico", capas: [{ id: "c1", nombre: "Base" }], atomos: [{ id: "a1", capaId: "c1", tipo: "imagen" }], valores: {}, version: 1, creadaEn: 1, actualizadaEn: 2 };
    render(<SelectorMolecula ambitoPost="publica" alElegir={alElegir} almacen={sembrar(almacenMemoria(), [antigua])} />);
    fireEvent.click(screen.getByRole("button", { name: /Vieja/ }));
    expect(alElegir).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("formato antiguo");
  });
  it("el Lienzo registra el bloque «Protomolécula» y lo edita con este selector", () => {
    expect(NEW_BLOCK_DEFS.find((d) => d.type === "protomolecula")?.label).toBe("Protomolécula");
    render(<RichBlockEditor block={{ id: "b1", type: "protomolecula" }} patch={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Protomolécula" }).getAttribute("href")).toBe("/protomolecula");
  });
});
 
  it("should display loading state initially", () => {
    const { container } = render(<SelectorMolecula ambitoPost="personal" alElegir={vi.fn()} />);
    const element = screen.getByText(/Cargando tus moléculas\./i);
    expect(container.contains(element)).toBe(true);
  });

  it("should show error when storage is not available", async () => {
    const almacenModule = await import("@/lib/protomolecula/almacen-moleculas");
    const almacenNavegadorSpy = vi.spyOn(almacenModule, "almacenNavegador");
    almacenNavegadorSpy.mockReturnValue(null);
    const { container } = render(<SelectorMolecula ambitoPost="personal" alElegir={vi.fn()} />);
    const element = screen.getByText(
      /No se pudo leer el almacén de moléculas de este aparato: el navegador no deja usar su almacenamiento local./i
    );
    expect(container.contains(element)).toBe(true);
    almacenNavegadorSpy.mockRestore();
  });
  it("should call alElegir with serialized block when confirmed", () => {
    const alElegir = vi.fn();
    // We need a molecule with avisos
    const aWithAviso = sembrar(
      almacenMemoria(),
      [molecula("m1", "Mural", "grupo", { tipo: "entity", id: "e1" })]
    );
    render(
      <SelectorMolecula
        ambitoPost="publica"
        alElegir={alElegir}
        almacen={aWithAviso}
        ambitoDe={sinReservas}
      >
      </SelectorMolecula>
    );
    // Click the molecule button
    fireEvent.click(screen.getByRole("button", { name: /Mural/ }));
    // Wait for the pendiente to be set (the avisos to be shown)
    const alertElement = screen.getByRole("alert");
    expect(alertElement.textContent).toMatch(/Antes de insertar «Mural»/i);
    // Click the checkbox
    fireEvent.click(screen.getByRole("checkbox", { name: TEXTO_CONFIRMACION }));
    // Click the insert button
    fireEvent.click(screen.getByRole("button", { name: "Insertar instantánea" }));
    // Check that alElegir was called
    expect(alElegir).toHaveBeenCalledTimes(1);
    // Now, we need to check the argument: the serialized block
    // We can get the molecule from the storage and serialize it
    const stored = aWithAviso.getItem(PREFIJO_MOLECULA + "m1");
    const bruta = JSON.parse(stored);
    const s = serializarBloque(bruta);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(alElegir).toHaveBeenCalledWith(s.valor);
    }
  });

 
  describe("prepararMolecula", () => {
  it("si comprobar el ámbito falla, avisa como si fuese privada (exige confirmar)", () => {
    const a = sembrar(almacenMemoria(), [molecula("m1", "Mural", "grupo", { tipo: "entity", id: "e1" })]);
    const p = prepararMolecula(a, "m1", "grupo", () => { throw new Error("sin red"); });
    expect(p.ok && p.avisos[0]).toBe("No se pudo comprobar el ámbito de las capas citadas: trátalas como privadas.");
  });
  it("una molécula que ya no está da un motivo, no una excepción", () => {
    const p = prepararMolecula(almacenMemoria(), "nada", "publica", sinReservas);
    expect(p.ok === false && p.motivo).toContain("No se pudo leer esa molécula");
  });
});
