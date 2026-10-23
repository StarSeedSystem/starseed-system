import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { serializarBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { cargarMolecula, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import { limpiarRegistro, registrarAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

import { VistaBloqueProtomolecula, copiaPropia } from "../vista-bloque";

function almacenFalso(): AlmacenLocal {
  const datos = new Map<string, string>();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

const MOL: Molecula = {
  id: "mol-original",
  titulo: "Voz con eco",
  ambito: "publica",
  capas: [{ id: "c1", tipo: "grafo-audio", titulo: "Pista de voz", formato: "webaudio", referencia: null, orden: 0, visible: true, bloqueada: false }],
  atomos: [
    { id: "a1", herramientaId: "prueba.reverb", titulo: "Reverb de la voz", estado: "activo" },
    { id: "a2", herramientaId: "desconocida.x", estado: "activo" },
  ],
  valores: { "a1::mezcla": 42.5, "a1::encendido": true, "a2::nivel": 3 },
  version: 7,
  creadaEn: 1,
  actualizadaEn: 2,
};

function textoDe(m: Molecula): string {
  const r = serializarBloque(m);
  if (!r.ok) throw new Error(r.motivo);
  return r.valor;
}

beforeEach(() => {
  push.mockReset();
  limpiarRegistro();
  registrarAtomo({
    herramientaId: "prueba.reverb",
    nombre: "Reverb",
    categoria: "audio", integracion: "libreria-js", control: "total",
    parametros: [
      { id: "mezcla", nombre: "Mezcla", tipo: "numero", min: 0, max: 100, unidad: "%" },
      { id: "encendido", nombre: "Encendido", tipo: "booleano" },
    ],
    entradas: [], salidas: [],
  });
});
afterEach(() => { cleanup(); limpiarRegistro(); });

describe("VistaBloqueProtomolecula", () => {
  it("con un texto válido pinta la tarjeta: título, ámbito y capas", () => {
    render(<VistaBloqueProtomolecula texto={textoDe(MOL)} almacen={almacenFalso()} />);
    expect(screen.getByText("Voz con eco")).toBeTruthy();
    expect(screen.getByText("Pública")).toBeTruthy();
    expect(screen.getByText(/Pista de voz · grafo-audio/)).toBeTruthy();
    expect(screen.getByText("Reverb de la voz")).toBeTruthy();
  });

  it("los valores salen con su unidad, formateados por el núcleo", () => {
    render(<VistaBloqueProtomolecula texto={textoDe(MOL)} almacen={almacenFalso()} />);
    expect(screen.getByText("42,5 %")).toBeTruthy();
    expect(screen.getByText("activado")).toBeTruthy();
  });

  it("una herramienta que esta neurona no conoce enseña sus valores en crudo", () => {
    render(<VistaBloqueProtomolecula texto={textoDe(MOL)} almacen={almacenFalso()} />);
    expect(screen.getByText("desconocida.x")).toBeTruthy();
    expect(screen.getByText("nivel")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("con JSON basura pinta el aviso y el motivo", () => {
    render(<VistaBloqueProtomolecula texto="{no es json" almacen={almacenFalso()} />);
    expect(screen.getByText("Esta molécula no se puede mostrar")).toBeTruthy();
    expect(screen.getByText(/JSON no válido/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("con una versión desconocida dice cuál", () => {
    render(<VistaBloqueProtomolecula texto={JSON.stringify({ pm: 99, molecula: MOL })} />);
    expect(screen.getByText(/versión no soportada: 99/)).toBeTruthy();
  });

  it("«Abrir copia propia» guarda una copia con id nuevo, deja la original intacta y navega", () => {
    const almacen = almacenFalso();
    const texto = textoDe(MOL);
    render(<VistaBloqueProtomolecula texto={texto} almacen={almacen} nuevoId={() => "copia-1"} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir copia propia" }));
    const copia = cargarMolecula(almacen, "copia-1") as Molecula | null;
    expect(copia?.id).toBe("copia-1");
    expect(copia?.valores).toEqual(MOL.valores);
    expect(cargarMolecula(almacen, "mol-original")).toBeNull();
    expect(texto).toBe(textoDe(MOL));
    expect(MOL.id).toBe("mol-original");
    expect(push).toHaveBeenCalledWith("/protomolecula?molecula=copia-1");
  });

  it("si el almacén no acepta la copia lo dice y no navega", () => {
    render(<VistaBloqueProtomolecula texto={textoDe(MOL)} almacen={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir copia propia" }));
    expect(screen.getByText(/No se pudo guardar la copia/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("copiaPropia clona en profundidad y reinicia la versión", () => {
    const c = copiaPropia(MOL, "nuevo", 100);
    expect(c.id).toBe("nuevo");
    expect(c.version).toBe(1);
    c.valores["a1::mezcla"] = 0;
    expect(MOL.valores["a1::mezcla"]).toBe(42.5);
  });
});
