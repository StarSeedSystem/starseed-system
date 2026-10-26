/** Pruebas del servicio puro de /api/genesis/conectores (Ola 1019G · GCA1019Lb).
 * Sólo funciones puras con DEPENDENCIAS FALSAS: sin red, disco, Supabase, reloj ni vi.mock de Node.
 * Ojo: nunca se prueba importando un route.ts (regla del repo); el módulo puro es `servicio.ts`. */
import { describe, it, expect } from "vitest";
import type { OpcionCatalogo } from "../catalogo-opciones";
import type { DependenciasConectores } from "../servicio";
import {
  catalogoDelAmbito,
  despacharAccion,
  leerAccionConectores,
} from "../servicio";

const opcion = (
  id: string,
  extras: Partial<OpcionCatalogo> = {},
): OpcionCatalogo => ({
  id,
  nombre: `Opción ${id}`,
  tipo: "proveedor",
  papeles: ["chat"],
  gratis: null,
  requiereCuenta: false,
  enlaceAlta: null,
  enlaceClave: null,
  variables: ["VAR_" + id.toUpperCase()],
  privacidad: "nube-con-retencion",
  licencia: null,
  verificado: null,
  fuente: "prueba",
  ...extras,
});

const catalogoFalso = (): Promise<OpcionCatalogo[]> =>
  Promise.resolve([
    opcion("gratis-uno", {
      nombre: "Gratis Uno clásico",
      gratis: { rpm: null, porDia: 100, horasMes: null, almacenamientoGb: null, nota: "100 al día" },
      requiereCuenta: true,
      enlaceAlta: "https://ejemplo.com/altas",
      enlaceClave: "https://ejemplo.com/claves",
    }),
    opcion("de-pago-uno"),
  ]);

const dependenciasFalsas = (recibidos: {
  vinculadas?: string[];
  asignadas?: { clave: string; cadena: string[] }[];
}): DependenciasConectores => {
  const vinculadas = new Set(recibidos.vinculadas ?? []);
  return {
    catalogo: catalogoFalso,
    asignacionesDelAmbito: (ambitoId) =>
      Promise.resolve(ambitoId === "ambito-1" ? (recibidos.asignadas ?? []) : []),
    ofertasDelAmbito: () => Promise.resolve([]),
    vinculadasDelAmbito: () => Promise.resolve(vinculadas),
    vincularClave: ({ valor }) =>
      Promise.resolve(valor === "secreto-1" ? { ok: true, huella: "huella-falsa-1" } : { ok: false, error: "bóveda llena" }),
    asignarCadena: () => Promise.resolve({ ok: true }),
  };
};

describe("leerAccionConectores", () => {
  it("«vacío» «JSON roto» «cuerpo no objeto» → 400", () => {
    for (const crudo of ["", "  ", "{quivo roto", "42"]) {
      const leida = leerAccionConectores(crudo);
      expect(leida.ok).toBe(false);
      if (!leida.ok) expect(leida.estado).toBe(400);
    }
  });

  it("sanea «vincular» (recorta el proveedor) y «asignar» (cadena como ARRAY o UNA CADENA)", () => {
    const vinculada = leerAccionConectores('{"accion":"vincular","proveedor":"  gratis-uno  ","valor":"secreto"}');
    expect(vinculada.ok).toBe(true);
    if (vinculada.ok && vinculada.accion.accion === "vincular") {
      expect(vinculada.accion.proveedor).toBe("gratis-uno");
      expect(vinculada.accion.valor).toBe("secreto");
    }
    const asignada = leerAccionConectores('{"accion":"asignar","clave":"chat","cadena":"gratis-uno"}');
    expect(asignada.ok).toBe(true);
    if (asignada.ok) expect(asignada.accion).toEqual({ accion: "asignar", clave: "chat", cadena: ["gratis-uno"] });
  });

  it("descarta valores raros en la cadena y rechaza acción, proveedor o valor desconocidos", () => {
    const mezcla = leerAccionConectores(
      '{"accion":"asignar","clave":"chat","cadena":["gratis-uno",1,null,""," "]}',
    );
    expect(mezcla.ok).toBe(true);
    if (mezcla.ok) expect(mezcla.accion).toEqual({ accion: "asignar", clave: "chat", cadena: ["gratis-uno"] });
    for (const crudo of [
      '{"accion":"borrar"}',
      '{"accion":"asignar","clave":"chat","cadena":[]}',
      '{"accion":"vincular","proveedor":"","valor":"s"}',
      '{"accion":"vincular","proveedor":"p"}',
    ]) {
      expect(leerAccionConectores(crudo).ok).toBe(false);
    }
  });
});

