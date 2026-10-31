/**
 * Asignaciones de conectores · casos rescatados de la rama de la nube (RTCB1013L).
 * La API de hoy vive en `src/lib/genesis/conectores/escalera.ts`: el peldaño
 * numérico (1–6) sustituye a la etiqueta que usaba el panel antiguo.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import type { PermisoLanzamiento } from "@/lib/genesis/conectores/cupo-cloudroom";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";
import {
  DIRECTORES,
  PAPELES,
  accionGuardar,
  agregarACadena,
  disponiblesParaFila,
  entradasDeFila,
  estadoCloudroom,
  etiquetaFila,
  etiquetaPeldano,
  filasSugeridas,
  idsSugeridas,
  moverEnCadena,
  peldanoDe,
  quitarDeCadena,
  AsignacionesPanel,
  type AvisosContenedores,
  type FilaPanel,
} from "../asignaciones-panel";

const GRATIS = {
  rpm: 10,
  porDia: null,
  horasMes: null,
  almacenamientoGb: null,
  nota: "10 peticiones/min",
};

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
  return {
    id: overrides.id ?? "opcion",
    nombre: overrides.nombre ?? "Opción",
    tipo: overrides.tipo ?? "proveedor",
    papeles: overrides.papeles ?? ["escritor"],
    gratis: overrides.gratis === undefined ? GRATIS : overrides.gratis,
    requiereCuenta: overrides.requiereCuenta ?? false,
    enlaceAlta: overrides.enlaceAlta ?? null,
    enlaceClave: overrides.enlaceClave ?? null,
    variables: overrides.variables ?? [],
    privacidad: overrides.privacidad ?? "local",
    licencia: overrides.licencia ?? null,
    verificado: overrides.verificado ?? null,
    fuente: overrides.fuente ?? "prueba",
  };
}

const TAREA: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const CON_PAGO: Preferencias = { permitirPago: true, topeDiario: 5, prohibidos: [] };

describe("elegirCandidatos · peldaño de cada opción", () => {
  it("deduce el peldaño de cada opción del catálogo (local, malla, contenedor y pago)", () => {
    const ofertas: OfertaContexto[] = [
      { id: "astraura-local", nombre: "Astraura local", tipo: "modelo", papel: ["escritor"] },
    ];
    const catalogo = [
      opcion({ id: "astraura-local", tipo: "modelo" }),
      opcion({ id: "pago", gratis: null }),
      opcion({ id: "malla" }),
      opcion({ id: "contenedor", tipo: "contenedor" }),
    ];

    const candidatos = elegirCandidatos({
      tarea: TAREA,
      ofertas,
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: CON_PAGO,
    });

    const peldano = Object.fromEntries(candidatos.map((c) => [c.candidatoId, c.peldano]));
    expect(peldano["astraura-local"]).toBe(1);
    expect(peldano["pago"]).toBe(6);
    expect(peldano["malla"]).toBe(3);
    expect(peldano["contenedor"]).toBe(4);
  });
});

describe("AsignacionesPanel · filas por papel y director", () => {
  it("deduce el peldaño y no inventa límites gratis", () => {
    expect(peldanoDe(opcion({ id: "local" }))).toBe("local");
    expect(peldanoDe(opcion({ id: "cont", tipo: "contenedor", privacidad: "nube-sin-retencion" }))).toBe("contenedor");
    expect(peldanoDe(opcion({ id: "malla", tipo: "modelo", privacidad: "nube-sin-retencion" }))).toBe("malla");
    expect(peldanoDe(opcion({ id: "gratis", privacidad: "nube-sin-retencion" }))).toBe("gratis");
    expect(peldanoDe(opcion({ id: "pago", privacidad: "nube-con-retencion", gratis: null }))).toBe("pago");
    const sinLimite = opcion({ id: "sin-limite", gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "" } });
    const entradas = entradasDeFila({ tipo: "papel", clave: "escritor", cadena: ["sin-limite", "falta"] }, [sinLimite]);
    expect(entradas).toHaveLength(1);
    expect(entradas[0].peldano).toBe("local");
    expect(entradas[0].motivo).toContain("Límite no verificado");
  });

  it("crea una fila por cada papel y cada director, con lo local primero", () => {
    const catalogo = [
      opcion({ id: "pago", privacidad: "nube-con-retencion", gratis: null, nombre: "Pago" }),
      opcion({ id: "local", nombre: "Local" }),
      opcion({ id: "gratis", privacidad: "nube-sin-retencion", nombre: "Gratis" }),
    ];
    const filas = filasSugeridas(catalogo, 2);
    expect(filas).toHaveLength(PAPELES.length + DIRECTORES.length);
    expect(filas.filter((f) => f.tipo === "papel")).toHaveLength(7);
    expect(filas.filter((f) => f.tipo === "director")).toHaveLength(7);
    expect(filas[0]).toMatchObject({ tipo: "papel", clave: "escritor", cadena: ["local", "gratis"] });
    expect(etiquetaFila({ tipo: "director", clave: "diseno", cadena: [] })).toBe("Director · Diseño");
  });

  it("ordena, añade y quita sin mutar la cadena original", () => {
    const original = ["a", "b", "c"];
    expect(moverEnCadena(original, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moverEnCadena(original, -1, 2)).toEqual(["a", "b", "c"]);
    expect(agregarACadena(original, "d")).toEqual(["a", "b", "c", "d"]);
    expect(agregarACadena(original, "b")).toEqual(["a", "b", "c"]);
    expect(quitarDeCadena(original, "b")).toEqual(["a", "c"]);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("solo ofrece opciones del papel y que no estén ya en la cadena", () => {
    const fila: FilaPanel = { tipo: "papel", clave: "escritor", cadena: ["uno"] };
    const catalogo = [opcion({ id: "uno" }), opcion({ id: "dos" }), opcion({ id: "revisor", papeles: ["revisor"] })];
    expect(disponiblesParaFila(fila, catalogo).map((o) => o.id)).toEqual(["dos"]);
    expect(disponiblesParaFila({ ...fila, tipo: "director" }, catalogo).map((o) => o.id)).toEqual(["dos", "revisor"]);
  });

  it("escribe la etiqueta del peldaño en español, con inicial mayúscula", () => {
    expect(etiquetaPeldano("local")).toBe("Local");
    expect(etiquetaPeldano("malla")).toBe("Malla");
    expect(etiquetaPeldano("contenedor")).toBe("Contenedor");
    expect(etiquetaPeldano("gratis")).toBe("Gratis");
    expect(etiquetaPeldano("pago")).toBe("Pago");
  });

  it("en PoliGenesis democrático guardar propone en vez de aplicar", () => {
    expect(accionGuardar("aplicar")).toBe("aplicar");
    expect(accionGuardar("proponer")).toBe("proponer");
    expect(accionGuardar("sin-permiso")).toBe("nada");
  });
});

/* CRM1024F · Cloudroom en el panel: estado honesto y sugerencia solo del sugeridor. */

