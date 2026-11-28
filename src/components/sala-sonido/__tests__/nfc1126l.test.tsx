/**
 * NFC1126L · Sala de sonido compartida — interfaz (parte 3 de 3).
 * Contrato: architecture/nfc-neuronas.md §11.
 *
 * Prueba la costura pública del mezclador: lo que se ve (fuentes, cola,
 * quién controla, visibilidad), qué se puede tocar y qué avisa a la sala.
 * Sin red, sin disco y sin procesos: todo entra por props.
 */
// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import {
  MezcladorSalaSonido,
  type ColaItem,
  type EstadoSala,
  type FuenteAudio,
} from "../mezclador";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

function fuente(extra: Partial<FuenteAudio> & Pick<FuenteAudio, "id" | "nombre">): FuenteAudio {
  return {
    tipo: "archivo",
    neuronaId: "n1",
    neuronaNombre: "Luna",
    nivel: 0.5,
    ecualizador: { graves: 0, medios: 0, agudos: 0 },
    limitador: 0.5,
    muted: false,
    solo: false,
    reproduciendo: false,
    duracion: 180,
    posicion: 30,
    ...extra,
  };
}

function pista(extra: Partial<ColaItem> & Pick<ColaItem, "id" | "titulo">): ColaItem {
  return {
    fuenteId: "f1",
    duracion: 180,
    añadidoPor: "n1",
    orden: 1,
    ...extra,
  };
}

const altavoz = fuente({ id: "f1", nombre: "Altavoz del salón", tipo: "app", neuronaId: "n1", neuronaNombre: "Luna", reproduciendo: true });
const movil = fuente({ id: "f2", nombre: "Móvil de Ana", tipo: "biblioteca", neuronaId: "n2", neuronaNombre: "Ana" });

const enCurso = pista({ id: "c1", titulo: "Amanecer", artista: "Semilla", añadidoPor: "n1", orden: 1 });
const siguiente = pista({ id: "c2", titulo: "Marea", añadidoPor: "n2", orden: 2 });

function estado(extra: Partial<EstadoSala> = {}): EstadoSala {
  return {
    fuentes: [altavoz, movil],
    cola: [enCurso, siguiente],
    reproduciendo: enCurso,
    modoControl: "una",
    neuronasControladoras: ["n1"],
    visibilidad: "sala",
    neuronaActual: "n1",
    ...extra,
  };
}

function pintar(extra: Partial<EstadoSala> = {}) {
  const props = {
    estado: estado(extra),
    onCambiarNivel: vi.fn(),
    onCambiarEcualizador: vi.fn(),
    onCambiarLimitador: vi.fn(),
    onToggleMuted: vi.fn(),
    onToggleSolo: vi.fn(),
    onCambiarModoControl: vi.fn(),
    onCambiarVisibilidad: vi.fn(),
    onAñadirACola: vi.fn(),
    onQuitarDeCola: vi.fn(),
    onReordenarCola: vi.fn(),
    onReproducirSiguiente: vi.fn(),
    onDetener: vi.fn(),
  };
  const utilidades = render(
    <AppearanceProvider>
      <MezcladorSalaSonido {...props} />
    </AppearanceProvider>,
  );
  return { ...utilidades, props };
}

describe("NFC1126L · sala de sonido en pantalla", () => {
  it("pinta la región, las fuentes, la cola común y quién controla", () => {
    pintar();
    const sala = screen.getByRole("region", { name: "Mezclador de la sala de sonido" });
    expect(sala).toBeInTheDocument();
    expect(within(sala).getByText("Altavoz del salón")).toBeInTheDocument();
    expect(within(sala).getByText("Móvil de Ana")).toBeInTheDocument();
    expect(within(sala).getByText("Cola común")).toBeInTheDocument();
    expect(within(sala).getByText("Quién controla")).toBeInTheDocument();
    expect(within(sala).getByText("Añadido por n1")).toBeInTheDocument();
    expect(within(sala).getByText("Añadido por n2")).toBeInTheDocument();
    expect(within(sala).getByRole("combobox", { name: "Modo de control de la sala" })).toBeInTheDocument();
    expect(within(sala).getByRole("combobox", { name: "Visibilidad de la sala" })).toBeInTheDocument();
  });

  it("sin fuentes ni cola explica cómo empezar", () => {
    pintar({ fuentes: [], cola: [], reproduciendo: null });
    expect(screen.getByText("No hay fuentes de audio en la sala")).toBeInTheDocument();
    expect(screen.getByText("La cola está vacía")).toBeInTheDocument();
    expect(screen.getByText("Añade audio desde archivos, la Biblioteca o apps")).toBeInTheDocument();
  });
});

