import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import { huellaDe, leerAmbito, leerPeticionOpciones } from "@/lib/genesis/conectores/api-conectores";
import { asignacionesDesdeFilas, filtrarCatalogo, ofertasDeCatalogo, vistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";

const LIMITE = { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 peticiones/min" };
const op = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
  id, nombre: id, tipo: "proveedor", papeles: ["chat"], gratis: LIMITE, requiereCuenta: true,
  enlaceAlta: `https://alta.example/${id}`, enlaceClave: `https://clave.example/${id}`,
  variables: ["PRUEBA_API_KEY"], privacidad: "nube-sin-retencion", licencia: null, verificado: null,
  fuente: "prueba", ...extra });

describe("leerAmbito", () => {
  it("acepta un ámbito recortado y rechaza vacío o demasiado largo", () => {
    expect(leerAmbito("  a1  ")).toBe("a1");
    expect(leerAmbito("   ")).toBeNull();
    expect(leerAmbito(null)).toBeNull();
    expect(leerAmbito("x".repeat(121))).toBeNull();
  });
});

describe("leerPeticionOpciones", () => {
  it("lee vincular recortando espacios y sin tocar el valor", () => {
    const r = leerPeticionOpciones({ accion: "vincular", proveedor: " groq ", valor: " sk-prueba " });
    expect(r).toEqual({ ok: true, peticion: { accion: "vincular", proveedor: "groq", valor: "sk-prueba" } });
  });

  it("lee asignar solo con un papel conocido", () => {
    const r = leerPeticionOpciones({ accion: "asignar", clave: "chat", cadena: "gratis-1" });
    expect(r).toEqual({ ok: true, peticion: { accion: "asignar", clave: "chat", cadena: "gratis-1" } });
    expect(leerPeticionOpciones({ accion: "asignar", clave: "director", cadena: "x" }).ok).toBe(false);
    expect(leerPeticionOpciones({ accion: "asignar", clave: "chat", cadena: " " }).ok).toBe(false);
  });

  it("rechaza cuerpos vacíos, acciones desconocidas y campos que faltan", () => {
    expect(leerPeticionOpciones(null).ok).toBe(false);
    expect(leerPeticionOpciones({ accion: "eliminar" }).ok).toBe(false);
    expect(leerPeticionOpciones({ accion: "vincular", proveedor: "groq" }).ok).toBe(false);
    expect(leerPeticionOpciones({ accion: "vincular", proveedor: "groq", valor: "" }).ok).toBe(false);
  });
});

describe("huellaDe", () => {
  it("devuelve la huella SHA-256 y nunca el valor", async () => {
    expect(await huellaDe("clave-de-prueba")).toBe(
      "1c9395741bff745f301ef2cee9732f0d0fa4ffd19ae78a5add4fc5dc1c380c04",
    );
    expect(await huellaDe("clave-de-prueba")).not.toContain("clave-de-prueba");
  });
});

describe("asignacionesDesdeFilas", () => {
  it("une filas del mismo papel y normaliza cadena, respaldo y preferencias", () => {
    const filas = [
      { clave: "chat", cadena: { cadena: ["a"], respaldo: ["b"], privacidad: "nube-sin-retencion", presupuesto: 5 } },
      { clave: "chat", cadena: { cadena: ["c"], respaldo: ["d"] } },
      { clave: "inventado", cadena: "x" },
      { clave: "voz", cadena: ["v1", "v1"] },
    ];
    const asignaciones = asignacionesDesdeFilas(filas);
    expect(asignaciones).toEqual([
      { clave: "chat", cadena: ["a", "c"], respaldo: ["b", "d"],
        preferencias: { localPrimero: true, privacidad: "nube-sin-retencion", presupuesto: 5 } },
      { clave: "voz", cadena: ["v1"], respaldo: [],
        preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null } },
    ]);
  });

  it("acepta cadenas sueltas, ignora basura y recorta textos largos", () => {
    const asignaciones = asignacionesDesdeFilas([{ clave: "escritor", cadena: "x".repeat(300) }, { clave: "chat", cadena: 7 }]);
    expect(asignaciones).toHaveLength(2);
    expect(asignaciones[0].cadena[0]).toHaveLength(200);
    expect(asignaciones[1]).toMatchObject({ clave: "chat", cadena: [] });
  });
});

