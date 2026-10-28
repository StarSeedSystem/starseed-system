/**
 * Protomolécula · pruebas del MARCO AISLADO (PM1010F1B, parte 2 de 3).
 * jsdom: cada vista se pinta según `definicion.vista` y el puente se comprueba con
 * MessageEvents reales de ventana (sin red, sin módulos de Node simulados).
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DefinicionAtomo, VistaAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Parametro } from "@/lib/protomolecula/tipos";

import { MarcoAislado } from "../marco-aislado";

afterEach(cleanup);

const PARAMS: Parametro[] = [
  { id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 100 },
  { id: "activa", nombre: "Activada", tipo: "booleano" },
];

const base = (vista?: VistaAtomo, extras?: Partial<DefinicionAtomo>): DefinicionAtomo => ({
  herramientaId: "prueba-marco-1",
  nombre: "Prueba de marco",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: PARAMS,
  entradas: [],
  salidas: [],
  vista,
  ...extras,
});

const DOC = '<p data-guia="guia">__PM_CANAL__</p>';
const TOKEN_RE = /([0-9a-f]{32})/;

const iframeDe = (): HTMLIFrameElement => {
  const el = document.querySelector("iframe");
  if (!el) throw new Error("No hay iframe");
  return el as HTMLIFrameElement;
};

const tokenDe = (marco: HTMLIFrameElement): string => {
  const srcDoc = marco.getAttribute("srcdoc") ?? "";
  const token = TOKEN_RE.exec(srcDoc)?.[1];
  if (!token) throw new Error(`sin token en: ${srcDoc}`);
  return token;
};

const usuario = (marco: HTMLIFrameElement): Window => {
  const v = marco.contentWindow;
  if (!v) throw new Error("El iframe no tiene contentWindow");
  return v;
};

const envia = (datos: Record<string, unknown>, origen: string, source: MessageEventSource): void => {
  window.dispatchEvent(new MessageEvent("message", { data: datos, origin: origen, source }));
};

describe("MarcoAislado · vista documento", () => {
  it('sandbox exactamente «allow-scripts» y nunca «allow-same-origin»', () => {
    render(<MarcoAislado definicion={base({ tipo: "documento", documento: () => DOC })} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    const marco = iframeDe();
    expect(marco.getAttribute("sandbox")).toBe("allow-scripts");
    expect(marco.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("el marcador __PM_CANAL__ se sustituye por un token de 128 bits", () => {
    render(<MarcoAislado definicion={base({ tipo: "documento", documento: () => DOC })} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    const srcDoc = iframeDe().getAttribute("srcdoc") ?? "";
    const token = TOKEN_RE.exec(srcDoc)?.[1] ?? "";
    expect(srcDoc).not.toContain("__PM_CANAL__");
    expect(token).toMatch(/^([0-9a-f]{32})$/);
  });

  it("cambio con token y source del marco la llama; sin token o con otra source, no", () => {
    const alCambio = vi.fn();
    render(<MarcoAislado definicion={base({ tipo: "documento", documento: () => DOC })} atomoId="a1" valores={{ volumen: 0 }} alCambio={alCambio} />);
    const marco = iframeDe();
    const token = tokenDe(marco);
    const ventana = usuario(marco);
    const datos = (canal: string) => ({ protomolecula: 1, tipo: "cambio", canal, parametroId: "volumen", valor: 42 });
    envia(datos(token), "null", ventana);
    expect(alCambio).toHaveBeenCalledTimes(1);
    expect(alCambio).toHaveBeenCalledWith("volumen", 42);
    envia(datos("otro-canal-0000000000000000000000000000"), "null", ventana);
    envia(datos(token), "null", window);
    expect(alCambio).toHaveBeenCalledTimes(1);
  });

  it("«hola» informa al declarar (solo eso) y «exportar» entrega el formato con sus datos", () => {
    const alDeclarar = vi.fn();
    const alExportar = vi.fn();
    render(
      <MarcoAislado
        definicion={base({ tipo: "documento", documento: () => DOC })}
        atomoId="a1"
        valores={{}}
        alCambio={vi.fn()}
        alExportar={alExportar}
        alDeclarar={alDeclarar}
      />
    );
    const marco = iframeDe();
    const token = tokenDe(marco);
    envia({ protomolecula: 1, tipo: "hola", canal: token, nombre: "Vuela" }, "null", usuario(marco));
    expect(alDeclarar).toHaveBeenCalledTimes(1);
    expect(alExportar).not.toHaveBeenCalled();
    envia({ protomolecula: 1, tipo: "exportar", canal: token, formato: "wav", datos: { copias: 2 } }, "null", usuario(marco));
    expect(alExportar).toHaveBeenCalledTimes(1);
    expect(alExportar).toHaveBeenCalledWith("wav", { copias: 2 });
    expect(alDeclarar).toHaveBeenCalledTimes(1);
  });

  it("«establecer» solo con lo que cambió, nunca el estado entero", () => {
    const def = base({ tipo: "documento", documento: () => DOC });
    const alCambio = vi.fn();
    const recibidos: Array<Record<string, unknown>> = [];
    const { rerender } = render(<MarcoAislado definicion={def} atomoId="a1" valores={{ volumen: 5, activa: false }} alCambio={alCambio} />);
    const marco = iframeDe();
    vi.spyOn(usuario(marco), "postMessage").mockImplementation(
      ((m: Record<string, unknown>) => { recibidos.push(m); }) as unknown as Window["postMessage"]
    );
    rerender(<MarcoAislado definicion={def} atomoId="a1" valores={{ volumen: 7, activa: false }} alCambio={alCambio} />);
    const marcados = recibidos.filter((d) => d.tipo === "establecer");
    expect(marcados.some((d) => d.parametroId === "volumen" && d.valor === 7)).toBe(true);
    expect(marcados.every((d) => d.parametroId !== "activa")).toBe(true);
  });
});

describe("MarcoAislado · vista externa", () => {
  it("http: tarjeta con el motivo y sin iframe", () => {
    render(<MarcoAislado definicion={base({ tipo: "externa", url: "http://ahi.falso/editor" })} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    expect(screen.getByText(/No se puede mostrar aquí/)).toBeDefined();
    expect(screen.getByText(/Solo https/)).toBeDefined();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("https de otro origen: iframe aislado completo con su rótulo honesto", () => {
    const url = "https://otro.origen.ejemplo/editor";
    render(<MarcoAislado definicion={base({ tipo: "externa", url })} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    const marco = iframeDe();
    expect(marco.getAttribute("src")).toBe(url);
    expect(marco.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
    );
    expect(marco.getAttribute("sandbox")).not.toContain("allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-same-origin");
    expect(screen.getByText(/Se muestra tal cual: Protomolécula controla su ventana/)).toBeDefined();
  });
});

describe("MarcoAislado · vista componente y sin vista", () => {
  it('componente desconocido: «Esta herramienta aún no tiene vista»', () => {
    render(<MarcoAislado definicion={base({ tipo: "componente", id: "no-existe" })} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Esta herramienta aún no tiene vista");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("sin vista: muestra el «próximamente» declarado con su motivo", () => {
    const def = base(undefined, { proximamente: "próximamente: falta la vista de esta herramienta" });
    render(<MarcoAislado definicion={def} atomoId="a1" valores={{}} alCambio={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("próximamente: falta la vista de esta herramienta");
  });
});
