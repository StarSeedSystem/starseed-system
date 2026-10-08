/*
 * Pruebas del DirectorioEstaciones (ES1010J): mezcla y orden, chips de tipo,
 * búsqueda, ocultas fuera, la malla caída no rompe y estado vacío honesto.
 * Los módulos de datos/malla/internas/realtime están mockeados (sin red).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Estacion } from "@/lib/estaciones/tipos";

const AHORA = Date.now();

const estado = vi.hoisted(() => ({
  tabla: [] as Estacion[],
  internas: [] as Estacion[],
  faros: [] as unknown[],
  tipoUrl: null as string | null,
  ocultas: [] as string[],
  falloMalla: false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "tipo" ? estado.tipoUrl : null) }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/realtime/realtime", () => ({
  useRealtimeRows: () => ({ rows: estado.tabla, loading: false, reload: async () => {} }),
}));
vi.mock("@/lib/estaciones/datos", () => ({
  listarEstaciones: async () => estado.tabla,
  ocultasLocales: () => new Set(estado.ocultas),
  ocultarLocal: vi.fn(),
}));
vi.mock("@/lib/estaciones/internas", () => ({
  estacionesInternas: async () => estado.internas,
}));
vi.mock("@/lib/estaciones/malla", () => ({
  estacionesDeFaros: (items: unknown[]) => items,
}));
vi.mock("@/ai/astraura/mesh/server-relay", () => ({
  pullPublicFeed: async () => {
    if (estado.falloMalla) throw new Error("malla caída");
    return { items: estado.faros, next: { atIso: "", id: "" } };
  },
}));

import { DirectorioEstaciones, mezclarFilas } from "../directorio-estaciones";

function base(parche: Partial<Estacion> = {}): Estacion {
  return {
    id: "b1", owner_id: "u1", ambito_tipo: "persona", entidad_ref: null,
    titulo: "Radio libre", descripcion: "", tipo: "audio", fuente: "enlace",
    enlace: "https://ejemplo.org/stream", formato: "audio", imagen: null,
    idioma: "es", categorias: ["musica"], licencia: "cc-by", visibilidad: "publica",
    empieza_en: null, termina_en: null,
    ultimo_latido: new Date(AHORA - 30_000).toISOString(),
    pausada: false, en_malla: false, espectadores: 5,
    created_at: new Date(AHORA - 3600_000).toISOString(),
    updated_at: new Date(AHORA - 3600_000).toISOString(),
    ...parche,
  };
}

afterEach(cleanup);
beforeEach(() => {
  estado.tabla = []; estado.internas = []; estado.faros = [];
  estado.tipoUrl = null; estado.ocultas = []; estado.falloMalla = false;
});

function titulosRejilla(): string[] {
  const rejilla = screen.queryByLabelText("Todas las estaciones");
  if (!rejilla) return [];
  return Array.from(rejilla.querySelectorAll("h3")).map((h) => h.textContent ?? "");
}

describe("mezclarFilas (pura)", () => {
  it("no repite ids y quita las ocultas", () => {
    const oida = { id: "b1", titulo: "Duplicada", tipo: "audio" as const, enlace: "https://x.org", oidaPorMalla: true as const };
    const out = mezclarFilas([base(), base({ id: "b2", titulo: "Oculta" })], [], [oida], new Set(["b2"]));
    expect(out.map((e) => e.id)).toEqual(["b1"]);
  });
});

describe("DirectorioEstaciones", () => {
  it("mezcla tabla, internas y malla ordenadas (en directo y espectadores primero)", async () => {
    estado.tabla = [
      base({ id: "b1", titulo: "Poca gente", espectadores: 1 }),
      base({ id: "b2", titulo: "Muy vista", espectadores: 99 }),
    ];
    estado.internas = [base({ id: "interna:x", titulo: "Servidor público", fuente: "starseed", enlace: "/servidores-apps" })];
    estado.faros = [{ id: "m1", titulo: "Oída por malla", tipo: "video", enlace: "https://malla.org/v", oidaPorMalla: true }];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toHaveLength(4));
    expect(titulosRejilla()[0]).toBe("Muy vista");
    expect(screen.getByRole("heading", { name: "Estaciones · en directo ahora" })).toBeTruthy();
    expect(screen.getByLabelText("En directo ahora")).toBeTruthy();
    expect(screen.getAllByText("malla").length).toBeGreaterThan(0);
  });

  it("los chips de tipo filtran y «Todas» resetea", async () => {
    estado.tabla = [base({ id: "b1", tipo: "audio" }), base({ id: "b2", titulo: "Vídeo libre", tipo: "video" })];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /^Vídeo$/ }));
    expect(titulosRejilla()).toEqual(["Vídeo libre"]);
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(titulosRejilla()).toHaveLength(2);
  });

  it("la búsqueda filtra por título sin acentos", async () => {
    estado.tabla = [base({ id: "b1", titulo: "Radio libre", categorias: [] }), base({ id: "b2", titulo: "Música andina", categorias: [] })];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Buscar estaciones"), { target: { value: "musica" } });
    expect(titulosRejilla()).toEqual(["Música andina"]);
  });

  it("las ocultas locales no aparecen", async () => {
    estado.tabla = [base({ id: "b1" }), base({ id: "b2", titulo: "Oculta" })];
    estado.ocultas = ["b2"];
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toHaveLength(1));
    expect(screen.queryByText("Oculta")).toBeNull();
  });

  it("categorías populares filtran al pulsar", async () => {
    estado.tabla = [
      base({ id: "b1", categorias: ["ambient"] }),
      base({ id: "b2", titulo: "Noticias", categorias: ["prensa"] }),
    ];
    render(<DirectorioEstaciones />);
    await waitFor(() => screen.getByRole("button", { name: "#ambient" }));
    fireEvent.click(screen.getByRole("button", { name: "#ambient" }));
    expect(titulosRejilla()).toEqual(["Radio libre"]);
  });

  it("el fallo de la malla no rompe el directorio", async () => {
    estado.tabla = [base()];
    estado.falloMalla = true;
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toEqual(["Radio libre"]));
  });

  it("estado vacío honesto y botones de cabecera", async () => {
    const onPublicar = vi.fn();
    render(<DirectorioEstaciones onPublicar={onPublicar} />);
    await waitFor(() => screen.getByText("Aún no hay estaciones de este tipo: publica la primera"));
    fireEvent.click(screen.getByRole("button", { name: /Publicar estación/ }));
    expect(onPublicar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Abrir el estudio/ }).getAttribute("href")).toBe("/estaciones/estudio");
  });

  it("lee el tipo inicial del prop y de ?tipo=", async () => {
    estado.tabla = [base({ id: "b1", tipo: "audio" }), base({ id: "b2", titulo: "Vídeo", tipo: "video" })];
    const r1 = render(<DirectorioEstaciones inicial={{ tipo: "video" }} />);
    await waitFor(() => expect(titulosRejilla()).toEqual(["Vídeo"]));
    r1.unmount();
    estado.tabla = [base({ id: "b1", tipo: "audio" }), base({ id: "b2", titulo: "Vídeo", tipo: "video" })];
    estado.tipoUrl = "audio";
    render(<DirectorioEstaciones />);
    await waitFor(() => expect(titulosRejilla()).toEqual(["Radio libre"]));
  });
});