describe("NFC1126L · cola común", () => {
  it("marca lo que suena y deja quitar solo lo que añadió la neurona actual", () => {
    const { props } = pintar();
    const enCursoAhora = screen
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("aria-current") === "true");
    expect(enCursoAhora).toBeDefined();
    expect(within(enCursoAhora as HTMLElement).getByText("Amanecer")).toBeInTheDocument();

    const quitarPropia = screen.getByRole("button", { name: 'Quitar "Amanecer" de la cola' });
    expect(screen.queryByRole("button", { name: 'Quitar "Marea" de la cola' })).not.toBeInTheDocument();

    fireEvent.click(quitarPropia);
    expect(props.onQuitarDeCola).toHaveBeenCalledWith("c1");
  });

  it("siguiente y detener avisan a la sala", () => {
    const { props } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Reproducir siguiente" }));
    expect(props.onReproducirSiguiente).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Detener reproducción" }));
    expect(props.onDetener).toHaveBeenCalledTimes(1);
  });
});

describe("NFC1126L · mezcla por fuente", () => {
  it("el nivel solo se mueve en las fuentes que controlan", () => {
    const { props } = pintar();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Nivel de Altavoz del salón" }), { key: "ArrowRight" });
    expect(props.onCambiarNivel).toHaveBeenCalledTimes(1);
    expect(props.onCambiarNivel).toHaveBeenCalledWith("f1", expect.any(Number));
    expect((props.onCambiarNivel as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeGreaterThan(0.5);

    fireEvent.keyDown(screen.getByRole("slider", { name: "Nivel de Móvil de Ana" }), { key: "ArrowRight" });
    expect(props.onCambiarNivel).toHaveBeenCalledTimes(1);
  });

  it("con modo «todas» cualquier fuente puede moverse", () => {
    const { props } = pintar({ modoControl: "todas", neuronasControladoras: [] });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Nivel de Móvil de Ana" }), { key: "ArrowRight" });
    expect(props.onCambiarNivel).toHaveBeenCalledWith("f2", expect.any(Number));
  });

  it("el limitador se ajusta y el ecualizador se despliega por fuente", () => {
    const { props } = pintar();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Limitador de Altavoz del salón" }), { key: "ArrowRight" });
    expect(props.onCambiarLimitador).toHaveBeenCalledWith("f1", expect.any(Number));

    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar ecualizador" })[0]);
    const eq = screen.getByRole("group", { name: "Ecualizador de Altavoz del salón" });
    expect(within(eq).getByRole("slider", { name: "Graves de Altavoz del salón" })).toBeInTheDocument();
    expect(within(eq).getByRole("slider", { name: "Medios de Altavoz del salón" })).toBeInTheDocument();
    expect(within(eq).getByRole("slider", { name: "Agudos de Altavoz del salón" })).toBeInTheDocument();

    fireEvent.keyDown(within(eq).getByRole("slider", { name: "Graves de Altavoz del salón" }), { key: "ArrowRight" });
    expect(props.onCambiarEcualizador).toHaveBeenCalledWith("f1", "graves", expect.any(Number));
  });

  it("silenciar y solo actúan sobre la fuente pulsada", () => {
    const { props } = pintar();
    fireEvent.click(screen.getAllByRole("button", { name: "Silenciar" })[1]);
    expect(props.onToggleMuted).toHaveBeenCalledWith("f2");
    fireEvent.click(screen.getAllByRole("button", { name: "Solo esta fuente" })[0]);
    expect(props.onToggleSolo).toHaveBeenCalledWith("f1");
  });
});

describe("NFC1126L · quién controla y visibilidad", () => {
  it("en modo «elegidas» marca las neuronas y permite alternarlas", () => {
    pintar({ modoControl: "elegidas", neuronasControladoras: ["n1"] });
    const luna = screen.getByRole("button", { name: "Luna" });
    const ana = screen.getByRole("button", { name: "Ana" });
    expect(luna).toHaveAttribute("aria-pressed", "true");
    expect(ana).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(ana);
    expect(ana).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(luna);
    expect(luna).toHaveAttribute("aria-pressed", "false");
  });

  it("en modo «una» no ofrece la lista de neuronas", () => {
    pintar();
    expect(screen.queryByRole("button", { name: "Ana" })).not.toBeInTheDocument();
  });
});

describe("NFC1126L · los selectores de la sala avisan", () => {
  const abrir = (nombre: string) => {
    const disparador = screen.getByRole("combobox", { name: nombre });
    fireEvent.pointerDown(disparador, { button: 0, pointerType: "mouse", ctrlKey: false });
    return disparador;
  };

  it("cambiar el modo de control a «todas» avisa con el modo elegido", async () => {
    const { props } = pintar();
    abrir("Modo de control de la sala");
    const opcion = await screen.findByRole("option", { name: /Todas/ });
    fireEvent.click(opcion);
    expect(props.onCambiarModoControl).toHaveBeenCalledWith("todas");
  });

  it("cambiar la visibilidad a «Pública» avisa con la visibilidad elegida", async () => {
    const { props } = pintar();
    abrir("Visibilidad de la sala");
    const opcion = await screen.findByRole("option", { name: /Pública/ });
    fireEvent.click(opcion);
    expect(props.onCambiarVisibilidad).toHaveBeenCalledWith("publica");
  });
});