describe("filtrarCatalogo y ofertasDeCatalogo", () => {
  const catalogo = [
    op("local-1", { privacidad: "local", papeles: ["chat"] }),
    op("nube-1", { privacidad: "nube-sin-retencion" }),
    op("nube-2", { privacidad: "nube-con-retencion" }),
  ];

  it("sin asignaciones deja el catálogo entero sin mutarlo", () => {
    const salida = filtrarCatalogo(catalogo, []);
    expect(salida.map((o) => o.id)).toEqual(["local-1", "nube-1", "nube-2"]);
    expect(salida).not.toBe(catalogo);
  });

  it("con un papel local solo deja lo local", () => {
    const asignaciones = asignacionesDesdeFilas([{ clave: "chat", cadena: { privacidad: "local" } }]);
    expect(filtrarCatalogo(catalogo, asignaciones).map((o) => o.id)).toEqual(["local-1"]);
  });

  it("con privacidad desconocida no filtra nada y solo las locales son ofertas", () => {
    const asignaciones = asignacionesDesdeFilas([{ clave: "chat", cadena: [] }]);
    expect(filtrarCatalogo(catalogo, asignaciones)).toHaveLength(3);
    expect(ofertasDeCatalogo(catalogo)).toEqual([
      { id: "local-1", nombre: "local-1", tipo: "proveedor", papel: ["chat"] },
    ]);
  });
});

describe("vistaOpciones", () => {
  it("cruza catálogo, asignaciones y sugerencias sin secretos y sin mutar la entrada", () => {
    const catalogo = [op("local-1", { privacidad: "local", papeles: ["chat"] }), op("gratis-1"), op("nube-2", { privacidad: "nube-con-retencion" })];
    const filas = [{ clave: "chat", cadena: { cadena: ["gratis-1"], respaldo: [], privacidad: "nube-sin-retencion" } }];
    const vista = vistaOpciones({ ambito: "a1", catalogo, filas, vinculadas: new Set(), contenedores: [] });
    expect(vista.ambito).toBe("a1");
    expect(vista.catalogo.map((o) => o.id)).toEqual(["local-1", "gratis-1"]);
    expect(vista.asignaciones).toEqual([{ clave: "chat", cadena: ["gratis-1"], respaldo: [], preferencias: { localPrimero: true, privacidad: "nube-sin-retencion", presupuesto: null } }]);
    expect(vista.sugerencias.map((g) => g.clave)).toEqual(["local-por-activar", "gratis-por-vincular", "sin-opcion"]);
    expect(JSON.stringify(vista)).not.toMatch(/valor-de-clave|secreto/);
    expect(catalogo).toHaveLength(3);
    expect(filas).toHaveLength(1);
  });

  it("aplica la escalera por papel del enjambre: la local del peldaño 1 queda primera", () => {
    const catalogo = [
      op("astraura-local", { tipo: "modelo", privacidad: "local", papeles: ["escritor"] }),
      op("gratis-1", { papeles: ["escritor"] }),
    ];
    const filas = [{ clave: "escritor", cadena: { privacidad: "nube-sin-retencion" } }];
    const vista = vistaOpciones({ ambito: "a1", catalogo, filas, vinculadas: new Set(), contenedores: [] });
    expect(vista.escaleras).toHaveLength(1);
    const escalera = vista.escaleras[0];
    expect(escalera.papel).toBe("escritor");
    expect(escalera.cadena[0]).toMatchObject({ id: "astraura-local", peldano: 1, posicion: 1 });
    expect(escalera.rutas[0].source.id).toBe("astraura-local");
    expect(escalera.rutas[0].local158Priority).toBe(true);
  });

  it("no añade escaleras para papeles que el enjambre no entiende (visión, voz…) ni con asignaciones vacías", () => {
    const vista = vistaOpciones({
      ambito: "a1",
      catalogo: [op("gratis-1", { papeles: ["visión"] })],
      filas: [{ clave: "visión", cadena: [] }],
      vinculadas: new Set(),
      contenedores: [],
    });
    expect(vista.escaleras).toEqual([]);
  });
});
