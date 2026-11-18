import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extension,
  inyectarCrypto,
  canonico,
  hashDe,
  construirPaquete,
  type PaqueteIdioma,
  type CryptoProvider,
  type DatosPaquete,
} from "../paquete/formato";
import { validarPaquete } from "../paquete/validar";
import {
  crearAlmacenPaquetes,
  type AlmacenPaquetes,
  type AlmacenInterno,
  CLAVE_ALMACEN,
} from "../paquete/almacen";
import { cargarCatalogo, _reiniciarAlmacen, _limpiarCache } from "../catalogos/cargar";
import { desdeCsv } from "../paquete/importar-json-csv";
import { mapearClaves } from "../paquete/mapear";

const cryptoMock: CryptoProvider = {
  subtle: {
    async digest(_algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer> {
      const view = new Uint8Array(data);
      let hash = 0;
      for (let i = 0; i < view.length; i++) {
        hash = (hash * 31 + view[i]) >>> 0;
      }
      const buffer = new ArrayBuffer(32);
      const out = new Uint8Array(buffer);
      for (let i = 0; i < 32; i++) {
        out[i] = (hash >> (i % 8)) & 0xff;
      }
      return buffer;
    },
  },
};

function crearAlmacenFalso(): AlmacenInterno {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => { datos.set(clave, valor); },
    removeItem: (clave: string) => { datos.delete(clave); },
  };
}

const fuenteParaMapeo = {
  "Guardar": "Guardar",
  "Cancelar": "Cancelar",
  "Editar": "Editar",
  "Eliminar": "Eliminar",
  "Aceptar": "Aceptar",
  "Cerrar": "Cerrar",
  "Abrir": "Abrir",
  "Nuevo": "Nuevo",
  "Abrir la pizarra compartida de {0}.": "Abrir la pizarra compartida de {0}.",
};

beforeEach(() => {
  inyectarCrypto(cryptoMock);
  _limpiarCache();
  const almacenFalso = crearAlmacenFalso();
  const almacen = crearAlmacenPaquetes(almacenFalso);
  _reiniciarAlmacen(almacen);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    localStorage: almacenFalso,
  });
});

