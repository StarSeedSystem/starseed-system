/**
 * NFC1126L · Sala de sonido compartida — la interfaz (parte 3 de 3).
 * Contrato: architecture/nfc-neuronas.md §11.
 *
 * Se prueba el comportamiento por la interfaz pública de `MezcladorSalaSonido`:
 * fuentes y mezclador por fuente, cola común, quién controla, visibilidad y los
 * estados vacíos. Nada de red ni de disco: el estado entra por props.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as renderCrudo,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import { AppearanceProvider } from "@/context/appearance-context";
import {
  MezcladorSalaSonido,
  type ColaItem,
  type EstadoSala,
  type FuenteAudio,
  type MezcladorProps,
} from "../mezclador";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(cleanup);

function montar(ui: ReactElement) {
  return renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);
}

function fuente(over: Partial<FuenteAudio> = {}): FuenteAudio {
  return {
    id: "f1",
    nombre: "Tornamesa del salón",
    tipo: "archivo",
    neuronaId: "n1",
    neuronaNombre: "Mac de Maggasukha",
    nivel: 0.8,
    ecualizador: { graves: 0, medios: 0, agudos: 0 },
    limitador: 0,
    muted: false,
    solo: false,
    reproduciendo: false,
    ...over,
  };
}

function itemCola(over: Partial<ColaItem> = {}): ColaItem {
  return {
    id: "c1",
    titulo: "Semilla estelar",
    fuenteId: "f1",
    duracion: 95,
    añadidoPor: "n1",
    orden: 1,
    ...over,
  };
}

function estado(over: Partial<EstadoSala> = {}): EstadoSala {
  return {
    fuentes: [fuente()],
    cola: [],
    reproduciendo: null,
    modoControl: "una",
    neuronasControladoras: ["n1"],
    visibilidad: "sala",
    neuronaActual: "n1",
    ...over,
  };
}

function props(over: Partial<MezcladorProps> = {}): MezcladorProps {
  return {
    estado: estado(),
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
    ...over,
  };
}

describe("MezcladorSalaSonido · estructura y estados vacíos", () => {
  it("se anuncia como la región del mezclador de la sala", () => {
    montar(<MezcladorSalaSonido {...props()} />);
    expect(
      screen.getByRole("region", { name: "Mezclador de la sala de sonido" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Quién controla")).toBeInTheDocument();
  });

  it("sin fuentes lo dice y enseña a unir neuronas por NFC o Señales", () => {
    montar(<MezcladorSalaSonido {...props({ estado: estado({ fuentes: [] }) })} />);
    expect(screen.getByText("No hay fuentes de audio en la sala")).toBeInTheDocument();
    expect(
      screen.getByText("Une neuronas por NFC o desde Señales para añadir fuentes"),
    ).toBeInTheDocument();
  });

  it("con la cola vacía lo dice y explica de dónde añadir audio", () => {
    montar(<MezcladorSalaSonido {...props()} />);
    expect(screen.getByText("La cola está vacía")).toBeInTheDocument();
    expect(
      screen.getByText("Añade audio desde archivos, la Biblioteca o apps"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reproducir siguiente" }),
    ).toBeNull();
  });
});

describe("MezcladorSalaSonido · fuentes y mezclador por fuente", () => {
  const dosFuentes = () =>
    estado({
      fuentes: [
        fuente({ id: "f1", nombre: "Tornamesa del salón", nivel: 0.8, limitador: 0.5 }),
        fuente({
          id: "f2",
          nombre: "Micrófono del estudio",
          tipo: "microfono",
          neuronaId: "n2",
          neuronaNombre: "Tablet de Maggasukha",
          nivel: 0.3,
          limitador: 0,
        }),
      ],
    });

  it("pinta cada fuente con su neurona, su tipo, su nivel y su limitador", () => {
    montar(<MezcladorSalaSonido {...props({ estado: dosFuentes() })} />);
    expect(screen.getByText("Tornamesa del salón")).toBeInTheDocument();
    expect(screen.getByText("Mac de Maggasukha · archivo")).toBeInTheDocument();
    expect(screen.getByText("Micrófono del estudio")).toBeInTheDocument();
    expect(screen.getByText("Tablet de Maggasukha · microfono")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("silenciar y solo avisan con el id de SU fuente", () => {
    const p = props({ estado: dosFuentes() });
    montar(<MezcladorSalaSonido {...p} />);
    const silenciar = screen.getAllByRole("button", { name: "Silenciar" });
    const solo = screen.getAllByRole("button", { name: "Solo esta fuente" });
    fireEvent.click(silenciar[1]);
    fireEvent.click(solo[0]);
    expect(p.onToggleMuted).toHaveBeenCalledWith("f2");
    expect(p.onToggleSolo).toHaveBeenCalledWith("f1");
  });

  it("una fuente silenciada o en solo lo declara en su botón", () => {
    montar(
      <MezcladorSalaSonido
        {...props({
          estado: estado({
            fuentes: [
              fuente({ id: "f1", muted: true }),
              fuente({ id: "f2", nombre: "Otra", solo: true }),
            ],
          }),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Activar sonido" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Quitar solo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("MezcladorSalaSonido · niveles, ecualizador y limitador", () => {
  it("mover el nivel avisa con el id y el valor nuevo", () => {
    const p = props();
    montar(<MezcladorSalaSonido {...p} />);
    const nivel = screen.getByRole("slider", { name: "Nivel de Tornamesa del salón" });
    fireEvent.keyDown(nivel, { key: "ArrowRight" });
    expect(p.onCambiarNivel).toHaveBeenCalledWith("f1", expect.closeTo(0.81, 5));
  });

  it("mover el limitador avisa con el id y el valor nuevo", () => {
    const p = props();
    montar(<MezcladorSalaSonido {...p} />);
    const limitador = screen.getByRole("slider", {
      name: "Limitador de Tornamesa del salón",
    });
    fireEvent.keyDown(limitador, { key: "ArrowRight" });
    expect(p.onCambiarLimitador).toHaveBeenCalledWith("f1", expect.closeTo(0.01, 5));
  });

  it("el ecualizador se abre con sus tres bandas y mover una avisa", () => {
    const p = props();
    montar(<MezcladorSalaSonido {...p} />);
    expect(
      screen.queryByRole("group", { name: "Ecualizador de Tornamesa del salón" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar ecualizador" }));
    const grupo = screen.getByRole("group", {
      name: "Ecualizador de Tornamesa del salón",
    });
    expect(within(grupo).getByRole("slider", { name: /Graves/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("slider", { name: /Medios/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("slider", { name: /Agudos/ })).toBeInTheDocument();
    fireEvent.keyDown(within(grupo).getByRole("slider", { name: /Graves/ }), {
      key: "ArrowRight",
    });
    expect(p.onCambiarEcualizador).toHaveBeenCalledWith(
      "f1",
      "graves",
      expect.closeTo(0.05, 5),
    );
  });

  it("quien no controla ve sus deslizadores desactivados; quien controla, no", () => {
    montar(
      <MezcladorSalaSonido
        {...props({
          estado: estado({
            modoControl: "una",
            neuronasControladoras: ["n1"],
            fuentes: [
              fuente({ id: "f1", neuronaId: "n1", nombre: "La que controla" }),
              fuente({ id: "f2", neuronaId: "n2", nombre: "La invitada" }),
            ],
          }),
        })}
      />,
    );
    const controla = screen.getByRole("slider", { name: "Nivel de La que controla" });
    const invitada = screen.getByRole("slider", { name: "Nivel de La invitada" });
    expect(controla).not.toHaveAttribute("data-disabled");
    expect(invitada).toHaveAttribute("data-disabled");
  });
});

describe("MezcladorSalaSonido · cola común", () => {
  const cola = [
    itemCola({ id: "c1", titulo: "Semilla estelar", artista: "StarSeed", añadidoPor: "n1", orden: 1 }),
    itemCola({ id: "c2", titulo: "Lluvia de meteoros", añadidoPor: "n2", orden: 2 }),
  ];

  it("muestra la cola en orden, con quién la añadió y lo que suena marcado", () => {
    montar(
      <MezcladorSalaSonido
        {...props({
          estado: estado({ cola, reproduciendo: cola[0], neuronaActual: "n1" }),
        })}
      />,
    );
    const lista = screen.getByRole("list", { name: "Cola de reproducción" });
    const filas = within(lista).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText("Semilla estelar")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/Añadido por n1/)).toBeInTheDocument();
    expect(within(filas[1]).getByText("Lluvia de meteoros")).toBeInTheDocument();
    expect(filas[0]).toHaveAttribute("aria-current", "true");
    expect(filas[1]).toHaveAttribute("aria-current", "false");
  });

  it("solo se puede quitar de la cola lo que añadió esta neurona", () => {
    const p = props({
      estado: estado({ cola, reproduciendo: cola[0], neuronaActual: "n1" }),
    });
    montar(<MezcladorSalaSonido {...p} />);
    const quitar = screen.getAllByRole("button", { name: /Quitar/ });
    expect(quitar).toHaveLength(1);
    expect(quitar[0]).toHaveAccessibleName('Quitar "Semilla estelar" de la cola');
    fireEvent.click(quitar[0]);
    expect(p.onQuitarDeCola).toHaveBeenCalledWith("c1");
  });

  it("«Siguiente» y «Detener» mandan en la reproducción de la sala", () => {
    const p = props({
      estado: estado({ cola, reproduciendo: cola[0], neuronaActual: "n1" }),
    });
    montar(<MezcladorSalaSonido {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Reproducir siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Detener reproducción" }));
    expect(p.onReproducirSiguiente).toHaveBeenCalledTimes(1);
    expect(p.onDetener).toHaveBeenCalledTimes(1);
  });

  it("arrastrar una entrada sobre otra pide el nuevo orden", () => {
    const p = props({
      estado: estado({ cola, reproduciendo: cola[0], neuronaActual: "n1" }),
    });
    montar(<MezcladorSalaSonido {...p} />);
    const filas = screen.getAllByRole("listitem");
    const dt = {
      effectAllowed: "",
      dropEffect: "",
      data: "",
      setData(_tipo: string, valor: string) {
        this.data = valor;
      },
      getData() {
        return this.data;
      },
    };
    fireEvent.dragStart(filas[0], { dataTransfer: dt });
    fireEvent.drop(filas[1], { dataTransfer: dt });
    expect(p.onReordenarCola).toHaveBeenCalledWith("c1", 1);
  });
});

describe("MezcladorSalaSonido · quién controla y visibilidad", () => {
  const conDosNeuronas = () =>
    estado({
      fuentes: [
        fuente({ id: "f1", neuronaId: "n1", neuronaNombre: "Mac de Maggasukha" }),
        fuente({ id: "f2", neuronaId: "n2", neuronaNombre: "Tablet de Maggasukha" }),
      ],
    });

  it("enseña el modo de control y la visibilidad actuales", () => {
    montar(
      <MezcladorSalaSonido
        {...props({
          estado: estado({ modoControl: "todas", visibilidad: "contactos" }),
        })}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Modo de control de la sala" }),
    ).toHaveTextContent("Todas");
    expect(
      screen.getByRole("combobox", { name: "Visibilidad de la sala" }),
    ).toHaveTextContent("Contactos");
  });

  it("elegir el modo «Elegidas» avisa con las neuronas ya marcadas", async () => {
    const usuario = userEvent.setup();
    const p = props({ estado: conDosNeuronas() });
    montar(<MezcladorSalaSonido {...p} />);
    await usuario.click(
      screen.getByRole("combobox", { name: "Modo de control de la sala" }),
    );
    await usuario.click(screen.getByRole("option", { name: /Elegidas/ }));
    expect(p.onCambiarModoControl).toHaveBeenCalledWith("elegidas", ["n1"]);
  });

  it("cambiar la visibilidad avisa con la opción elegida", async () => {
    const usuario = userEvent.setup();
    const p = props();
    montar(<MezcladorSalaSonido {...p} />);
    await usuario.click(
      screen.getByRole("combobox", { name: "Visibilidad de la sala" }),
    );
    await usuario.click(screen.getByRole("option", { name: /Contactos/ }));
    expect(p.onCambiarVisibilidad).toHaveBeenCalledWith("contactos");
  });

  it("en modo «Elegidas» marca las controladoras y deja alternar cuáles son", () => {
    montar(
      <MezcladorSalaSonido
        {...props({
          estado: { ...conDosNeuronas(), modoControl: "elegidas", neuronasControladoras: ["n1"] },
        })}
      />,
    );
    const mac = screen.getByRole("button", { name: "Mac de Maggasukha" });
    const tablet = screen.getByRole("button", { name: "Tablet de Maggasukha" });
    expect(mac).toHaveAttribute("aria-pressed", "true");
    expect(tablet).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(tablet);
    expect(tablet).toHaveAttribute("aria-pressed", "true");
  });

  it("en modo «Una sola» no enseña la lista de elegidas", () => {
    montar(
      <MezcladorSalaSonido
        {...props({ estado: { ...conDosNeuronas(), modoControl: "una" } })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Tablet de Maggasukha" }),
    ).toBeNull();
  });
});
