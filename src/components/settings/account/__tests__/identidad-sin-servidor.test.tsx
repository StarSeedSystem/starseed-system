/**
 * (IDN1108A) Ajustes › Cuenta › Identidad sin internet: crear, exportar cifrada, importar y enrolar con código de 6 cifras.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/network/vincular-sin-internet", () => ({ LectorCodigo: () => null }));

import { IdentidadSinServidor } from "../identidad-sin-servidor";
import type { ServicioIdentidad } from "@/lib/identidad/servicio";

function falso(sobre: Partial<Record<keyof ServicioIdentidad, unknown>> = {}, tiene = false): ServicioIdentidad {
  return {
    estado: vi.fn(async () => ({ tiene, mfp: tiene ? "acct:abc" : null, tenencia: tiene ? { neuronaId: "n", nombre: "Esta neurona", desde: 1_700_000_000_000, mfp: "acct:abc" } : null, certificado: null, neuronaId: "n" })),
    crearMaestra: vi.fn(async () => ({ ok: true, mfp: "acct:abc" })),
    exportar: vi.fn(async () => ({ ok: true, texto: "ssm1:xyz", nombreArchivo: "clave.ssm" })),
    importar: vi.fn(async () => ({ ok: true, mfp: "acct:abc" })),
    nuevaSolicitud: vi.fn(async () => null),
    ...sobre,
  } as unknown as ServicioIdentidad;
}

afterEach(cleanup);

describe("IdentidadSinServidor", () => {
  it("sin clave maestra: lo dice claro y ofrece crear, importar o ser neurona nueva", async () => {
    render(<IdentidadSinServidor servicio={falso()} />);
    expect(await screen.findByText(/no/i, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear clave maestra/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importar clave/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Esta neurona es nueva/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exportar cifrada/i })).not.toBeInTheDocument();
  });

  it("crear llama al servicio y refresca el estado", async () => {
    const s = falso();
    render(<IdentidadSinServidor servicio={s} />);
    await userEvent.click(await screen.findByRole("button", { name: /Crear clave maestra/i }));
    await waitFor(() => expect(s.crearMaestra).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((s.estado as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("con clave maestra: dice qué neurona la guarda y exporta solo con contraseña de 12+", async () => {
    const s = falso({}, true);
    render(<IdentidadSinServidor servicio={s} />);
    expect(await screen.findByText(/Esta neurona guarda la clave maestra/i)).toBeInTheDocument();
    expect(screen.getByText("acct:abc")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Exportar cifrada/i }));
    const boton = screen.getByRole("button", { name: /Cifrar y exportar/i });
    expect(boton).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/mín\. 12/i), "una-contrasena-larga-1");
    expect(boton).toBeEnabled();
    await userEvent.click(boton);
    await waitFor(() => expect(s.exportar).toHaveBeenCalledWith("una-contrasena-larga-1"));
    expect(await screen.findByRole("button", { name: /Guardar archivo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Texto para copiar/i)).toHaveValue("ssm1:xyz");
  });

  it("importar: pide texto y contraseña, y llama al servicio", async () => {
    const s = falso();
    render(<IdentidadSinServidor servicio={s} />);
    await userEvent.click(await screen.findByRole("button", { name: /Importar clave/i }));
    const ok = screen.getByRole("button", { name: /^Importar$/i });
    expect(ok).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/Pega aquí/i), "ssm1:abc");
    await userEvent.type(screen.getByPlaceholderText(/Contraseña de la exportación/i), "una-contrasena-larga-1");
    await userEvent.click(ok);
    await waitFor(() => expect(s.importar).toHaveBeenCalledWith("ssm1:abc", "una-contrasena-larga-1"));
  });

  it("titular: enseña el código de 6 cifras y solo certifica al pulsar «Coincide»", async () => {
    const emitir = vi.fn(async () => ({ v: 1, t: "ss.enrolar.respuesta", certificado: {}, nonceN: "a", nonceE: "b" }));
    const s = falso({ prepararEnrolamientoDe: vi.fn(async () => ({ ok: true, preparado: { sas: "042917", solicitud: { nombre: "Tablet" }, nonceE: "b", emitir } })) }, true);
    render(<IdentidadSinServidor servicio={s} />);
    await userEvent.click(await screen.findByRole("button", { name: /Añadir una neurona nueva/i }));
    await userEvent.type(screen.getByPlaceholderText(/Texto de la solicitud/i), "sse1:abc");
    await userEvent.click(screen.getByRole("button", { name: /Leer solicitud/i }));
    expect(await screen.findByLabelText(/Código de confirmación/i)).toHaveTextContent("042917");
    expect(emitir).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Coincide: certificar/i }));
    await waitFor(() => expect(emitir).toHaveBeenCalledTimes(1));
  });
});
