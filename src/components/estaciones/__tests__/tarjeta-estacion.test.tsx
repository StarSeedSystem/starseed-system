import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Estacion } from "@/lib/estaciones/tipos";
import { TarjetaEstacion, horaProgramada } from "../tarjeta-estacion";

const AHORA = Date.parse("2026-10-07T12:00:00Z");

function base(parche: Partial<Estacion> = {}): Estacion {
  return {
    id: "est-1", owner_id: "u1", ambito_tipo: "persona", entidad_ref: null,
    titulo: "Radio libre", descripcion: "", tipo: "audio", fuente: "enlace",
    enlace: "https://ejemplo.org/stream", formato: "audio", imagen: null,
    idioma: "es", categorias: [], licencia: "cc-by", visibilidad: "publica",
    empieza_en: null, termina_en: null,
    ultimo_latido: new Date(AHORA - 30_000).toISOString(),
    pausada: false, en_malla: false, espectadores: 42,
    created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z",
    ...parche,
  };
}

afterEach(cleanup);

describe("horaProgramada", () => {
  it("formatea una fecha ISO en español", () => {
    expect(horaProgramada("2026-10-08T18:30:00Z")).toMatch(/2026/);
  });
});

describe("TarjetaEstacion · estado", () => {
  it("en directo muestra la insignia", () => {
    render(<TarjetaEstacion estacion={base()} ahora={AHORA} />);
    expect(screen.getByText("● EN DIRECTO")).toBeTruthy();
  });
  it("programada muestra la hora de inicio", () => {
    render(<TarjetaEstacion ahora={AHORA}
      estacion={base({ fuente: "starseed", enlace: "/sala", ultimo_latido: null, empieza_en: "2026-10-08T18:00:00Z" })} />);
    expect(screen.getByText(/Programada · /)).toBeTruthy();
  });
  it("pausada y terminada muestran su etiqueta", () => {
    const { unmount } = render(<TarjetaEstacion estacion={base({ pausada: true })} ahora={AHORA} />);
    expect(screen.getByText("Pausada")).toBeTruthy();
    unmount();
    render(<TarjetaEstacion ahora={AHORA}
      estacion={base({ ultimo_latido: null, empieza_en: "2026-10-07T10:00:00Z", termina_en: "2026-10-07T11:00:00Z" })} />);
    expect(screen.getByText("Terminada")).toBeTruthy();
  });
  it("muestra tipo, licencia, espectadores, entidad y malla", () => {
    render(<TarjetaEstacion ahora={AHORA}
      estacion={{ ...base({ tipo: "juego", ambito_tipo: "entidad", entidad_ref: "club-go" }), oidaPorMalla: true }} />);
    expect(screen.getByText("Juego")).toBeTruthy();
    expect(screen.getByText("CC BY")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("de club-go")).toBeTruthy();
    expect(screen.getByText("malla")).toBeTruthy();
  });
});

describe("TarjetaEstacion · denuncias", () => {
  it("las muestra solo al dueño", () => {
    const { unmount } = render(<TarjetaEstacion estacion={base()} ahora={AHORA} esMia denuncias={2} />);
    expect(screen.getByText("2 denuncias")).toBeTruthy();
    unmount();
    render(<TarjetaEstacion estacion={base()} ahora={AHORA} denuncias={2} />);
    expect(screen.queryByText("2 denuncias")).toBeNull();
  });
});

describe("TarjetaEstacion · acciones", () => {
  it("abrir llama a onAbrir con el id", () => {
    const onAbrir = vi.fn();
    render(<TarjetaEstacion estacion={base()} ahora={AHORA} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByLabelText("Abrir Radio libre"));
    expect(onAbrir).toHaveBeenCalledWith("est-1");
  });
  it("menú del dueño: editar, pausar/reanudar y terminar", () => {
    const onEditar = vi.fn(); const onPausar = vi.fn(); const onTerminar = vi.fn();
    render(<TarjetaEstacion estacion={base()} ahora={AHORA} esMia onEditar={onEditar} onPausar={onPausar} onTerminar={onTerminar} />);
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    expect(screen.queryByText("Denunciar")).toBeNull();
    fireEvent.click(screen.getByText("Pausar"));
    expect(onPausar).toHaveBeenCalledWith("est-1", true);
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Editar"));
    expect(onEditar).toHaveBeenCalledWith("est-1");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Terminar"));
    expect(onTerminar).toHaveBeenCalledWith("est-1");
  });
  it("estación pausada del dueño ofrece Reanudar", () => {
    const onPausar = vi.fn();
    render(<TarjetaEstacion estacion={base({ pausada: true })} ahora={AHORA} esMia onPausar={onPausar} />);
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Reanudar"));
    expect(onPausar).toHaveBeenCalledWith("est-1", false);
  });
  it("menú de otra persona: denunciar y ocultar", () => {
    const onDenunciar = vi.fn(); const onOcultar = vi.fn();
    render(<TarjetaEstacion estacion={base()} ahora={AHORA} onDenunciar={onDenunciar} onOcultar={onOcultar} />);
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    expect(screen.queryByText("Editar")).toBeNull();
    fireEvent.click(screen.getByText("Denunciar"));
    expect(onDenunciar).toHaveBeenCalledWith("est-1");
    fireEvent.click(screen.getByLabelText("Opciones de la estación"));
    fireEvent.click(screen.getByText("Ocultar"));
    expect(onOcultar).toHaveBeenCalledWith("est-1");
  });
});
