// @vitest-environment jsdom
/**
 * Cableado del diálogo «Crear en 3D» (G3D1011E) con el adaptador de los Spaces
 * (ESP1011C): la generación sale del navegador y, guardado el GLB, la malla
 * cerrada y los niveles de detalle quedan encargados a la neurona que pueda
 * (`encargoDeCierre` con el reparto de G3D1011D). Sin red: el Space, la
 * Biblioteca y el registro de neuronas son dobles inyectados.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Generar3D } from "../generar-3d";
import type { Procedencia } from "@/lib/avatares/adn/adn";
import type { NeuronaTaller } from "@/lib/avatares/adaptadores/reparto-taller";
import type { Dependencias3D } from "@/lib/avatares/adaptadores/use-generar-3d";

const PROC: Procedencia = { herramienta: "Pixal3D", licencia: "MIT", uso: "libre" };
// La A1: sin GPU pero con Blender en CPU (vóxeles → cierra la malla y optimiza).
const A1: NeuronaTaller = {
  id: "a1", cuenta: "alex", ofrecidaPor: [], carga: 0, viva: true,
  hierro: { gpu: "ninguna", ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false },
};
const IMAGEN = () => new File([new Uint8Array([137, 80, 78, 71])], "referencia.png", { type: "image/png" });

function deps(): { d: Dependencias3D; espacio: ReturnType<typeof vi.fn>; guardar: ReturnType<typeof vi.fn> } {
  const espacio = vi.fn(async () => ({ ok: true as const, glb: new Blob([new Uint8Array([103, 108, 84, 70])], { type: "model/gltf-binary" }), lods: [], procedencia: [PROC] }));
  const guardar = vi.fn(async () => ({ ok: true as const, ref: "biblioteca:m1", aviso: undefined }));
  return { d: { taller: null, espacio, guardar } as Dependencias3D, espacio, guardar };
}

async function generarCon(d: Dependencias3D, leerNeuronas: () => Promise<readonly NeuronaTaller[] | null>) {
  render(<Generar3D destino="bot" dependencias={d} contexto={{ cuenta: "alex" }} leerNeuronas={leerNeuronas} />);
  fireEvent.click(screen.getByRole("button", { name: /Crear en 3D desde una imagen/ }));
  const campo = screen.getByLabelText(/Imagen de este aparato/) as HTMLInputElement;
  fireEvent.change(campo, { target: { files: [IMAGEN()] } });
  fireEvent.click(screen.getByLabelText(/Doy permiso para enviar esta imagen\./));
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  await screen.findByText(/Guardado en tu Biblioteca/);
}

afterEach(cleanup);

describe("Generar3D · cableado del adaptador de Spaces al diálogo", () => {
  it("tras guardar el GLB, la malla cerrada y los LOD quedan encargados a la neurona que pueda (la A1)", async () => {
    const { d, espacio, guardar } = deps();
    await generarCon(d, async () => [A1]);
    expect(espacio).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ permisoRemoto: true, titulo: "referencia" }));
    expect(guardar).toHaveBeenCalledTimes(1);
    expect((guardar.mock.calls[0]?.[0] as { procedencia: Procedencia[] }).procedencia).toEqual([PROC]);
    expect(await screen.findByText(/Cierre y niveles de detalle: .*a1/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/la orden ya está formada para el préstamo de MetaGenesis/);
  });

  it("si ninguna neurona puede, lo dice en vez de simular el encargo", async () => {
    const { d } = deps();
    await generarCon(d, async () => []);
    await screen.findByText(/Guardado en tu Biblioteca/);
    expect(document.body.textContent).toMatch(/Cierre y niveles de detalle pendientes: .*ninguna neurona viva/i);
  });

  it("si aquí no se leyó el registro de neuronas, el encargo queda pendiente y se dice", async () => {
    const { d } = deps();
    await generarCon(d, async () => null);
    await screen.findByText(/Guardado en tu Biblioteca/);
    expect(document.body.textContent).toMatch(/Cierre y niveles de detalle pendientes: .*no se leyó el registro/);
  });
});
