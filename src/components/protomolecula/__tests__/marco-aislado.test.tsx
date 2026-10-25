import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import { VERSION_PUENTE } from "@/lib/protomolecula/puente-herramientas";
import type { DefinicionAtomo, VistaProps } from "@/lib/protomolecula/registro-atomos";

import { MarcoAislado } from "../marco-aislado";

const DOC_HTML = '<!DOCTYPE html><html><body><script>const CANAL = "__PM_CANAL__";</script></body></html>';

function definicion(extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  return {
    herramientaId: "prueba",
    nombre: "Prueba",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "total",
    parametros: [
      { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, defecto: -12 },
      { id: "activo", nombre: "Activo", tipo: "booleano", defecto: false },
    ],
    entradas: [],
    salidas: [],
    vista: { tipo: "documento", documento: () => DOC_HTML },
    ...extra,
  };
}

const marco = () => screen.getByTitle("Vista de Prueba") as HTMLIFrameElement;
function tokenDe(frame: HTMLIFrameElement): string {
  const m = /[0-9a-f]{32}/.exec(frame.getAttribute("srcdoc") ?? "");
  if (!m) throw new Error("El srcDoc no lleva token");
  return m[0];
}
function mensaje(frame: HTMLIFrameElement, data: unknown, extra: { origin?: string; source?: unknown } = {}) {
  return new MessageEvent("message", {
    data,
    origin: extra.origin ?? "null",
    source: (extra.source === undefined ? frame.contentWindow : extra.source) as MessageEventSource,
  });
}
const hola = (canal: string) => ({ protomolecula: VERSION_PUENTE, tipo: "hola", canal, nombre: "Prueba" });
const cambio = (canal: string, valor: unknown) => ({ protomolecula: VERSION_PUENTE, tipo: "cambio", canal, parametroId: "volumen", valor });

afterEach(() => {
  cleanup();
  for (const id of Object.keys(VISTAS_COMPONENTE)) delete VISTAS_COMPONENTE[id];
});

describe("MarcoAislado · documento propio", () => {
  it("usa exactamente sandbox=allow-scripts y nunca allow-same-origin", () => {
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} />);
    const frame = marco();
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("sustituye el marcador __PM_CANAL__ por un token nuevo de 128 bits", () => {
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} />);
    const srcdoc = marco().getAttribute("srcdoc") ?? "";
    expect(srcdoc).not.toContain("__PM_CANAL__");
    expect(tokenDe(marco())).toMatch(/^[0-9a-f]{32}$/);
  });

  it("un cambio con la ventana, el origen opaco y el token correctos llama a alCambio", () => {
    const alCambio = vi.fn();
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} alCambio={alCambio} />);
    const frame = marco();
    fireEvent(window, mensaje(frame, cambio(tokenDe(frame), -3)));
    expect(alCambio).toHaveBeenCalledWith("volumen", -3);
  });

  it("sin el token no hay cambio", () => {
    const alCambio = vi.fn();
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} alCambio={alCambio} />);
    fireEvent(window, mensaje(marco(), cambio("0".repeat(32), -3)));
    expect(alCambio).not.toHaveBeenCalled();
  });

  it("con otra ventana de origen no hay cambio", () => {
    const alCambio = vi.fn();
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} alCambio={alCambio} />);
    const frame = marco();
    fireEvent(window, mensaje(frame, cambio(tokenDe(frame), -3), { source: window }));
    expect(alCambio).not.toHaveBeenCalled();
  });

  it("con un origen que no es opaco no hay cambio", () => {
    const alCambio = vi.fn();
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} alCambio={alCambio} />);
    const frame = marco();
    fireEvent(window, mensaje(frame, cambio(tokenDe(frame), -3), { origin: "https://otro.example" }));
    expect(alCambio).not.toHaveBeenCalled();
  });
});

describe("MarcoAislado · herramienta externa", () => {
  it("una url http no se embebe: tarjeta con el motivo y el enlace", () => {
    render(<MarcoAislado definicion={definicion({ vista: { tipo: "externa", url: "http://ejemplo.com/app" } })} atomoId="a1" valores={{}} />);
    expect(screen.queryByTitle("Vista de Prueba")).toBeNull();
    expect(screen.getByText(/Solo https/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Abrir en otra pestaña" }).getAttribute("href")).toBe("http://ejemplo.com/app");
  });

  it("una url https de otro origen se embebe con su sandbox y el aviso de «solo ventana»", () => {
    render(<MarcoAislado definicion={definicion({ vista: { tipo: "externa", url: "https://ejemplo.com/app" } })} atomoId="a1" valores={{}} />);
    const frame = marco();
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads");
    expect(screen.getByText(/Protomolécula controla su ventana y sus archivos/)).toBeDefined();
  });
});

describe("MarcoAislado · componente y protocolo", () => {
  it("un componente desconocido lo dice en vez de romperse", () => {
    render(<MarcoAislado definicion={definicion({ vista: { tipo: "componente", id: "no-existe" } })} atomoId="a1" valores={{}} />);
    expect(screen.getByText("Esta herramienta aún no tiene vista")).toBeDefined();
  });

  it("un componente registrado se carga con React.lazy dentro de Suspense", async () => {
    VISTAS_COMPONENTE.demo = () => Promise.resolve({ default: ({ atomoId }: VistaProps) => <p>Componente {atomoId}</p> });
    render(<MarcoAislado definicion={definicion({ vista: { tipo: "componente", id: "demo" } })} atomoId="a1" valores={{}} />);
    expect(await screen.findByText("Componente a1")).toBeDefined();
  });

  it("manda establecer solo de lo que cambió, nunca el estado entero", async () => {
    const props = { definicion: definicion(), atomoId: "a1" };
    const { rerender } = render(<MarcoAislado {...props} valores={{ "a1::volumen": -12, "a1::activo": false }} />);
    const frame = marco();
    const win = frame.contentWindow as Window;
    const enviados: Record<string, unknown>[] = [];
    win.postMessage = ((msg: Record<string, unknown>) => { enviados.push(msg); }) as unknown as Window["postMessage"];
    fireEvent(window, mensaje(frame, hola(tokenDe(frame))));
    await waitFor(() => expect(enviados).toHaveLength(2));
    enviados.length = 0;
    rerender(<MarcoAislado {...props} valores={{ "a1::volumen": -3, "a1::activo": false }} />);
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ tipo: "establecer", parametroId: "volumen", valor: -3 });
  });

  it("un hola solo informa y un exportar entrega formato y datos", () => {
    const alDeclarar = vi.fn();
    const alExportar = vi.fn();
    render(<MarcoAislado definicion={definicion()} atomoId="a1" valores={{}} alDeclarar={alDeclarar} alExportar={alExportar} />);
    const frame = marco();
    fireEvent(window, mensaje(frame, hola(tokenDe(frame))));
    expect(alDeclarar.mock.calls[0][0].nombre).toBe("Prueba");
    fireEvent(window, mensaje(frame, { protomolecula: VERSION_PUENTE, tipo: "exportar", canal: tokenDe(frame), formato: "wav", datos: "base64" }));
    expect(alExportar).toHaveBeenCalledWith("wav", "base64");
  });
});
