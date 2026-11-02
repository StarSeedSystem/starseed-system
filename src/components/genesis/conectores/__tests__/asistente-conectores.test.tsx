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
  estadoCloudroom,
  resumenPorPapel,
  sugerenciaCloudroom,
  type VistaOpcionesAmbito,
} from "../asistente-conectores";
import { SeccionAsignacionesGenesis } from "../seccion-asignaciones";

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

const INICIO = 1700000000000;
const ENLACE_CLOUDROOM = "https://cloudroom.dev";
function vistaConCloudroom(): VistaOpcionesAmbito {
  return {
    sugerencias: [
      ...GRUPOS_VISTA,
      { clave: GRUPOS.gratis, titulo: "Gratis por vincular",
        opciones: [sugerencia({ id: "cloudroom", nombre: "Cloudroom", tipo: "contenedor", papeles: [],
          enlaceAlta: ENLACE_CLOUDROOM, privacidad: "nube-con-retencion", verificado: true,
          motivo: "Cloudroom: tu neurona de escritorio es compatible; cuenta con 100 agentes en la nube por ciclo." })] },
    ],
    asignaciones: [],
  };
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

describe("sugerenciaCloudroom · solo cuando el sugeridor la devuelve", () => {
  it("devuelve la sugerencia de Cloudroom si algún grupo la trae", () => {
    expect(sugerenciaCloudroom(vistaConCloudroom().sugerencias)?.id).toBe("cloudroom");
  });

  it("devuelve null sin Cloudroom en la vista y también en el grupo sin-opcion", () => {
    expect(sugerenciaCloudroom(VISTA.sugerencias)).toBeNull();
    expect(sugerenciaCloudroom([{ clave: "sin-opcion", titulo: "Sin opción", papeles: [] }])).toBeNull();
  });
});

describe("estadoCloudroom · cálculo puro con cupo-cloudroom", () => {
  it("sin sugerencia del catálogo, no aparece nada aunque la neurona la tenga", () => {
    expect(estadoCloudroom(VISTA.sugerencias, { instalacion: "instalada" })).toBeNull();
  });

  it("con plan gratis declarado, calcula cupo restante, ritmo y el enlace oficial", () => {
    const estado = estadoCloudroom(vistaConCloudroom().sugerencias, {
      instalacion: "instalada",
      plan: { tipo: "gratis" },
      consumos: [{ contextoId: "personal", t: INICIO + 86400000, n: 10 }],
      inicioCiclo: INICIO,
      ahora: INICIO + 3 * 86400000,
      diasQueQuedan: 30,
    });
    expect(estado).not.toBeNull();
    expect(estado?.cupo).toBe(90);
    expect(estado?.ritmo).toBe(3);
    expect(estado?.texto).toContain("Instalada en esta neurona");
    expect(estado?.texto).toContain("90 agentes en la nube");
    expect(estado?.enlaceAlta).toBe(ENLACE_CLOUDROOM);
  });

  it("sin datos no inventa nada: instalación sin comprobar y cupo sin declarar", () => {
    const estado = estadoCloudroom(vistaConCloudroom().sugerencias, {});
    expect(estado?.instalacion).toBe("sin-dato");
    expect(estado?.cupo).toBeNull();
    expect(estado?.texto).toContain("sin comprobar");
    expect(estado?.texto).toContain("sin declarar");
  });

  it("declara con honestidad cuando la neurona NO tiene la app", () => {
    const estado = estadoCloudroom(vistaConCloudroom().sugerencias, { instalacion: "no-instalada" });
    expect(estado?.texto).toContain("No está instalada en esta neurona");
  });
});

describe("AsistenteConectarGenesis · cableado de Cloudroom en el paso de gratis", () => {
  it("pinta el bloque con estado honesto cuando la vista sugiere Cloudroom", () => {
    render(<AsistenteConectarGenesis ambito="cuenta-demo" opciones={vistaConCloudroom()}
      cloudroom={{ instalacion: "no-instalada" }} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    const bloque = screen.getByTestId("estado-cloudroom");
    expect(bloque).toHaveTextContent("Cloudroom");
    expect(bloque).toHaveTextContent("No está instalada en esta neurona");
    expect(bloque).toHaveTextContent("tu neurona de escritorio es compatible");
    expect(screen.getByRole("link", { name: "Abrir Cloudroom" })).toHaveAttribute("href", ENLACE_CLOUDROOM);
  });

  it("no pinta nada de Cloudroom si el sugeridor no la devolvió, aunque haya datos del contexto", () => {
    render(<AsistenteConectarGenesis ambito="cuenta-demo" opciones={VISTA}
      cloudroom={{ instalacion: "instalada", plan: { tipo: "gratis" }, inicioCiclo: INICIO, ahora: INICIO }} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    expect(screen.queryByTestId("estado-cloudroom")).not.toBeInTheDocument();
  });
});

describe("SeccionAsignacionesGenesis · cableado del asistente con Cloudroom", () => {
  const CICLO = { plan: { tipo: "gratis" as const }, inicioCiclo: INICIO,
    consumos: [{ contextoId: "personal", t: INICIO + 86400000, n: 10 }], ahora: INICIO + 3 * 86400000 };

  it("aplica el asistente con sugerencias de la escalera: Cloudroom llega solo cuando es relevante y la neurona la tiene", () => {
    render(<SeccionAsignacionesGenesis ambito="cuenta-demo" titulo="Asignaciones" onGuardar={() => {}}
      cloudroom={{ ...CICLO, instalacion: "instalada", relevante: true }} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    const bloque = screen.getByTestId("estado-cloudroom");
    expect(bloque).toHaveTextContent("Cloudroom");
    expect(bloque).toHaveTextContent("Instalada en esta neurona");
    expect(bloque).toHaveTextContent("90 agentes en la nube");
    expect(screen.getByRole("link", { name: "Abrir Cloudroom" })).toHaveAttribute("href", "https://cloudroom.dev");
  });

  it("sin relevancia declarada no muestra Cloudroom, aunque la app esté instalada", () => {
    render(<SeccionAsignacionesGenesis ambito="cuenta-demo" titulo="Asignaciones" onGuardar={() => {}}
      cloudroom={{ ...CICLO, instalacion: "instalada" }} />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. Gratis por vincular/ }));
    expect(screen.queryByTestId("estado-cloudroom")).not.toBeInTheDocument();
  });

  it("sin datos de la neurona no sugiere ni «Esta neurona» ni Cloudroom", () => {
    render(<SeccionAsignacionesGenesis ambito="cuenta-demo" titulo="Asignaciones" onGuardar={() => {}}
      cloudroom={{ relevante: true }} />);
    fireEvent.click(screen.getByRole("tab", { name: /1\. Local del contexto/ }));
    expect(screen.queryByText("Esta neurona")).not.toBeInTheDocument();
    expect(screen.queryByTestId("estado-cloudroom")).not.toBeInTheDocument();
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
