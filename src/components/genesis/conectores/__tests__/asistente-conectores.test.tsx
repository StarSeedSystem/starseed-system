/** Prueba del asistente «Conectar Genesis» (GCA1019M) con API simulada: sin red, sin procesos;
 * DOM vía Testing Library y todos los datos por módulos puros del área conectores. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AsistenteConectores, resumenPorPapel } from "@/components/genesis/conectores/asistente-conectores";
import { AppearanceProvider } from "@/context/appearance-context";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";

afterEach(cleanup);

const LIMITE = { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10 peticiones/min" };
const CATALOGO: OpcionCatalogo[] = [
  { id: "opc-gratis", nombre: "Modelo gratis", tipo: "proveedor", papeles: ["escritor"], gratis: LIMITE, requiereCuenta: true, enlaceAlta: "https://ejemplo.alta", enlaceClave: "https://ejemplo.clave", variables: ["MODELO_GRATIS_API_KEY"], privacidad: "nube-sin-retencion", licencia: null, verificado: "2026-10-29", fuente: "prueba" },
  { id: "opc-local", nombre: "Neurona local", tipo: "modelo", papeles: ["chat"], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "prueba" },
];
const VISTA: VistaOpciones = {
  ambito: "cuenta-personal",
  catalogo: CATALOGO,
  asignaciones: [
    { clave: "escritor", cadena: ["opc-gratis", "opc-local"], respaldo: [], preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null } },
    { clave: "chat", cadena: [], respaldo: [], preferencias: { localPrimero: true, privacidad: "local", presupuesto: null } },
  ],
  sugerencias: [
    { clave: "local-por-activar", titulo: "Local por activar", opciones: [{ id: "neurona-mia", nombre: "Neurona mia", tipo: "modelo", papeles: ["chat"], enlaceAlta: null, enlaceClave: null, limite: null, verificado: null, privacidad: "local", variables: [], motivo: "Capacidad local sin usar." }] },
    { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: [{ id: "opc-gratis", nombre: "Modelo gratis", tipo: "proveedor", papeles: ["escritor"], enlaceAlta: "https://ejemplo.alta", enlaceClave: "https://ejemplo.clave", limite: LIMITE, verificado: "2026-10-29", privacidad: "nube-sin-retencion", variables: ["MODELO_GRATIS_API_KEY"], motivo: "Gratis: crea tu cuenta y vincula la clave." }] },
    { clave: "sin-opcion", titulo: "Sin opción", papeles: [{ papel: "chat", motivo: "Ninguna neurona sirve para este papel." }] },
  ],
};

function pintar(vincular = vi.fn(async (): Promise<{ ok: boolean; huella: string | null }> => ({ ok: true, huella: "abcd1234ef56" }))) {
  return render(
    <AppearanceProvider>
      <AsistenteConectores ambito="cuenta-personal" cargar={vi.fn(async () => VISTA)} vincular={vincular} />
    </AppearanceProvider>,
  );
}

describe("resumenPorPapel (puro)", () => {
  it("da la cadena y el motivo por papel: sugerencia que lo cubre, o el porqué de «Sin opción»", () => {
    const resumen = resumenPorPapel(VISTA);
    expect(resumen.find((r) => r.papel === "escritor")).toMatchObject({ elegido: "Modelo gratis", motivo: "Gratis: crea tu cuenta y vincula la clave." });
    expect(resumen.find((r) => r.papel === "chat")).toMatchObject({ elegido: null, motivo: "Ninguna neurona sirve para este papel." });
  });
});

describe("AsistenteConectores (API simulada)", () => {
  it("paso 1: lo local con interruptores que se puede encender y apagar", async () => {
    pintar();
    expect(screen.getByText("Cargando opciones de conexión…")).toBeInTheDocument();
    const interruptor = await screen.findByRole("switch", { name: "Activar Neurona mia" });
    expect(screen.queryByLabelText("Clave de Modelo gratis")).not.toBeInTheDocument();
    fireEvent.click(interruptor);
    expect(screen.getByRole("switch", { name: "Activar Neurona mia" })).toBeChecked();
  });

  it("paso 2: «Vincular» abre el enlace oficial nueva pestaña; la clave se envía y se borra del campo", async () => {
    const vincular = vi.fn(async () => ({ ok: true, huella: "abcd1234ef56" }));
    pintar(vincular);
    fireEvent.click(await screen.findByText("Continuar"));
    const enlace = screen.getByTestId("enlace-opc-gratis");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("href", "https://ejemplo.alta");
    const campo = screen.getByLabelText("Clave de Modelo gratis");
    fireEvent.change(campo, { target: { value: "clave-minuscible" } });
    fireEvent.click(screen.getByText("Enviar clave"));
    await waitFor(() => {
      expect(vincular).toHaveBeenCalledWith("opc-gratis", "clave-minuscible");
      expect(screen.getByLabelText("Clave de Modelo gratis")).toHaveValue("");
    });
    const avisado = screen.getByText(/Huella: abcd1234ef56/);
    expect(avisado).toBeInTheDocument();
    expect(avisado.textContent).not.toContain("clave-minuscible");
    expect(screen.getByText(/Modelo gratis · vinculada/)).toBeInTheDocument();
  });

  it("paso 2: si la API rechaza, se avisa y la clave no queda nunca en el campo ni en pantalla", async () => {
    const rechazar = vi.fn(async () => ({ ok: false, huella: null }));
    pintar(rechazar);
    fireEvent.click(await screen.findByText("Continuar"));
    const campo = screen.getByLabelText("Clave de Modelo gratis");
    fireEvent.change(campo, { target: { value: "otra-clave" } });
    fireEvent.click(screen.getByText("Enviar clave"));
    expect(await screen.findByText("No se pudo guardar la clave en la bóveda.")).toBeInTheDocument();
    expect(screen.getByLabelText("Clave de Modelo gratis")).toHaveValue("");
    expect(screen.queryByText(/otra-clave/)).not.toBeInTheDocument();
  });

  it("paso 3: resumen por papel con la cadena elegida y su motivo", async () => {
    pintar();
    fireEvent.click(await screen.findByText("Continuar"));
    fireEvent.click(screen.getByText("Continuar"));
    expect(screen.getByText(/escritor/)).toBeInTheDocument();
    expect(screen.getByText("Cadena elegida: opc-gratis → opc-local")).toBeInTheDocument();
    expect(screen.getByText("Ninguna neurona sirve para este papel.")).toBeInTheDocument();
    expect(screen.getByText("Sin cadena elegida todavía.")).toBeInTheDocument();
  });

  it("si la API simulada no carga, avisa en lugar de quedarse en blanco", async () => {
    render(
      <AppearanceProvider>
        <AsistenteConectores ambito="cuenta-personal" cargar={vi.fn(async () => null)} />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("No se pudo cargar el catálogo del ámbito.")).toBeInTheDocument();
  });
});
