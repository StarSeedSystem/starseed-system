// @vitest-environment jsdom
/**
 * PTA1108C — tarjeta «Envíos de archivos»: estado del cifrado, multitrayecto, relés con topes, envíos sellados recientes;
 * ligada a los ajustes reales (`ajustes-vias-archivo`, localStorage).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
import type { EstadoTransferencia } from "@/lib/network/archivos-malla";

const estadoMotor: { lista: EstadoTransferencia[] } = { lista: [] };
vi.mock("@/lib/network/archivos-malla", () => ({ useTransferenciasArchivo: () => estadoMotor.lista }));

import { AjusteEnviosArchivos, EnviosArchivosVista, enviosSelladosRecientes, textoTope } from "@/components/settings/neurons/ajuste-envios-archivos";
import { AJUSTES_VIAS_POR_DEFECTO, leerAjustesVias } from "@/lib/malla/ajustes-vias-archivo";

const t = (p: Partial<EstadoTransferencia>): EstadoTransferencia =>
  ({ id: "x", rol: "enviar", nombre: "foto.jpg", tipo: "image/jpeg", tamano: 1000, trozos: 4, progreso: 4, fase: "completada", inicioMs: 1, actualizadoMs: 10, cifradoArchivo: "archivo", ...p }) as EstadoTransferencia;

beforeEach(() => {
  localStorage.clear();
  estadoMotor.lista = [];
});
afterEach(() => cleanup());

describe("enviosSelladosRecientes", () => {
  it("solo las cifradas, las más nuevas primero y con tope", () => {
    const l = enviosSelladosRecientes([t({ id: "a", actualizadoMs: 5 }), t({ id: "b", actualizadoMs: 9 }), t({ id: "c", cifradoArchivo: "sin-cifrado-de-archivo" }), t({ id: "d", cifradoArchivo: undefined }), t({ id: "e", fase: "pendiente-aceptar" })], 5);
    expect(l.map((x) => x.id)).toEqual(["b", "a"]);
    expect(enviosSelladosRecientes(Array.from({ length: 9 }, (_, i) => t({ id: `n${i}`, actualizadoMs: i })), 3)).toHaveLength(3);
    expect(textoTope(64 * 1024 * 1024)).toBe("64 MiB");
    expect(textoTope(1024 * 1024 * 1024)).toBe("1 GiB");
  });
});

describe("tarjeta «Envíos de archivos»", () => {
  it("muestra el cifrado de punta a punta como activo y sin interruptor", () => {
    render(<AjusteEnviosArchivos />);
    const estado = screen.getByTestId("estado-cifrado-archivo");
    expect(estado.textContent).toContain("Cifrado de archivo de punta a punta: activo");
    expect(estado.getAttribute("role")).toBe("status");
    expect(within(estado).queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/no se puede apagar/i)).toBeTruthy();
  });

  it("valores por defecto: Automático; mis neuronas ON; relé de StarSeed ON; terceros OFF", () => {
    render(<AjusteEnviosArchivos />);
    expect((screen.getByLabelText(/Automático/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Mis neuronas como relé/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Relé de StarSeed para trozos sellados/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Relés de terceros/) as HTMLInputElement).checked).toBe(false);
  });

  it("cada control guarda en los ajustes reales y sobrevive a recargar", () => {
    const { unmount } = render(<AjusteEnviosArchivos />);
    fireEvent.click(screen.getByLabelText(/Solo directo/));
    fireEvent.click(screen.getByLabelText(/Relés de terceros/));
    fireEvent.change(screen.getByLabelText("Batería mínima para hacer de salto"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Datos que presto al día como salto"), { target: { value: String(1024 * 1024 * 1024) } });
    fireEvent.click(screen.getByLabelText(/Relé de StarSeed para trozos sellados/));
    const guardado = leerAjustesVias();
    expect(guardado).toMatchObject({ modo: "directas", releTerceros: true, bateriaMinSalto: 0.5, maxBytesSaltoDia: 1024 * 1024 * 1024, releServidor: false });
    unmount();
    render(<AjusteEnviosArchivos />);
    expect((screen.getByLabelText(/Solo directo/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Relés de terceros/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Batería mínima para hacer de salto") as HTMLSelectElement).value).toBe("0.5");
  });

  it("«Solo directo» apaga los relés (el grupo queda desactivado y lo dice)", () => {
    render(<EnviosArchivosVista ajustes={{ ...AJUSTES_VIAS_POR_DEFECTO, modo: "directas" }} onCambiar={() => undefined} transferencias={[]} />);
    const grupo = screen.getByRole("group", { name: "Relés" }) as HTMLFieldSetElement;
    expect(grupo.disabled).toBe(true);
    expect(grupo.textContent).toContain("apagados con «Solo directo»");
  });

  it("los topes de la neurona solo aparecen con «Mis neuronas como relé» encendido", () => {
    const { rerender } = render(<EnviosArchivosVista ajustes={AJUSTES_VIAS_POR_DEFECTO} onCambiar={() => undefined} transferencias={[]} />);
    expect(screen.queryByLabelText("Batería mínima para hacer de salto")).not.toBeNull();
    rerender(<EnviosArchivosVista ajustes={{ ...AJUSTES_VIAS_POR_DEFECTO, releNeuronas: false }} onCambiar={() => undefined} transferencias={[]} />);
    expect(screen.queryByLabelText("Batería mínima para hacer de salto")).toBeNull();
  });

  it("envíos sellados recientes con el reparto por vía", () => {
    estadoMotor.lista = [t({ id: "a", nombre: "informe.pdf", repartoVias: "Red local 72 % · Bluetooth 28 %", actualizadoMs: 20 }), t({ id: "b", nombre: "viejo.png", rol: "recibir", via: "Relé cifrado de StarSeed", actualizadoMs: 5 }), t({ id: "c", nombre: "claro.txt", cifradoArchivo: "sin-cifrado-de-archivo" })];
    render(<AjusteEnviosArchivos />);
    const lista = screen.getByTestId("envios-recientes");
    expect(lista.textContent).toContain("informe.pdf");
    expect(lista.textContent).toContain("Red local 72 % · Bluetooth 28 %");
    expect(lista.textContent).toContain("viejo.png");
    expect(lista.textContent).toContain("Relé cifrado de StarSeed");
    expect(lista.textContent).not.toContain("claro.txt");
  });

  it("sin envíos: lo dice", () => {
    render(<AjusteEnviosArchivos />);
    expect(screen.getByTestId("envios-recientes").textContent).toContain("Todavía no has enviado ni recibido archivos sellados");
  });

  it("accesible: todos los controles tienen nombre y los grupos, leyenda", () => {
    render(<AjusteEnviosArchivos />);
    for (const c of screen.getAllByRole("checkbox")) expect((c as HTMLInputElement).labels?.length).toBeGreaterThan(0);
    for (const c of screen.getAllByRole("radio")) expect((c as HTMLInputElement).labels?.length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: "Multitrayecto" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Relés" })).toBeTruthy();
  });
});
