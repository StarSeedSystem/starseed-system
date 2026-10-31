/** Asistente «Conectar Genesis» · pruebas sin red: la carga y el envío de claves entran por props. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";
import {
  AsistenteConectarGenesis,
  GRUPOS,
  resumenPorPapel,
  type VistaOpcionesAmbito,
} from "../asistente-conectores";

afterEach(cleanup);

function sugerencia(overrides: Partial<Sugerencia> = {}): Sugerencia {
  return { id: "opcion", nombre: "Opción", tipo: "proveedor", papeles: ["escritor"], enlaceAlta: null, enlaceClave: null,
    limite: null, verificado: null, privacidad: "local", variables: [], motivo: "Sugerida por la escalera.", ...overrides };
}

function asignacion(overrides: Partial<Asignacion<Papel>> = {}): Asignacion<Papel> {
  return { clave: "escritor", cadena: [], respaldo: [], preferencias: { localPrimero: true, privacidad: "local", presupuesto: null }, ...overrides };
}

const GRUPOS_VISTA: GrupoSugerencias[] = [
  { clave: GRUPOS.local, titulo: "Local por activar",
    opciones: [sugerencia({ id: "neurona-local", nombre: "Neurona local", motivo: "Capacidad local sin usar." })] },
  { clave: GRUPOS.gratis, titulo: "Gratis por vincular",
    opciones: [sugerencia({ id: "gratis-nube", nombre: "Proveedor gratis", enlaceAlta: "https://proveedor.test/alta",
      enlaceClave: "https://proveedor.test/clave", privacidad: "nube-sin-retencion" })] },
];

const VISTA: VistaOpcionesAmbito = {
  sugerencias: GRUPOS_VISTA,
  asignaciones: [asignacion({ cadena: ["neurona-local"], respaldo: ["gratis-nube"] }),
    asignacion({ clave: "revisor", cadena: [], respaldo: [], preferencias: { localPrimero: false, privacidad: "nube-con-retencion", presupuesto: 3 } })],
};

describe("resumenPorPapel · motivo de la cadena elegida", () => {
  it("prioriza local, después gratis, después pago con permiso y, sin pistas, deja el ámbito", () => {
    const resumen = resumenPorPapel(VISTA.asignaciones, {
      locales: new Set(["neurona-local"]),
      vinculadas: new Set(),
    });
    expect(resumen[0]).toMatchObject({ papel: "escritor", elegido: "neurona-local" });
    expect(resumen[0].motivo).toMatch(/^Local primero/);
    expect(resumen[0].cadena).toEqual(["neurona-local", "gratis-nube"]);
    expect(resumen[1]).toMatchObject({ papel: "revisor", elegido: null });
    expect(resumen[1].motivo).toMatch(/^Sin opción/);
    const gratis = resumenPorPapel([asignacion({ cadena: ["gratis-nube"] })], { locales: new Set(), vinculadas: new Set(["gratis-nube"]) });
    expect(gratis[0].motivo).toMatch(/^Gratis vinculada/);
    const pago = resumenPorPapel([asignacion({ cadena: ["pago"], preferencias: { localPrimero: false, privacidad: "nube-con-retencion", presupuesto: 3 } })],
      { locales: new Set(), vinculadas: new Set() });
    expect(pago[0].motivo).toMatch(/^De pago/);
    const sinPista = resumenPorPapel([asignacion({ cadena: ["otro"] })], { locales: new Set(), vinculadas: new Set() });
    expect(sinPista[0].motivo).toMatch(/^Decidida por el ámbito/);
  });
});

describe("AsistenteConectarGenesis · pasos, enlace oficial y clave efímera", () => {
  it("carga por API simulada, enciende lo local, abre el enlace y borra la clave tras enviarla", async () => {
    const cargar = vi.fn(async () => VISTA);
    const vincular = vi.fn(async () => ({ ok: true }));
    render(<AsistenteConectarGenesis ambito="cuenta-demo" cargar={cargar} vincular={vincular} />);
    const interruptor = await screen.findByRole("switch", { name: "Interruptor de Neurona local" });
    expect(cargar).toHaveBeenCalledWith("cuenta-demo");
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    fireEvent.click(interruptor);
    expect(interruptor).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    const enlace = screen.getByRole("link", { name: "Vincular" });
    expect(enlace).toHaveAttribute("href", "https://proveedor.test/alta");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noreferrer");
    const campo = screen.getByLabelText("Clave de Proveedor gratis");
    fireEvent.change(campo, { target: { value: "clave-secreta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar clave" }));
    expect(await screen.findByText("Clave enviada a la bóveda del ámbito.")).toBeInTheDocument();
    expect(vincular).toHaveBeenCalledWith("cuenta-demo", "gratis-nube", "clave-secreta");
    expect(campo).toHaveValue("");
    fireEvent.click(screen.getByRole("tab", { name: /3\. Resumen por papel/ }));
    expect(screen.getByText("Cadena elegida: neurona-local")).toBeInTheDocument();
    expect(screen.getByText(/^Local primero:/)).toBeInTheDocument();
  });

  it("muestra el error de la bóveda sin dejar la clave en el campo", async () => {
    const vincular = vi.fn(async () => ({ ok: false, error: "La bóveda rechazó la clave." }));
    render(<AsistenteConectarGenesis ambito="grupo-demo" opciones={VISTA} vincular={vincular} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    const campo = screen.getByLabelText("Clave de Proveedor gratis");
    fireEvent.change(campo, { target: { value: "otra-clave" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar clave" }));
    expect(await screen.findByText("La bóveda rechazó la clave.")).toBeInTheDocument();
    expect(campo).toHaveValue("");
    fireEvent.click(screen.getByRole("tab", { name: /3\. Resumen por papel/ }));
    expect(screen.getByText("Sin opción para este papel todavía.")).toBeInTheDocument();
  });
});
