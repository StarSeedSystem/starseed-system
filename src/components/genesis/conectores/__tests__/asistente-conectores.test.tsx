/** Asistente «Conectar Genesis» · pruebas sin red: la carga y el envío de claves entran por props. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { GrupoSugerencias, Sugerencia } from "@/lib/genesis/conectores/sugerir";
import {
  AsistenteConectarGenesis,
  AsistenteConectores,
  estadoCloudroom,
  GRUPOS,
  resumenPorPapel,
  sugerenciaCloudroom,
  type EntradaEstadoCloudroom,
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

/** La entrada «cloudroom» tal como la devuelve sugerirParaAmbito (CRM1024B) cuando su contexto la soporta. */
function grupoCloudroom(): GrupoSugerencias {
  return { clave: GRUPOS.gratis, titulo: "Gratis por vincular", opciones: [
    sugerencia({ id: "cloudroom", nombre: "Cloudroom", tipo: "contenedor", privacidad: "nube-con-retencion",
      enlaceAlta: "https://cloudroom.dev",
      motivo: "Cloudroom: tu neurona de escritorio es compatible; cuenta con 100 agentes en la nube por ciclo de 30 días." })] };
}

const VISTA_CON_CLOUDROOM: VistaOpcionesAmbito = {
  sugerencias: [...GRUPOS_VISTA, grupoCloudroom()],
  asignaciones: VISTA.asignaciones,
};

function entradaCloudroom(sugerencias: readonly GrupoSugerencias[], consumos = 0): EntradaEstadoCloudroom {
  const ahora = 1_800_000_000_000;
  return { instalacion: "instalada", plan: { tipo: "gratis" },
    consumos: consumos > 0 ? [{ contextoId: "personal", t: ahora - 86_400_000, n: consumos }] : [],
    inicioCiclo: ahora, ahora, diasQueQuedan: 30, sugerencias };
}

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

describe("estadoCloudroom · honestidad de instalación y cupo (CRM1024F)", () => {
  it("encuentra la entrada cloudroom solo cuando el sugeridor la devuelve", () => {
    expect(sugerenciaCloudroom(VISTA_CON_CLOUDROOM.sugerencias)?.id).toBe("cloudroom");
    expect(sugerenciaCloudroom(VISTA.sugerencias)).toBeNull();
    expect(sugerenciaCloudroom([{ clave: "sin-opcion", titulo: "Sin opción", papeles: [] }])).toBeNull();
  });

  it("con plan gratis, ciclo y consumos: cupo restante y ritmo del contexto (CRM1024C)", () => {
    const estado = estadoCloudroom(entradaCloudroom(VISTA_CON_CLOUDROOM.sugerencias, 10));
    expect(estado.cupo).toBe(90);
    expect(estado.ritmo).toBe(3);
    expect(estado.ofrecible).toBe(true);
    expect(estado.texto).toMatch(/^Cloudroom instalada en esta neurona; 90 agente\(s\).*Sugerida para este ámbito/);
  });

  it("sin datos de cuenta ni del sugeridor: sin lectura y sin oferta, nunca se inventa", () => {
    const estado = estadoCloudroom({});
    expect(estado).toMatchObject({ instalacion: "sin-dato", cupo: null, ritmo: 0, sugerencia: null, ofrecible: false });
    expect(estado.texto).toMatch(/sin comprobar/);
    expect(estado.texto).toMatch(/Cupo sin lectura/);
    expect(estado.texto).toMatch(/No se ofrece como servidor aquí/);
  });

  it("no se ofrece si la neurona no tiene la app, aunque el sugeridor la devuelva", () => {
    const estado = estadoCloudroom({ instalacion: "no-instalada", sugerencias: VISTA_CON_CLOUDROOM.sugerencias });
    expect(estado.sugerencia?.id).toBe("cloudroom");
    expect(estado.ofrecible).toBe(false);
    expect(estado.texto).toMatch(/no instalada en esta neurona/);
  });
});

describe("Cloudroom en la interfaz · tarjeta honesta donde ya se leía el catálogo", () => {
  it("pinta estado y enlace solo dentro del paso gratis y solo cuando se ofrece", () => {
    render(<AsistenteConectarGenesis ambito="cuenta-demo" opciones={VISTA_CON_CLOUDROOM}
      cloudroom={entradaCloudroom(VISTA_CON_CLOUDROOM.sugerencias, 10)} />);
    expect(screen.getByTestId("cloudroom-instalacion")).toHaveTextContent("instalada en esta neurona");
    expect(screen.getByTestId("cloudroom-cupo")).toHaveTextContent("90 agente(s) en la nube · ritmo 3/día");
    const enlace = screen.getByRole("link", { name: "Abrir Cloudroom" });
    expect(enlace).toHaveAttribute("href", "https://cloudroom.dev");
    expect(enlace).toHaveAttribute("rel", "noreferrer");
    // Cloudroom no aparece como fila de clave en la lista gratis: su lugar es la tarjeta honesta
    expect(screen.queryByLabelText("Clave de Cloudroom")).toBeNull();
    // Paso 3 no repite la tarjeta
    fireEvent.click(screen.getByRole("tab", { name: /3\. Resumen por papel/ }));
    expect(screen.queryByTestId("cloudroom-instalacion")).toBeNull();
  });

  it("sin datos ni sugerencia no pinta nada de Cloudroom, y sin oferta avisa sin venderla", () => {
    const { container } = render(<AsistenteConectarGenesis ambito="cuenta-demo" opciones={VISTA} />);
    expect(screen.queryByTestId("cloudroom-instalacion")).toBeNull();
    expect(container.textContent).not.toMatch(/Cloudroom/);
    cleanup();
    render(<AsistenteConectarGenesis ambito="cuenta-demo" opciones={VISTA} cloudroom={{ instalacion: "sin-dato" }} />);
    expect(screen.getByTestId("cloudroom-instalacion")).toHaveTextContent("instalación sin comprobar en esta neurona");
    expect(screen.getByText("No se sugiere aquí; el catálogo la deja como una opción más, nunca la única.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir Cloudroom" })).toBeNull();
  });

  it("AsistenteConectores (sección de asignaciones): mismo cálculo por props, sin red ni reloj", () => {
    render(<AsistenteConectores entrada={entradaCloudroom(VISTA_CON_CLOUDROOM.sugerencias)} />);
    expect(screen.getByTestId("cloudroom-instalacion")).toHaveTextContent("instalada en esta neurona");
    expect(screen.getByTestId("cloudroom-cupo")).toHaveTextContent("100 agente(s) en la nube · ritmo 3/día");
    expect(screen.getByRole("status")).toHaveTextContent(/Sugerida para los agentes de este ámbito/);
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
