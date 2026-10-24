import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TarjetaVariacion,
  siguienteEstado,
  deshaceAlCerrar,
  diagnosticar,
  vistaPreviaTexto,
  enlaceSeguroTexto,
  type AccionEstado,
  type EstadoPrueba,
} from "../tarjeta-variacion";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import type { Variacion } from "@/lib/variaciones/orden";

// Pruebas de la tarjeta de variación (Ola 1019V · tarea P · contrato §4):
// núcleo puro entrada → salida, sin red ni disco, y render con adaptador y
// paneles de cuenta Inyectables (panelesCompartidos=false).

afterEach(cleanup);

function v(id: string, titulo: string, extra: Partial<Variacion> = {}): Variacion {
  return {
    id, titulo, descripcion: `${titulo}: descripción`, version: "1.0.0", familia: "widget",
    licencia: "MIT", etiquetas: ["cristal"], creado: new Date("2026-10-01T00:00:00Z"),
    descargas: 3, valoracionMedia: 4.5, valoracionCount: 8, ...extra,
  };
}

interface CopiaAplicador { aplicados: unknown[]; deshechos: number }
function adaptadorDePrueba(copia: CopiaAplicador, valido = true): AdaptadorFamilia<unknown> {
  return {
    familia: "widget", nombre: "widget",
    capturar: () => null,
    validar: (p) => (valido ? { ok: true as const, payload: p } : { ok: false as const, motivos: ["La familia no acepta este"] }),
    aplicar: (clave, payload) => {
      copia.aplicados.push([clave, payload]);
      return { deshacer: () => { copia.deshechos += 1; } };
    },
  };
}

describe("siguienteEstado (máquina Probar · Aplicar · Deshacer)", () => {
  const transita = (e: EstadoPrueba, a: AccionEstado) => siguienteEstado(e, a);
  it("Probar entra a probando y pulsar de nuevo deshace la prueba", () => {
    expect(transita("inactiva", "probar")).toBe("probando");
    expect(transita("probando", "probar")).toBe("inactiva");
    expect(transita("aplicada", "probar")).toBe("probando");
  });
  it("Aplicar parte de inactiva, consolida la prueba viva y no repite si ya está", () => {
    expect(transita("inactiva", "aplicar")).toBe("aplicada");
    expect(transita("probando", "aplicar")).toBe("aplicada");
    expect(transita("aplicada", "aplicar")).toBe("aplicada");
  });
  it("Deshacer siempre vuelve a inactiva", () => {
    for (const estado of ["inactiva", "probando", "aplicada"] as EstadoPrueba[]) {
      expect(transita(estado, "deshacer")).toBe("inactiva");
    }
  });
  it("al cerrar se deshace solo la prueba, no lo aplicado", () => {
    expect(deshaceAlCerrar("probando")).toBe(true);
    expect(deshaceAlCerrar("aplicada")).toBe(false);
    expect(deshaceAlCerrar("inactiva")).toBe(false);
  });
});

