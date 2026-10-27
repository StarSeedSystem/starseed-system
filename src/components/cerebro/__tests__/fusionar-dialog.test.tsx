import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import type { Brain } from "@/lib/brains/brains";
import type { LecturaFusion, ResultadoFusion } from "@/lib/cerebros/fusion-aplicar";
import FusionarDialog from "@/components/cerebro/fusionar-dialog";
expect.extend(matchers);

function renderDialog(props: { onHecho?: () => void; onOpenChange?: (abierto: boolean) => void }) {
  return render(<AppearanceProvider><FusionarDialog open onOpenChange={props.onOpenChange ?? (() => {})} cerebro={destino} cerebros={[destino, origen]} {...props} /></AppearanceProvider>);
}

vi.mock("@/lib/cerebros/fusion-aplicar", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/cerebros/fusion-aplicar");
  return {
    ...actual,
    leerParaFusion: vi.fn(),
    copiaDeSeguridad: vi.fn(),
    descargarCopia: vi.fn(),
    aplicarFusion: vi.fn(),
  };
});

const { aplicarFusion, copiaDeSeguridad, descargarCopia, leerParaFusion } = await import("@/lib/cerebros/fusion-aplicar");

function cerebro(id: string, name: string): Brain {
  return {
    id,
    owner: "cuenta-1",
    name,
    scope: "account",
    scope_ref: null,
    description: "",
    config: {},
    includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
    servers: [],
  };
}

const destino = cerebro("c1", "Cerebro uno");
const origen = cerebro("c2", "Cerebro dos");
const lecturaOk: LecturaFusion = { ok: true, destino, origenes: [origen], archivos: [], prefs: {} };
const resultadoOk: ResultadoFusion = { ok: true, archivosEscritos: 1, bytes: 9, origenesQuitados: ["c2"], origenesConservados: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(leerParaFusion).mockResolvedValue(lecturaOk);
  vi.mocked(copiaDeSeguridad).mockReturnValue({ nombre: "cerebros-fusion-x.json", texto: "{}" });
  vi.mocked(descargarCopia).mockReturnValue(true);
  vi.mocked(aplicarFusion).mockResolvedValue(resultadoOk);
});

afterEach(() => cleanup());

describe("FusionarDialog conecta fusion-aplicar", () => {
  it("descarga la copia ANTES de aplicar la fusión, y avisa al terminar", async () => {
    const onHecho = vi.fn();
    const onOpenChange = vi.fn();
    const orden: string[] = [];
    vi.mocked(descargarCopia).mockImplementation(() => { orden.push("copia"); return true; });
    vi.mocked(aplicarFusion).mockImplementation(() => { orden.push("fusion"); return Promise.resolve(resultadoOk); });
    const usuario = userEvent.setup();
    renderDialog({ onHecho, onOpenChange });

    await usuario.click(screen.getByRole("checkbox", { name: /Cerebro dos/ }));
    await usuario.click(screen.getByRole("button", { name: "Ver vista previa" }));
    await screen.findByText(/memoria nueva/);
    await usuario.click(screen.getByRole("button", { name: /Fusionar/ }));

    await waitFor(() => expect(aplicarFusion).toHaveBeenCalledTimes(1));
    expect(leerParaFusion).toHaveBeenCalledWith("c1", ["c2"]);
    expect(descargarCopia).toHaveBeenCalledTimes(1);
    expect(orden).toEqual(["copia", "fusion"]);
    expect(aplicarFusion).toHaveBeenCalledWith(expect.anything(), { destino, origenIds: ["c2"], quitarOrigenes: true });
    expect(onHecho).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("si quita la casilla, aplicarFusion conserva los orígenes", async () => {
    const onHecho = vi.fn();
    const usuario = userEvent.setup();
    renderDialog({ onHecho });

    await usuario.click(screen.getByRole("checkbox", { name: /Cerebro dos/ }));
    await usuario.click(screen.getByRole("button", { name: "Ver vista previa" }));
    await screen.findByText(/memoria nueva/);
    await usuario.click(screen.getByLabelText("Quitar los cerebros fusionados después"));
    await usuario.click(screen.getByRole("button", { name: /Fusionar/ }));

    await waitFor(() => expect(aplicarFusion).toHaveBeenCalledTimes(1));
    expect(aplicarFusion).toHaveBeenCalledWith(expect.anything(), { destino, origenIds: ["c2"], quitarOrigenes: false });
    expect(onHecho).toHaveBeenCalledTimes(1);
  });

  it("si falla la lectura no muestra el paso de fusionar", async () => {
    vi.mocked(leerParaFusion).mockResolvedValue({ ok: false, motivo: "No se pudo leer el cerebro de origen (c2)." });
    const usuario = userEvent.setup();
    renderDialog({});

    await usuario.click(screen.getByRole("checkbox", { name: /Cerebro dos/ }));
    await usuario.click(screen.getByRole("button", { name: "Ver vista previa" }));
    await screen.findByText(/No se pudo leer el cerebro de origen/);
    expect(screen.queryByRole("button", { name: /Fusionar/ })).toBeNull();
  });

  it("si no se puede descargar la copia, pregunta antes de escribir", async () => {
    vi.mocked(descargarCopia).mockReturnValue(false);
    const usuario = userEvent.setup();
    renderDialog({});

    await usuario.click(screen.getByRole("checkbox", { name: /Cerebro dos/ }));
    await usuario.click(screen.getByRole("button", { name: "Ver vista previa" }));
    await screen.findByText(/memoria nueva/);
    await usuario.click(screen.getByRole("button", { name: /Fusionar/ }));

    await screen.findByText(/No se pudo descargar la copia de seguridad/);
    expect(aplicarFusion).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole("button", { name: "Seguir sin copia descargada" }));
    await waitFor(() => expect(aplicarFusion).toHaveBeenCalledTimes(1));
    expect(descargarCopia).toHaveBeenCalledTimes(1);
  });
});
