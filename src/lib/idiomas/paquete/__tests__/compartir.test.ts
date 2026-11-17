import { describe, it, expect } from "vitest";
import { aArchivo, aEnlace, desdeEnlace, trocear, reunir, type Trozo } from "../compartir";
import { inyectarCrypto, construirPaquete, type DatosPaquete } from "../formato";

const cryptoProvider = {
  subtle: {
    async digest(algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer> {
      const msg = new TextDecoder().decode(data);
      let hash = 0;
      for (let i = 0; i < msg.length; i++) {
        hash = ((hash << 5) - hash) + msg.charCodeAt(i);
        hash |= 0;
      }
      const buf = new ArrayBuffer(32);
      const view = new DataView(buf);
      view.setUint32(0, hash, false);
      return buf;
    }
  }
};

inyectarCrypto(cryptoProvider);

function paqueteEjemplo(): DatosPaquete {
  return {
    codigo: "es-ES",
    nombre: "Español",
    dir: "ltr",
    autor: { nombre: "Test" },
    licencia: "MIT",
    entradas: { "hola": "Hola mundo", "adios": "Adiós" }
  };
}

async function crearPaqueteConHash(): Promise<ReturnType<typeof construirPaquete>> {
  return construirPaquete(paqueteEjemplo());
}

describe("aArchivo", () => {
  it("debe generar nombre, contenido y tipo correctos", async () => {
    const paquete = await crearPaqueteConHash();
    const archivo = aArchivo(paquete);
    expect(archivo.nombre).toBe("es-es.starseed-lang.json");
    expect(archivo.tipo).toBe("application/json");
    const parsed = JSON.parse(archivo.contenido);
    expect(parsed.codigo).toBe("es-ES");
    expect(parsed.hash).toBe(paquete.hash);
  });
});

describe("aEnlace", () => {
  it("debe generar enlace con parámetro idioma", () => {
    const enlace = aEnlace("https://ejemplo.com/idiomas", "es-ES");
    expect(enlace).toBe("https://ejemplo.com/idiomas?idioma=es-ES");
  });

  it("debe preservar otros parámetros de la base", () => {
    const enlace = aEnlace("https://ejemplo.com/idiomas?region=europa", "fr-FR");
    expect(enlace).toBe("https://ejemplo.com/idiomas?region=europa&idioma=fr-FR");
  });
});

describe("desdeEnlace", () => {
  it("debe extraer idPublico de enlace válido mismo origen", () => {
    const base = "https://ejemplo.com/idiomas";
    const url = "https://ejemplo.com/idiomas?idioma=es-ES";
    expect(desdeEnlace(url, base)).toBe("es-ES");
  });

  it("debe rechazar http (no https)", () => {
    expect(desdeEnlace("http://ejemplo.com/idiomas?idioma=es-ES", "https://ejemplo.com/idiomas")).toBeNull();
  });

  it("debe rechazar origen distinto", () => {
    expect(desdeEnlace("https://otro.com/idiomas?idioma=es-ES", "https://ejemplo.com/idiomas")).toBeNull();
  });

  it("debe rechazar URL malformada", () => {
    expect(desdeEnlace("no-es-url", "https://ejemplo.com/idiomas")).toBeNull();
  });

  it("debe devolver null si falta parámetro idioma", () => {
    expect(desdeEnlace("https://ejemplo.com/idiomas", "https://ejemplo.com/idiomas")).toBeNull();
  });
});

describe("trocear", () => {
  it("debe dividir paquete en trozos con estructura correcta", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    expect(trozos.length).toBeGreaterThan(0);
    for (const t of trozos) {
      expect(t.indice).toBeGreaterThanOrEqual(0);
      expect(t.total).toBe(trozos.length);
      expect(t.hashPaquete).toBe(paquete.hash);
      expect(typeof t.datos).toBe("string");
      expect(() => atob(t.datos)).not.toThrow();
    }
  });

  it("debe reconstruir el paquete original al decodificar trozos", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 30);
    let binario = "";
    for (const t of trozos.sort((a, b) => a.indice - b.indice)) {
      binario += atob(t.datos);
    }
    const reconstruido = JSON.parse(binario);
    expect(reconstruido.codigo).toBe(paquete.codigo);
    expect(reconstruido.hash).toBe(paquete.hash);
  });
});

describe("reunir", () => {
  it("debe reunir trozos válidos y validar paquete", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const resultado = await reunir(trozos, paquete.hash);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.paquete.codigo).toBe(paquete.codigo);
      expect(resultado.paquete.hash).toBe(paquete.hash);
    }
  });

  it("debe fallar si falta un trozo", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const incompletos = trozos.slice(0, -1);
    const resultado = await reunir(incompletos, paquete.hash);
    expect(resultado.ok).toBe(false);
    if (resultado.ok === false) expect(resultado.motivo).toContain("Faltan");
  });

  it("debe fallar si hay trozo repetido", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const conRepetido = [...trozos, trozos[0]];
    const resultado = await reunir(conRepetido, paquete.hash);
    expect(resultado.ok).toBe(false);
    if (resultado.ok === false) expect(resultado.motivo).toContain("repetido");
  });

  it("debe fallar si trozo tiene índice fuera de rango", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const malo: Trozo = { ...trozos[0], indice: 999 };
    const resultado = await reunir([malo, ...trozos.slice(1)], paquete.hash);
    expect(resultado.ok).toBe(false);
    if (resultado.ok === false) expect(resultado.motivo).toContain("fuera de rango");
  });

  it("debe fallar si hashPaquete no coincide", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const malo: Trozo = { ...trozos[0], hashPaquete: "hash-falso" };
    const resultado = await reunir([malo, ...trozos.slice(1)], paquete.hash);
    expect(resultado.ok).toBe(false);
    if (resultado.ok === false) expect(resultado.motivo).toContain("Hash de paquete no coincide");
  });

  it("debe fallar si total es inconsistente", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const malo: Trozo = { ...trozos[0], total: 999 };
    const resultado = await reunir([malo, ...trozos.slice(1)], paquete.hash);
    expect(resultado.ok).toBe(false);
    if (resultado.ok === false) expect(resultado.motivo).toContain("Total inconsistente");
  });

  it("debe fallar si el paquete reconstruido no pasa validarPaquete", async () => {
    const paquete = await crearPaqueteConHash();
    const trozos = trocear(paquete, 50);
    const manipulado: Trozo = { ...trozos[0], datos: btoa('{"codigo":"invalido"}') };
    const resultado = await reunir([manipulado, ...trozos.slice(1)], paquete.hash);
    expect(resultado.ok).toBe(false);
  });
});

describe("ida y vuelta completa", () => {
  it("paquete → trozos → reunir → paquete válido igual al original", async () => {
    const original = await crearPaqueteConHash();
    const trozos = trocear(original, 50);
    const resultado = await reunir(trozos, original.hash);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.paquete.codigo).toBe(original.codigo);
      expect(resultado.paquete.hash).toBe(original.hash);
      expect(resultado.paquete.entradas).toEqual(original.entradas);
    }
  });
});