const CLOUDROOM = {
  id: "cloudroom",
  nombre: "Cloudroom",
  enlaceAlta: "https://cloudroom.dev",
  guia: null,
  requiereCuenta: true,
  requierePago: false,
  aptoPrivado: false,
  verificado: true,
};

const CICLO: PermisoLanzamiento = {
  plan: { tipo: "gratis" },
  consumos: [],
  inicioCiclo: "2026-10-01T00:00:00Z",
  ahora: "2026-10-31T00:00:00Z",
  contextos: [{ id: "personal", peso: 1 }],
  diasQueQuedan: 10,
};

describe("estadoCloudroom · honestidad de esta neurona y del cupo", () => {
  it("sin medidas ni cupo declarado, lo dice sin inventar nada", () => {
    const texto = estadoCloudroom();
    expect(texto).toContain("sin verificar en esta neurona");
    expect(texto).toContain("declara tu plan de Cloudroom");
  });

  it("con una oferta medida compatible, afirma que la app está en la neurona", () => {
    const avisos: AvisosContenedores = {
      ofertas: [{ id: "neurona", nombre: "Neurona", tipo: "contenedor", papel: ["código"], escritorioCompatible: true }],
    };
    expect(estadoCloudroom(avisos)).toContain("compatible verificada en esta neurona");
  });

  it("con el cupo del plan declara lo restante y su ritmo diario", () => {
    const texto = estadoCloudroom({ cupoCloudroom: CICLO });
    expect(texto).toContain("Cupo restante del ciclo: 100 agentes");
    expect(texto).toContain("ritmo diario: 10");
  });

  it("el cupo agotado se dice tal cual, sin ofrecer lanzar", () => {
    const agotado = { ...CICLO, consumos: [{ contextoId: "personal", n: 100, t: "2026-10-31T00:00:00Z" }] };
    expect(estadoCloudroom({ cupoCloudroom: agotado })).toContain("agotado hasta el próximo ciclo");
  });
});