describe("catalogoDelAmbito", () => {
  it("con una asignación de chat devuelve sugerencias REALES del sugeridor (gratis por vincular)", async () => {
    const r = await catalogoDelAmbito(dependenciasFalsas({ asignadas: [{ clave: "chat", cadena: ["gratis-uno"] }] }), "ambito-1");
    expect(r.estado).toBe(200);
    const cuerpo = r.cuerpo as {
      ambito: string;
      sugerencias: { clave: string; opciones: { id: string; enlaceAlta: string | null }[] }[];
      asignaciones: { clave: string; cadena: string[] }[];
      catalogo: OpcionCatalogo[];
    };
    expect(cuerpo.ambito).toBe("ambito-1");
    const gratis = cuerpo.sugerencias.find((g) => g.clave === "gratis-por-vincular");
    if (gratis && "opciones" in gratis) {
      const uno = gratis.opciones.find((o) => o.id === "gratis-uno");
      expect(uno?.enlaceAlta).toBe("https://ejemplo.com/altas");
    } else {
      throw new Error("falta el grupo «gratis-por-vincular»");
    }
    expect(cuerpo.asignaciones).toEqual([{ clave: "chat", cadena: ["gratis-uno"] }]);
    expect(cuerpo.catalogo.map((o) => o.id).sort()).toEqual(["de-pago-uno", "gratis-uno"]);
  });

  it("sin asignaciones ni vinculadas devuelve el arreglo en firme pero vacío de papeles", async () => {
    const r = await catalogoDelAmbito(dependenciasFalsas({}), "ambito-2");
    expect(r.estado).toBe(200);
    const cuerpo = r.cuerpo as { sugerencias: { clave: string }[]; asignaciones: unknown[] };
    expect(cuerpo.asignaciones).toEqual([]);
    expect(cuerpo.sugerencias.map((g) => g.clave)).toContain("gratis-por-vincular");
  });

  it("si el catálogo falla la capa de datos responde 500 con error, sin tirar", async () => {
    const roto: DependenciasConectores = {
      ...dependenciasFalsas({}),
      catalogo: () => Promise.reject(new Error("BD caída")),
    };
    const r = await catalogoDelAmbito(roto, "ambito-1");
    expect(r.estado).toBe(500);
    expect((r.cuerpo as { error: string }).error).toContain("catálogo");
  });

  it("las asignaciones con ids que no están en el catálogo salen saneadas (regla del contrato)", async () => {
    const r = await catalogoDelAmbito(
      dependenciasFalsas({ asignadas: [{ clave: "chat", cadena: ["gratis-uno", "fantasma"] }] }),
      "ambito-1",
    );
    const cuerpo = r.cuerpo as { asignaciones: { cadena: string[] }[] };
    expect(cuerpo.asignaciones[0].cadena).toEqual(["gratis-uno"]);
  });

  it("una opción ya vinculada no vuelve a sugerirse como gratis-por-vincular", async () => {
    const r = await catalogoDelAmbito(dependenciasFalsas({ vinculadas: ["gratis-uno"] }), "ambito-1");
    const cuerpo = r.cuerpo as {
      sugerencias: { clave: string; opciones?: { id: string }[] }[];
    };
    const gratis = cuerpo.sugerencias.find((g) => g.clave === "gratis-por-vincular");
    const presentes = (gratis?.opciones ?? []).map((o) => o.id);
    expect(presentes).not.toContain("gratis-uno");
  });
});

describe("despacharAccion", () => {
  it("vincular responde SOLO la huella: ni el valor ni la cadena cifrada vuelven", async () => {
    const deps = dependenciasFalsas({});
    const r = await despacharAccion(deps, "ambito-1", { accion: "vincular", proveedor: "gratis-uno", valor: "secreto-1" });
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toEqual({ accion: "vincular", proveedor: "gratis-uno", huella: "huella-falsa-1" });
    expect(JSON.stringify(r.cuerpo)).not.toContain("secreto-1");
  });

  it("si la bóveda rechaza la clave, responde 500 con el error de la capa de datos", async () => {
    const r = await despacharAccion(dependenciasFalsas({}), "ambito-1", { accion: "vincular", proveedor: "p-1", valor: "otra-clave" });
    expect(r.estado).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain("otra-clave");
  });

  it("asignar con ids desconocidos: los descarta y si no queda ninguno responde 400", async () => {
    const deps = dependenciasFalsas({});
    const r = await despacharAccion(deps, "ambito-1", { accion: "asignar", clave: "chat", cadena: ["fantasma"] });
    expect(r.estado).toBe(400);
  });

  it("asignar guarda la cadena saneada y repite la acción con su resultado", async () => {
    const guardadas: { clave: string; cadena: string[] }[] = [];
    const deps = dependenciasFalsas({});
    deps.asignarCadena = ({ clave, cadena }) => {
      guardadas.push({ clave, cadena });
      return Promise.resolve({ ok: true });
    };
    const r = await despacharAccion(deps, "ambito-1", {
      accion: "asignar",
      clave: "chat",
      cadena: ["gratis-uno", "de-pago-uno", "fantasma"],
    });
    expect(r.estado).toBe(200);
    expect(guardadas[0]?.cadena).toEqual(["gratis-uno", "de-pago-uno"]);
    expect(r.cuerpo).toEqual({ accion: "asignar", clave: "chat", cadena: ["gratis-uno", "de-pago-uno"] });
  });
});
