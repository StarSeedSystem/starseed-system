import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarFamilia, type AdaptadorFamilia } from "@/lib/variaciones/familias";
import { TarjetaVariacion, esDeCodigo, textoVistaPrevia } from "../tarjeta-variacion";
import type { VariacionVentana } from "../ventana-variaciones";

// Prueba de la tarjeta de variación pública (Ola 1019V · tarea P; contrato
// architecture/variaciones-publicas.md §4). Sin red y sin disco: el adaptador lo
// registra aquí mismo y SaveToLibrary/ShareToDialog se simulan como componentes
// mínimos (nunca claves ni llamadas de Supabase).

const compartido = vi.hoisted(() => ({ abierto: false }));
vi.mock("@/components/library/save-to-library", () => ({
  SaveToLibrary: ({ label }: { label?: string }) => <button type="button">{label}</button>,
}));
vi.mock("@/components/sharing/share-to-dialog", () => ({
  ShareToDialog: ({ open }: { open: boolean }) => {
    compartido.abierto = open;
    return <span data-abierta={String(open)} hidden />;
  },
}));

afterEach(cleanup);

function variacion(id: string, titulo: string, extra: Partial<VariacionVentana> = {}): VariacionVentana {
  return {
    id, titulo, descripcion: `${titulo}: ajusta el cristal del elemento`, version: "1.0.0", familia: "widget", licencia: "MIT",
    etiquetas: ["cristal"], creado: new Date("2026-10-01T00:00:00Z"), descargas: 3, valoracionMedia: 4, valoracionCount: 2, ...extra,
  };
}

/** Adaptador de prueba para una familia, con contador de aplicar/deshacer observado por las aserciones. */
function registrarAdaptador(opciones: { familia?: string; valida?: boolean } = {}) {
  const familia = opciones.familia ?? "widget";
  const llamadas = { aplicar: [] as string[], deshacer: 0 };
  const adaptador: AdaptadorFamilia<unknown> = {
    familia,
    nombre: `Adaptador de ${familia}`,
    capturar: (c: string) => (c.startsWith(`${familia}:`) ? c : null),
    validar: (p: unknown) => (opciones.valida === false ? { ok: false, motivos: ["El payload no encaja con el adaptador"] } : { ok: true, payload: p }),
    aplicar: (c: string) => {
      llamadas.aplicar.push(c);
      return { deshacer: () => { llamadas.deshacer += 1; } };
    },
  };
  registrarFamilia(adaptador);
  return llamadas;
}

describe("TarjetaVariacion", () => {
  it("muestra título, licencia, valoración, vista previa y «Ver origen» https; Guardar y Compartir abren", () => {
    registrarAdaptador();
    render(
      <TarjetaVariacion clave="widget:clima" variacion={variacion("v1", "Cristal suave", { enlaceExterno: "https://github.com/a/b" })} payload={{ blur: 22 }} />,
    );
    expect(screen.getByText("Cristal suave")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText(/4\.0 \(2\)/)).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === "PRE").textContent).toContain('"blur": 22');
    expect(screen.getByText("Guardar en la Biblioteca")).toBeTruthy();
    const origen = screen.getByRole("link", { name: /Ver origen/ });
    expect(origen.getAttribute("href")).toBe("https://github.com/a/b");
    expect(origen.getAttribute("rel")).toBe("noopener noreferrer");
    expect(compartido.abierto).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
    expect(compartido.abierto).toBe(true);
  });

  it("«Probar» aplica y deshace al pulsarlo de nuevo; desmontar la tarjeta deshace la prueba en vivo", () => {
    const llamadas = registrarAdaptador();
    let vista = render(<TarjetaVariacion clave="widget:clima" variacion={variacion("v1", "Cristal suave")} payload={{ blur: 22 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(llamadas.aplicar).toEqual(["widget:clima"]);
    expect(screen.getByRole("status").textContent).toContain("se deshace al pulsar de nuevo");
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(llamadas.deshacer).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
    vista = render(<TarjetaVariacion clave="widget:clima" variacion={variacion("v1", "Cristal suave")} payload={{ blur: 22 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(llamadas.deshacer).toBe(1);
    vista.unmount();
    expect(llamadas.deshacer).toBe(2);
  });

  it("«Aplicar» deja un «Deshacer» bien visible y deshace al pulsarlo", () => {
    const llamadas = registrarAdaptador();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion("v1", "Cristal suave")} payload={{ blur: 22 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(llamadas.aplicar).toEqual(["widget:clima"]);
    expect(screen.getByRole("status").textContent).toContain("Aplicada");
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(llamadas.deshacer).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sin adaptador registrado, Probar y Aplicar están deshabilitados", () => {
    render(<TarjetaVariacion clave="tema:noche" variacion={variacion("v9", "Noche profunda", { familia: "tema", etiquetas: [] })} payload={1} />);
    expect((screen.getByRole("button", { name: "Probar" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un payload que no valida no se aplica y enseña los motivos", () => {
    const llamadas = registrarAdaptador({ valida: false });
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion("v1", "Cristal suave")} payload={{ blur: 999 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(llamadas.aplicar).toHaveLength(0);
    expect(screen.getByText("El payload no encaja con el adaptador")).toBeTruthy();
  });

  it("las de código piden confirmación y su vista previa vive aislada en un iframe con sandbox", () => {
    const llamadas = registrarAdaptador({ familia: "herramienta" });
    const codigo = variacion("v-code", "Photocraft nocturno", { familia: "herramienta", etiquetas: [], descripcion: "Filtra la imagen" });
    render(<TarjetaVariacion clave="herramienta:photocraft" variacion={codigo} payload='<script>alert("hola")</script>' />);
    const marco = screen.getByTitle("Vista aislada de Photocraft nocturno") as HTMLIFrameElement;
    expect(marco.getAttribute("sandbox")).toBe("");
    expect(marco.getAttribute("srcDoc")).toContain("&lt;script&gt;");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(llamadas.aplicar).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Abrir aislada" }));
    expect(llamadas.aplicar).toEqual(["herramienta:photocraft"]);
  });

  it("los enlaces que no son https no se ofrecen como «Ver origen»", () => {
    registrarAdaptador();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion("v-http", "Cristal inseguro", { enlaceExterno: "http://inseguro.test/x" })} payload={{ blur: 22 }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("funciones puras de la tarjeta", () => {
  it("esDeCodigo marca las de familia de código y las de etiqueta de código", () => {
    expect(esDeCodigo({ familia: "herramienta", etiquetas: [] })).toBe(true);
    expect(esDeCodigo({ familia: "widget", etiquetas: ["codigo"] })).toBe(true);
    expect(esDeCodigo({ familia: "widget", etiquetas: ["cristal"] })).toBe(false);
  });
  it("textoVistaPrevia devuelve un resumen acotado y un mensaje honesto si no hay estado", () => {
    expect(textoVistaPrevia({ blur: 22 })).toContain('"blur": 22');
    expect(textoVistaPrevia(undefined)).toContain("Sin estado capturado");
    const largo = textoVistaPrevia("x".repeat(400));
    expect(largo.endsWith("…")).toBe(true);
    expect(largo.length).toBe(321);
  });
});