describe("paquete de idioma de punta a punta (eo, Esperanto)", () => {
  const datosBase: DatosPaquete = {
    codigo: "eo",
    nombre: "Esperanto",
    nombreIngles: "Esperanto",
    dir: "ltr",
    autor: { nombre: "StarSeed OS" },
    licencia: "MIT",
    entradas: {
      "Guardar": "Konservi",
      "Cancelar": "Nuligi",
      "Editar": "Redakti",
      "Eliminar": "Forigi",
      "Aceptar": "Akcepti",
      "Cerrar": "Fermi",
      "Abrir": "Malfermi",
      "Nuevo": "Nova",
      "Abrir la pizarra compartida de {0}.": "Malfermi la kunhavitan tabulon de {0}.",
    },
    revisado: { estado: "automatico" },
  };

  it("construirPaquete crea paquete válido con hash calculado", async () => {
    const paquete = await construirPaquete(datosBase);
    expect(paquete.formato).toBe("starseed-idioma");
    expect(paquete.version).toBe(1);
    expect(paquete.codigo).toBe("eo");
    expect(paquete.base).toBe("es");
    expect(paquete.revisado.estado).toBe("automatico");
    expect(paquete.hash).not.toBe("CALCULAR");
    expect(paquete.hash.length).toBe(64);
    expect(Object.keys(paquete.entradas)).toHaveLength(9);
  });

  it("validarPaquete acepta el paquete construido", async () => {
    const paquete = await construirPaquete(datosBase);
    const bruto = { ...paquete };
    const resultado = await validarPaquete(bruto, { digest: paquete.hash });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.paquete.codigo).toBe("eo");
      expect(resultado.paquete.entradas.Guardar).toBe("Konservi");
    }
  });

  it("guardarPaquete instala el paquete y cargarCatalogo lo carga", async () => {
    const paquete = await construirPaquete(datosBase);
    const almacenFalso = crearAlmacenFalso();
    const almacen = crearAlmacenPaquetes(almacenFalso);
    _reiniciarAlmacen(almacen);

    const guardado = almacen.guardarPaquete(paquete);
    expect(guardado.ok).toBe(true);

    const catalogo = await cargarCatalogo("eo", { preferirPaquete: true });
    expect(catalogo).not.toBeNull();
    expect(catalogo!.codigo).toBe("eo");
    expect(catalogo!.tamano).toBe(9);
  });

  it("el catálogo instalado traduce claves exactas y con marcador {0}", async () => {
    const paquete = await construirPaquete(datosBase);
    const almacenFalso = crearAlmacenFalso();
    const almacen = crearAlmacenPaquetes(almacenFalso);
    _reiniciarAlmacen(almacen);

    almacen.guardarPaquete(paquete);
    const catalogo = await cargarCatalogo("eo", { preferirPaquete: true });
    expect(catalogo).not.toBeNull();

    expect(catalogo!.traducir("Guardar")).toBe("Konservi");
    expect(catalogo!.traducir("Cancelar")).toBe("Nuligi");
    expect(catalogo!.traducir("Editar")).toBe("Redakti");
    expect(catalogo!.traducir("Eliminar")).toBe("Forigi");
    expect(catalogo!.traducir("Aceptar")).toBe("Akcepti");
    expect(catalogo!.traducir("Cerrar")).toBe("Fermi");
    expect(catalogo!.traducir("Abrir")).toBe("Malfermi");
    expect(catalogo!.traducir("Nuevo")).toBe("Nova");

    const conMarcador = catalogo!.traducir("Abrir la pizarra compartida de Tablero1.");
    expect(conMarcador).toBe("Malfermi la kunhavitan tabulon de Tablero1.");
  });

  it("rechaza paquete con valor <script> en validación y no se instala", async () => {
    const datosConScript: DatosPaquete = {
      ...datosBase,
      entradas: {
        ...datosBase.entradas,
        "Guardar": "<script>alert('xss')</script>",
      },
    };
    const paqueteMalo = await construirPaquete(datosConScript);
    const bruto = { ...paqueteMalo };

    const validacion = await validarPaquete(bruto, { digest: paqueteMalo.hash });
    expect(validacion.ok).toBe(false);
    if (validacion.ok === false) {
      expect(validacion.errores.some((e) => e.includes("Guardar"))).toBe(true);
    }

    const almacenFalso = crearAlmacenFalso();
    const almacen = crearAlmacenPaquetes(almacenFalso);
    _reiniciarAlmacen(almacen);

    if (validacion.ok) {
      almacen.guardarPaquete(paqueteMalo);
    }

    const catalogo = await cargarCatalogo("eo", { preferirPaquete: true });
    expect(catalogo).toBeNull();
  });

  it("CSV de dos columnas pasa por desdeCsv + mapearClaves + construirPaquete", async () => {
    const csv = `clave,traducción
Guardar,Konservi
Cancelar,Nuligi
Editar,Redakti
Eliminar,Forigi
Aceptar,Akcepti
Cerrar,Fermi
Abrir,Malfermi
Nuevo,Nova
"Abrir la pizarra compartida de {0}.","Malfermi la kunhavitan tabulon de {0}."
`;

    const importado = desdeCsv(csv, ",");
    expect(Object.keys(importado.entradas)).toHaveLength(9);
    expect(importado.descartadas).toHaveLength(0);

    const mapeado = mapearClaves(importado.entradas, fuenteParaMapeo);
    expect(mapeado.casadas).toBe(9);
    expect(mapeado.porcentaje).toBe(100);
    expect(mapeado.sinCasar).toHaveLength(0);

    const datosDesdeCsv: DatosPaquete = {
      codigo: "eo",
      nombre: "Esperanto",
      nombreIngles: "Esperanto",
      dir: "ltr",
      autor: { nombre: "StarSeed OS" },
      licencia: "MIT",
      entradas: mapeado.entradas,
      revisado: { estado: "automatico" },
    };

    const paquete = await construirPaquete(datosDesdeCsv);
    expect(paquete.codigo).toBe("eo");
    expect(paquete.entradas.Guardar).toBe("Konservi");
    expect(paquete.entradas["Abrir la pizarra compartida de {0}."]).toBe("Malfermi la kunhavitan tabulon de {0}.");

    const validacion = await validarPaquete({ ...paquete }, { digest: paquete.hash });
    expect(validacion.ok).toBe(true);

    const almacenFalso = crearAlmacenFalso();
    const almacen = crearAlmacenPaquetes(almacenFalso);
    _reiniciarAlmacen(almacen);

    const guardado = almacen.guardarPaquete(paquete);
    expect(guardado.ok).toBe(true);

    const catalogo = await cargarCatalogo("eo", { preferirPaquete: true });
    expect(catalogo).not.toBeNull();
    expect(catalogo!.traducir("Guardar")).toBe("Konservi");
    expect(catalogo!.traducir("Abrir la pizarra compartida de Tablero1.")).toBe("Malfermi la kunhavitan tabulon de Tablero1.");
  });
});