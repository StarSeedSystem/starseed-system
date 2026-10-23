import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { serializarBloque } from "@/lib/protomolecula/bloque-protomolecula";
import { PREFIJO_MOLECULA, type AlmacenLocal } from "@/lib/protomolecula/almacen-moleculas";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { VistaBloqueProtomolecula, copiaPropia } from "../vista-bloque";

afterEach(() => {
  cleanup();
  push.mockReset();
});

const MOL: Molecula = {
  id: "mol-original",
  titulo: "Paisaje sonoro",
  ambito: "publica",
  capas: [
    { id: "c2", tipo: "grafo-audio", titulo: "Audio", formato: "grafo", referencia: { tipo: "pista", id: "p1" }, orden: 1, visible: true, bloqueada: false },
    { id: "c1", tipo: "lienzo2d", titulo: "Fondo", formato: "svg", referencia: null, orden: 0, visible: true, bloqueada: false },
  ],
  atomos: [{ id: "a1", herramientaId: "reverb", capaId: "c2", estado: "activo" }],
  valores: { "a1::mezcla": 42.5, "a1::activa": true },
  version: 7,
  creadaEn: 1,
  actualizadaEn: 2,
};

const DEF: DefinicionAtomo = {
  herramientaId: "reverb",
  nombre: "Reverberación",
  categoria: "audio" as DefinicionAtomo["categoria"],
  integracion: "libreria-js" as DefinicionAtomo["integracion"],
  control: "total",
  parametros: [
    { id: "mezcla", nombre: "Mezcla", tipo: "numero", min: 0, max: 100, unidad: "%" },
    { id: "activa", nombre: "Activa", tipo: "booleano" },
  ],
  entradas: [],
  salidas: [],
};

const texto = (m: Molecula = MOL): string => {
  const r = serializarBloque(m);
  if (!r.ok) throw new Error(r.motivo);
  return r.valor;
};

function almacenFalso(): AlmacenLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

const buscar = (id: string) => (id === "reverb" ? DEF : undefined);

describe("VistaBloqueProtomolecula", () => {
  it("con un bloque válido pinta la tarjeta: título, ámbito y capas en su orden", () => {
    render(<VistaBloqueProtomolecula texto={texto()} buscarAtomo={buscar} />);
    expect(screen.getByText("Paisaje sonoro")).toBeTruthy();
    expect(screen.getByText("Pública")).toBeTruthy();
    const capas = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(capas[0]).toContain("Fondo");
    expect(capas[1]).toContain("Audio");
  });

  it("los valores salen formateados con su unidad", () => {
    render(<VistaBloqueProtomolecula texto={texto()} buscarAtomo={buscar} />);
    expect(screen.getByText("Reverberación")).toBeTruthy();
    expect(screen.getByText("42,5 %")).toBeTruthy();
    expect(screen.getByText("activado")).toBeTruthy();
  });

  it("con JSON basura pinta el aviso y el motivo", () => {
    render(<VistaBloqueProtomolecula texto="{basura" />);
    expect(screen.getByText("Esta molécula no se puede mostrar")).toBeTruthy();
    expect(screen.getByText(/JSON no válido/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("con una versión desconocida pinta el motivo", () => {
    render(<VistaBloqueProtomolecula texto={JSON.stringify({ pm: 99, molecula: MOL })} />);
    expect(screen.getByText(/versión no soportada/)).toBeTruthy();
  });

  it("«Abrir copia propia» guarda una copia con id nuevo y navega a ella; la original queda intacta", () => {
    const almacen = almacenFalso();
    const navegar = vi.fn();
    const t = texto();
    render(<VistaBloqueProtomolecula texto={t} almacen={almacen} navegar={navegar} nuevoId={() => "mol-copia"} buscarAtomo={buscar} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir copia propia" }));
    expect(navegar).toHaveBeenCalledWith("/protomolecula?molecula=mol-copia");
    expect(almacen.datos.has(PREFIJO_MOLECULA + "mol-original")).toBe(false);
    const guardada = JSON.parse(almacen.datos.get(PREFIJO_MOLECULA + "mol-copia") ?? "null") as Molecula;
    expect(guardada.id).toBe("mol-copia");
    expect(guardada.valores).toEqual(MOL.valores);
    expect(guardada.version).toBe(1);
    expect(t).toBe(texto());
    expect(MOL.id).toBe("mol-original");
  });

  it("sin almacén local no navega y lo dice", () => {
    const navegar = vi.fn();
    render(<VistaBloqueProtomolecula texto={texto()} almacen={null} navegar={navegar} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir copia propia" }));
    expect(navegar).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/no se pudo guardar la copia/);
  });

  it("sin navegar inyectado usa el router de Next", () => {
    render(<VistaBloqueProtomolecula texto={texto()} almacen={almacenFalso()} nuevoId={() => "x1"} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir copia propia" }));
    expect(push).toHaveBeenCalledWith("/protomolecula?molecula=x1");
  });

  it("copiaPropia no comparte objetos con la original", () => {
    const c = copiaPropia(MOL, "otra", 10);
    c.valores["a1::mezcla"] = 0;
    c.capas[0].titulo = "cambiada";
    expect(MOL.valores["a1::mezcla"]).toBe(42.5);
    expect(MOL.capas[0].titulo).toBe("Audio");
    expect(c.creadaEn).toBe(10);
  });
});
