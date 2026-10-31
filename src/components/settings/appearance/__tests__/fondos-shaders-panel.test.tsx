/**
 * Pruebas del panel «Shaders y difuminado» (Ola 1018F · FSH1018K): catálogo por categoría sin cámara,
 * difuminado con sus modos, transformación y máscara, props del efecto, set en la Biblioteca con
 * carpeta a elegir y aplicar al alcance con neuronas. Todo por inyección: sin GPU, sin red, sin disco.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { AppearanceProvider } from "@/context/appearance-context";
import { FondosShadersPanel, type AplicarAlcanceDetalles } from "../fondos-shaders-panel";
import type { ShaderCatalog } from "@/lib/appearance/catalogo-shaders";
import type { DependenciasBiblioteca } from "@/lib/appearance/fondos-biblioteca";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

const CATALOGO: ShaderCatalog = {
  Geometría: [
    { name: "RejillaViva", category: "Geometría", description: "rejilla que late", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: { size: { type: "number", default: 12 } } },
    { name: "WebcamTexture", category: "Geometría", description: "vídeo de la cámara", requiereCamara: true, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
  ],
  Textura: [
    { name: "Granito", category: "Textura", description: "grano fino", requiereCamara: false, interactivo: false, necesitaHijo: false, pesado: false, props: {} },
  ],
};

const CAPA_SHADER: Partial<BackgroundLayer> = {
  id: "capa-shader", kind: "shader", name: "Shader · RejillaViva", visible: true, opacity: 0.9, blend: "screen",
  preset: { components: [{ type: "RejillaViva", props: { size: 12 } }] },
  transform: { x: 0.2, y: 0.3, escala: 0.8, rotacion: 15, ancho: 0.7, alto: 0.5 }, mascara: "ninguna",
};
const CAPA_DIFUSION: Partial<BackgroundLayer> = {
  id: "capa-difusion", kind: "difusion", visible: true, opacity: 1, blend: "normal",
  difusion: { modo: "desenfoque", desenfoquePx: 6, opacidad: 1, textura: "grano" },
  transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 }, mascara: "ninguna",
};

type CapaGuardada = { kind: string; id: string; mascara?: string; transform?: { escala: number }; difusion?: { modo: string; tono?: string }; preset?: { components: Array<{ type: string; props: Record<string, unknown> }> } };

const sembrar = (capas: Partial<BackgroundLayer>[]): void => {
  localStorage.setItem("appearance-config-v2", JSON.stringify({ background: { type: "spline", layers: capas, layersVersion: 4 } }));
};

const capasGuardadas = async (ts: number = 0): Promise<CapaGuardada[]> => {
  return await waitFor(() => {
    const bruto = localStorage.getItem("appearance-config-v2");
    expect(bruto).not.toBeNull();
    const capas = (JSON.parse(bruto ?? "{}") as { background?: { layers?: CapaGuardada[] } }).background?.layers ?? [];
    if (ts > 0 && capas.length < ts) throw new Error("aún sin capas nuevas");
    return capas;
  });
};

const pintar = (extra: Partial<ComponentProps<typeof FondosShadersPanel>> = {}): void => {
  render(<AppearanceProvider><FondosShadersPanel catalogo={CATALOGO} {...extra} /></AppearanceProvider>);
};

describe("FondosShadersPanel (editor de capas con shaders y difuminado)", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("busca por nombre (imposible la cámara) y añade el efecto como capa shader", async () => {
    sembrar([]);
    pintar();
    fireEvent.change(screen.getByLabelText(/Buscar efecto en el catálogo/i), { target: { value: "granito" } });
    expect(screen.getByText("Granito")).toBeInTheDocument();
    expect(screen.queryByText("WebcamTexture")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Añadir capa shader con el efecto Granito/i));
    const capas = await capasGuardadas(1);
    const nueva = capas.find((c) => c.kind === "shader");
    expect(nueva?.preset?.components[0]?.type).toBe("Granito");
  });

  it("añade la capa de difuminado y le cambia el modo y el tono", async () => {
    sembrar([]);
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /capa de difuminado/i }));
    // La capa recién añadida abre su editor sola
    fireEvent.change(screen.getByLabelText(/Modo del difuminado/i), { target: { value: "tono" } });
    expect(screen.getByLabelText(/Color del tono/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Color del tono/i), { target: { value: "#1010ff" } });
    const capas = await capasGuardadas(1);
    const dif = capas.find((c) => c.kind === "difusion")?.difusion;
    expect(dif?.modo).toBe("tono");
    expect(dif?.tono).toBe("#1010ff");
  });

  it("edita transformación y máscara de la capa shader elegida", async () => {
    sembrar([CAPA_SHADER, CAPA_DIFUSION]);
    pintar();
    fireEvent.click(screen.getByLabelText(/Editar la capa Shader/i));
    fireEvent.change(screen.getByLabelText(/Máscara de la capa/i), { target: { value: "radial" } });
    fireEvent.change(screen.getByLabelText("Escala"), { target: { value: "0.25" } });
    const capas = await capasGuardadas();
    const l = capas.find((c) => c.id === "capa-shader");
    expect(l?.mascara).toBe("radial");
    expect(l?.transform?.escala).toBe(0.25);
  });

  it("deja ajustar los props del efecto según el catálogo", async () => {
    sembrar([CAPA_SHADER]);
    pintar();
    fireEvent.click(screen.getByLabelText(/Editar la capa Shader/i));
    const ajuste = screen.getByLabelText(/Ajuste size del efecto/i);
    expect(ajuste).toHaveValue("12");
    fireEvent.change(ajuste, { target: { value: "30" } });
    const capas = await capasGuardadas();
    expect(capas.find((c) => c.id === "capa-shader")?.preset?.components[0]?.props?.size).toBe(30);
  });

  it("guarda la pila como set en la carpeta elegida de la biblioteca", async () => {
    sembrar([CAPA_SHADER, CAPA_DIFUSION]);
    let guardado: { nombre?: string; carpetaId: string | null | undefined } | null = null;
    const deps: DependenciasBiblioteca = {
      listar: async () => ({ items: [], folders: [{ id: "f-obra", name: "Obra", parentId: "raiz", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "u1" }], rev: 0, updatedAt: "", version: 3, deletedItems: {}, deletedFolders: {} }),
      crearCarpeta: async () => "nueva",
      guardar: async (_ref, item, folderId) => { guardado = { nombre: item.title, carpetaId: folderId }; return { ok: true, id: "item-1" }; },
      mover: async () => {},
      quitar: async () => {},
    };
    pintar({ deps, destinoRef: { kind: "user", id: "u1" }, destinoLabel: "Mi biblioteca" });
    fireEvent.change(screen.getByLabelText("Nombre del set de fondo"), { target: { value: "Fondo de prueba" } });
    await screen.findByText("Obra"); // la carpeta llega del listar; sin opción, el select descarta el valor
    fireEvent.change(screen.getByLabelText(/Carpeta del set/i), { target: { value: "f-obra" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar como set" }));
    await waitFor(() => expect(guardado).not.toBeNull());
    expect(guardado).toMatchObject({ nombre: "Fondo de prueba", carpetaId: "f-obra" });
  });

  it("aplica la pila al alcance elegido (perfil por defecto) y a las neuronas marcadas", async () => {
    sembrar([CAPA_SHADER, CAPA_DIFUSION]);
    const llamadas: AplicarAlcanceDetalles[] = [];
    pintar({ onAplicarAlcance: (d) => llamadas.push(d), neuronas: ["n-a", "n-b"], perfilId: "p-1" });
    fireEvent.click(screen.getByRole("button", { name: "Página" }));
    fireEvent.change(screen.getByLabelText("Clave del alcance"), { target: { value: "/hub" } });
    fireEvent.click(screen.getByRole("button", { name: "Elegidas" }));
    fireEvent.click(screen.getByLabelText("n-a"));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar al alcance" }));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].ambito).toBe("pagina");
    expect(llamadas[0].clave).toBe("/hub");
    expect(llamadas[0].neuronas).toBe("elegidas");
    expect(llamadas[0].elegidas).toEqual(["n-a"]);
    expect(llamadas[0].set.capas.map((c) => c.id)).toContain("capa-shader");
    // «Perfil» cae al perfil activo cuando nadie teclea otra clave
    fireEvent.click(screen.getByRole("button", { name: "Perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar al alcance" }));
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].ambito).toBe("perfil");
    expect(llamadas[1].clave).toBe("p-1");
  });
});