describe("vistaPreviaTexto y enlaceSeguroTexto", () => {
  it("usa la vista previa del adaptador y, si revienta, cae al JSON del payload", () => {
    expect(vistaPreviaTexto({ a: 1 }, () => "paleta clara")).toBe("paleta clara");
    expect(vistaPreviaTexto({ b: 2 }, () => { throw new Error("no"); })).toBe('{"b":2}');
  });
  it("avisa con honestidad cuando no hay nada que previsualizar o la variación no vale", () => {
    expect(vistaPreviaTexto(null)).toContain("no trae payload");
    expect(vistaPreviaTexto({ a: 1 }, undefined, true)).toContain("Nada se ejecuta sin validar");
  });
  it("recorta el JSON largo a 140 caracteres y cierra con puntos suspensivos", () => {
    const largo = vistaPreviaTexto({ texto: "x".repeat(200) });
    expect(largo).toHaveLength(140);
    expect(largo.slice(-1)).toBe("…");
  });
  it("«Ver origen» solo con https", () => {
    expect(enlaceSeguroTexto("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(enlaceSeguroTexto("http://inseguro.test/x")).toBe(null);
    expect(enlaceSeguroTexto(undefined)).toBe(null);
  });
});

describe("TarjetaVariacion (render con adaptador y paneles inyectados)", () => {
  const base = { clave: "widget:clima", panelesCompartidos: false };
  const copia = (): CopiaAplicador => ({ aplicados: [], deshechos: 0 });

  it("muestra título, licencia, valoración, vista previa y botones, y sin enlace no trae Ver origen", () => {
    render(<TarjetaVariacion {...base} variacion={v("1", "Cristal suave")} payload={{ blur: 12 }} adaptador={adaptadorDePrueba(copia())} />);
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText(/4\.5 \(8\)/)).toBeTruthy();
    expect(screen.getByTestId("vista-previa").textContent).toContain('{"blur":12}');
    expect(screen.getByRole("button", { name: "Probar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Compartir/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ver origen/ })).toBeNull();
  });

  it("sin payload los botones van desactivados y dan el motivo a la vista", () => {
    render(
      <TarjetaVariacion {...base} variacion={v("1", "Sin payload")} payload={undefined} adaptador={adaptadorDePrueba(copia())} />,
    );
    expect(screen.getByText(/no trae payload/)).toBeTruthy();
    expect(screen.getByTestId("vista-previa").textContent).toContain("Nada se ejecuta sin validar");
    expect(screen.getByRole("button", { name: "Probar" }).hasAttribute("disabled")).toBe(true);
  });

  it("Probar aplica en vivo, pulsar de nuevo deshace, y Aplicar deja el Deshacer visible", () => {
    const copiaA = copia();
    const adaptador = adaptadorDePrueba(copiaA);
    render(<TarjetaVariacion {...base} variacion={v("1", "Cristal suave")} payload={{ blur: 12 }} adaptador={adaptador} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(copiaA.aplicados).toHaveLength(1);
    expect(screen.getByTestId("estado-prueba").textContent).toBe("probando…");
    fireEvent.click(screen.getByRole("button", { name: "Quitar prueba" }));
    expect(copiaA.deshechos).toBe(1);
    expect(screen.getByTestId("estado-prueba").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByTestId("estado-prueba").textContent).toBe("aplicada");
    expect(copiaA.aplicados).toHaveLength(2);
    expect(copiaA.deshechos).toBe(1);
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(copiaA.deshechos).toBe(2);
    expect(screen.getByTestId("estado-prueba").textContent).toBe("");
  });

  it("al cerrar la ventana se deshace la prueba en curso", () => {
    const copiaB = copia();
    const ren = render(<TarjetaVariacion {...base} variacion={v("1", "Cristal suave")} payload={{ blur: 12 }} adaptador={adaptadorDePrueba(copiaB)} abierta />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(copiaB.aplicados).toHaveLength(1);
    ren.rerender(<TarjetaVariacion {...base} variacion={v("1", "Cristal suave")} payload={{ blur: 12 }} adaptador={adaptadorDePrueba(copiaB)} abierta={false} />);
    expect(copiaB.deshechos).toBe(1);
    expect(screen.getByTestId("estado-prueba").textContent).toBe("");
  });

  it("las variaciones de código piden confirmación y solo después corren", () => {
    const copiaC = copia();
    render(<TarjetaVariacion {...base} variacion={v("1", "Código vivo")} payload={{ html: "<marquee>hola</marquee>" }} adaptador={adaptadorDePrueba(copiaC)} />);
    expect(screen.getByText(/pide confirmación/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Probar" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("estado-prueba")?.textContent).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aislado" }));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(copiaC.aplicados).toHaveLength(1);
  });

  it("una variación que la familia rechaza no se prueba ni se aplica", () => {
    const copiaD = copia();
    render(<TarjetaVariacion {...base} variacion={v("1", "Rara")} payload={{ rara: true }} adaptador={adaptadorDePrueba(copiaD, false)} />);
    expect(screen.getByText("La familia no acepta este")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("vista-previa").textContent).toContain("Nada se ejecuta sin validar");
  });

  it("Ver origen solo aparece con enlace https y valora con cinco estrellas", () => {
    const valorar = vi.fn();
    render(
      <TarjetaVariacion {...base} variacion={v("1", "Cristal suave")} payload={{ blur: 12 }} adaptador={adaptadorDePrueba(copia())}
        enlaceOrigen="https://starseed-os.vercel.app/library" deVariacion="v-09" miValoracion={3} onValorar={valorar} />,
    );
    const enlace = screen.getByRole("link", { name: /Ver origen/ });
    expect(enlace.getAttribute("href")).toBe("https://starseed-os.vercel.app/library");
    expect(enlace.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(/Deriva de la variación/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Valorar/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Valorar 5" }));
    expect(valorar).toHaveBeenCalledWith(5);
  });
});

const LO_MIRA = (p: unknown) => ({ ok: true as const, payload: p });
const LO_RECHAZA = (p: unknown) => ({ ok: false as const, motivos: ["La familia no vale este"] });

describe("diagnosticar (nada se ejecuta sin validar)", () => {
  it("pasa un payload simple y no lo marca aislado", () => {
    const r = diagnosticar({ blur: 12 }, LO_MIRA);
    expect(r.ok).toBe(true);
    expect(r.aislado).toBe(false);
    expect(r.motivos).toEqual([]);
  });
  it("une los motivos de la familia y del validador común", () => {
    const privada = diagnosticar({ apiKey: "...oprueba..." }, LO_RECHAZA);
    expect(privada.ok).toBe(false);
    expect(privada.motivos).toContainEqual(expect.stringContaining("La familia no vale este"));
    expect(privada.motivos).toEqual(expect.arrayContaining([expect.stringContaining("Privacidad")]));
  });
  it("sin familia validadora ni payload, nada se ejecuta", () => {
    const sinFamilia = diagnosticar({ x: 1 });
    expect(sinFamilia.ok).toBe(false);
    expect(sinFamilia.motivos[0]).toContain("no declara un validador");
    const sinPayload = diagnosticar(undefined, LO_MIRA);
    expect(sinPayload.ok).toBe(false);
    expect(sinPayload.motivos[0]).toContain("no trae payload");
  });
  it("un payload con código se marca aislado aunque valide", () => {
    const r = diagnosticar({ html: "<marquee>hola</marquee>" }, LO_MIRA);
    expect(r.ok).toBe(true);
    expect(r.aislado).toBe(true);
  });
});