describe("idsSugeridas · Cloudroom solo cuando la devuelve sugerirParaAmbito", () => {
  const filas: FilaPanel[] = [{ tipo: "papel", clave: "código", cadena: ["local-uno"] }];

  it("sin ofertas medidas del ámbito, no la sugiere", () => {
    expect(idsSugeridas(filas, [], { contenedores: [CLOUDROOM] }).has("cloudroom")).toBe(false);
  });

  it("con la app compatible medida y una tarea de código larga, sí la sugiere", () => {
    const avisos: AvisosContenedores = {
      contenedores: [CLOUDROOM],
      ofertas: [{ id: "neurona", nombre: "Neurona", tipo: "contenedor", papel: ["código"], escritorioCompatible: true }],
      relevanteCloudroom: true,
    };
    expect(idsSugeridas(filas, [], avisos).has("cloudroom")).toBe(true);
  });
});

describe("AsignacionesPanel · Cloudroom pintado", () => {
  afterEach(cleanup);

  const catalogo: OpcionCatalogo[] = [
    {
      ...opcion({ id: "cloudroom", tipo: "contenedor", nombre: "Cloudroom", privacidad: "nube-con-retencion", requiereCuenta: true }),
      papeles: [],
    },
    opcion({ id: "local-uno", nombre: "Local uno" }),
  ];

  it("muestra el estado honesto junto a la fila donde está Cloudroom", () => {
    const fila: FilaPanel = { tipo: "director", clave: "diseno", cadena: ["cloudroom"] };
    render(<AsignacionesPanel catalogo={catalogo} filasIniciales={[fila]} />);
    expect(screen.getByText(/App de escritorio sin verificar en esta neurona/)).toBeTruthy();
  });

  it("no marca «Sugerida» si el sugeridor no la devuelve, y sí cuando sí", () => {
    const filas: FilaPanel[] = [
      { tipo: "papel", clave: "código", cadena: [] },
      { tipo: "director", clave: "diseno", cadena: ["local-uno"] },
    ];
    const { unmount: desmonta } = render(
      <AsignacionesPanel catalogo={catalogo} filasIniciales={filas} avisos={{ contenedores: [CLOUDROOM] }} />,
    );
    expect(screen.queryByRole("option", { name: "Sugerida · Cloudroom" })).toBeNull();
    expect(screen.getByRole("option", { name: "Cloudroom" })).toBeTruthy();
    desmonta();

    render(
      <AsignacionesPanel
        catalogo={catalogo}
        filasIniciales={filas}
        avisos={{
          contenedores: [CLOUDROOM],
          ofertas: [{ id: "neurona", nombre: "Neurona", tipo: "contenedor", papel: ["código"], escritorioCompatible: true }],
          relevanteCloudroom: true,
        }}
      />,
    );
    expect(screen.getByRole("option", { name: "Sugerida · Cloudroom" })).toBeTruthy();
  });
});
