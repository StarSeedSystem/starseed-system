/**
 * Tests de `avatar-busqueda-logica.ts` — toda lógica pura, sin red ni React.
 * Cubre exactamente lo que pide el encargo: componer la consulta, filtrar
 * por licencia, elegir candidato, decidir el respaldo — y el resto de
 * funciones puras que las acompañan (mapeo del proveedor, confirmación,
 * "subido", el código de fallo de la ruta).
 */
import { describe, expect, it } from "vitest";
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";
import {
  avatarFuenteProcedural,
  avatarFuenteSubido,
  candidatoDesdeOpenverse,
  codigoDesdeEstadoHttp,
  componerConsultaAvatar,
  confirmarEleccionAvatar,
  decidirModoEfectivo,
  elegirCandidatoDeterminista,
  filtrarCandidatosLibres,
  licenciaEsLibre,
  type CandidatoCrudoProveedor,
} from "@/components/astraura/genesis/avatar/avatar-busqueda-logica";

/* ─────────────────────────────── licenciaEsLibre ─────────────────────── */

describe("licenciaEsLibre", () => {
  it("acepta las cuatro licencias libres, en cualquier capitalización", () => {
    expect(licenciaEsLibre("cc0")).toBe(true);
    expect(licenciaEsLibre("PDM")).toBe(true);
    expect(licenciaEsLibre("By")).toBe(true);
    expect(licenciaEsLibre("BY-SA")).toBe(true);
  });

  it("rechaza licencias con restricción de uso comercial u obra derivada", () => {
    expect(licenciaEsLibre("by-nc")).toBe(false);
    expect(licenciaEsLibre("by-nd")).toBe(false);
    expect(licenciaEsLibre("by-nc-sa")).toBe(false);
    expect(licenciaEsLibre("by-nc-nd")).toBe(false);
  });

  it("rechaza ausencia de licencia y basura", () => {
    expect(licenciaEsLibre(null)).toBe(false);
    expect(licenciaEsLibre(undefined)).toBe(false);
    expect(licenciaEsLibre("")).toBe(false);
    expect(licenciaEsLibre("   ")).toBe(false);
    expect(licenciaEsLibre("copyright-todos-los-derechos")).toBe(false);
  });
});

/* ─────────────────────────────── filtrarCandidatosLibres ─────────────── */

describe("filtrarCandidatosLibres", () => {
  const base = (over: Partial<FuenteAvatar>): FuenteAvatar => ({
    modo: "enlinea",
    url: "https://example.org/a.jpg",
    consulta: "x",
    proveedor: "Openverse · flickr",
    licencia: "CC BY 4.0",
    atribucion: "algo",
    elegidoEn: null,
    ...over,
  });

  it("mantiene candidatos en línea con licencia libre reconocida", () => {
    const lista = [base({ licencia: "CC0 (dominio público)" }), base({ licencia: "CC BY-SA 2.0" })];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(2);
  });

  it("descarta un candidato en línea sin licencia", () => {
    const lista = [base({ licencia: null })];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(0);
  });

  it("descarta un candidato en línea con una licencia no reconocida (p. ej. restrictiva)", () => {
    const lista = [base({ licencia: "Todos los derechos reservados" })];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(0);
  });

  it("NO confunde 'CC BY-NC' (restrictiva) con el prefijo textual de 'CC BY' (libre)", () => {
    // Regresión: un `startsWith` ingenuo de la etiqueta "CC BY" coincidiría
    // por accidente con "CC BY-NC 4.0", que SÍ prohíbe uso comercial.
    const lista = [base({ licencia: "CC BY-NC 4.0" }), base({ licencia: "CC BY-NC-ND 4.0" })];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(0);
  });

  it("sí acepta 'CC BY' y 'CC BY-SA' con o sin número de versión", () => {
    const lista = [base({ licencia: "CC BY" }), base({ licencia: "CC BY 4.0" }), base({ licencia: "CC BY-SA" }), base({ licencia: "CC BY-SA 3.0" })];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(4);
  });

  it("un procedural pasa siempre, sin mirar `licencia`", () => {
    const lista = [{ modo: "procedural", url: null, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: null } as FuenteAvatar];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(1);
  });

  it("un subido pasa siempre, sin mirar `licencia` (es responsabilidad de quien lo sube)", () => {
    const lista = [{ modo: "subido", url: "https://x.example/y.png", consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: null } as FuenteAvatar];
    expect(filtrarCandidatosLibres(lista)).toHaveLength(1);
  });

  it("lista mixta: solo sobrevive lo en línea con licencia libre, más lo procedural/subido", () => {
    const lista: FuenteAvatar[] = [
      base({ licencia: "CC BY 4.0" }),
      base({ licencia: null }),
      base({ licencia: "by-nc" }),
      { modo: "procedural", url: null, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: null },
    ];
    const resultado = filtrarCandidatosLibres(lista);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].licencia).toBe("CC BY 4.0");
    expect(resultado[1].modo).toBe("procedural");
  });
});

/* ─────────────────────────────── candidatoDesdeOpenverse ─────────────── */

describe("candidatoDesdeOpenverse", () => {
  it("mapea un resultado cc0 válido con thumbnail", () => {
    const crudo: CandidatoCrudoProveedor = {
      thumbnail: "https://api.openverse.org/v1/images/abc/thumb/",
      url: "https://original.example/abc.jpg",
      license: "cc0",
      license_version: "1.0",
      creator: "Jane Doe",
      title: "Aurora",
      source: "flickr",
      provider: "flickr",
      foreign_landing_url: "https://flickr.com/photos/abc",
      attribution: null,
    };
    const c = candidatoDesdeOpenverse(crudo, "aurora dodecahedron");
    expect(c).not.toBeNull();
    expect(c?.modo).toBe("enlinea");
    expect(c?.url).toBe("https://api.openverse.org/v1/images/abc/thumb/"); // prioriza el thumbnail
    expect(c?.licencia).toBe("CC0 (dominio público) 1.0");
    expect(c?.consulta).toBe("aurora dodecahedron");
    expect(c?.elegidoEn).toBeNull(); // candidato, no elección
    expect(c?.proveedor).toBe("Openverse · flickr");
    expect(c?.atribucion).toContain('"Aurora"');
    expect(c?.atribucion).toContain("Jane Doe");
    expect(c?.atribucion).toContain("https://flickr.com/photos/abc");
  });

  it("usa la atribución YA REDACTADA del proveedor cuando viene, en vez de componer la propia", () => {
    const crudo: CandidatoCrudoProveedor = {
      thumbnail: "https://api.openverse.org/v1/images/x/thumb/",
      license: "by",
      title: "algo",
      creator: "alguien",
      attribution: "\"Algo\" by alguien is licensed under CC-BY 4.0.",
    };
    const c = candidatoDesdeOpenverse(crudo, "q");
    expect(c?.atribucion).toBe("\"Algo\" by alguien is licensed under CC-BY 4.0.");
  });

  it("cae al `url` original cuando no hay `thumbnail`", () => {
    const crudo: CandidatoCrudoProveedor = { url: "https://original.example/x.jpg", license: "by-sa" };
    const c = candidatoDesdeOpenverse(crudo, "q");
    expect(c?.url).toBe("https://original.example/x.jpg");
  });

  it("descarta un resultado sin licencia libre, aunque todo lo demás esté completo", () => {
    const crudo: CandidatoCrudoProveedor = {
      thumbnail: "https://api.openverse.org/v1/images/x/thumb/",
      license: "by-nc-nd",
      title: "algo",
      creator: "alguien",
    };
    expect(candidatoDesdeOpenverse(crudo, "q")).toBeNull();
  });

  it("descarta un resultado sin ninguna licencia declarada", () => {
    const crudo: CandidatoCrudoProveedor = { thumbnail: "https://api.openverse.org/v1/images/x/thumb/" };
    expect(candidatoDesdeOpenverse(crudo, "q")).toBeNull();
  });

  it("descarta un resultado con licencia libre pero sin ninguna imagen usable", () => {
    const crudo: CandidatoCrudoProveedor = { license: "cc0" };
    expect(candidatoDesdeOpenverse(crudo, "q")).toBeNull();
  });
});

/* ─────────────────────────────── componerConsultaAvatar ──────────────── */

describe("componerConsultaAvatar", () => {
  it("combina nombre, personalidad, arquetipo y rol, sin duplicados", () => {
    const q = componerConsultaAvatar({ nombre: "Aurora", personalidadNombre: "Aurora", arquetipo: "guía luminosa", rol: "asistente" });
    expect(q).toContain("Aurora");
    expect(q).toContain("guía luminosa");
    expect(q).toContain("asistente");
    // "Aurora" aparece una sola vez pese a repetirse en nombre y personalidad.
    expect(q.split("Aurora").length - 1).toBe(1);
  });

  it("nunca devuelve cadena vacía, incluso con casi todo ausente", () => {
    const q = componerConsultaAvatar({ nombre: "" });
    expect(q.length).toBeGreaterThan(0);
    expect(q).toContain("portrait avatar art");
  });

  it("usa la palabra del sólido como sustituto cuando no hay arquetipo declarado", () => {
    const q = componerConsultaAvatar({ nombre: "Hermes", solido: "tetraedro" });
    expect(q).toContain("tetrahedron crystal");
  });

  it("el arquetipo declarado GANA sobre el sólido derivado", () => {
    const q = componerConsultaAvatar({ nombre: "Hermes", arquetipo: "mensajero alado", solido: "tetraedro" });
    expect(q).toContain("mensajero alado");
    expect(q).not.toContain("tetrahedron");
  });

  it("es determinista: la misma semilla compone siempre la misma consulta", () => {
    const semilla = { nombre: "Mnemosyne", rol: "archivista", personalidadNombre: "Mnemosyne", solido: "esfera" as const };
    expect(componerConsultaAvatar(semilla)).toBe(componerConsultaAvatar({ ...semilla }));
  });

  it("recorta consultas muy largas a un tamaño razonable", () => {
    const q = componerConsultaAvatar({ nombre: "N".repeat(50), rol: "R".repeat(50), personalidadNombre: "P".repeat(50) });
    expect(q.length).toBeLessThanOrEqual(120);
  });
});

/* ─────────────────────────────── elegirCandidatoDeterminista ─────────── */

describe("elegirCandidatoDeterminista", () => {
  const candidato = (n: number, licencia: string | null = "CC BY 4.0"): FuenteAvatar => ({
    modo: "enlinea",
    url: `https://example.org/${n}.jpg`,
    consulta: "q",
    proveedor: "Openverse · flickr",
    licencia,
    atribucion: null,
    elegidoEn: null,
  });

  it("devuelve null con una lista vacía", () => {
    expect(elegirCandidatoDeterminista([], "ser-1")).toBeNull();
  });

  it("es determinista: mismo id + misma lista → misma elección, siempre", () => {
    const lista = [candidato(1), candidato(2), candidato(3), candidato(4)];
    const a = elegirCandidatoDeterminista(lista, "ser-42");
    const b = elegirCandidatoDeterminista([...lista], "ser-42");
    expect(a).toEqual(b);
  });

  it("solo elige entre los que tienen licencia libre reconocida", () => {
    const lista = [candidato(1, "by-nc"), candidato(2, null), candidato(3, "CC0 (dominio público)")];
    const elegido = elegirCandidatoDeterminista(lista, "ser-1");
    expect(elegido?.url).toBe("https://example.org/3.jpg");
  });

  it("con un solo candidato libre, siempre lo elige a él", () => {
    const lista = [candidato(1, "by-nc"), candidato(2, "CC BY-SA 4.0")];
    expect(elegirCandidatoDeterminista(lista, "cualquier-id")?.url).toBe("https://example.org/2.jpg");
  });

  it("ids distintos pueden producir elecciones distintas dentro de la misma lista", () => {
    const lista = Array.from({ length: 8 }, (_, i) => candidato(i));
    const elecciones = new Set(["a", "b", "c", "d", "e"].map((id) => elegirCandidatoDeterminista(lista, id)?.url));
    expect(elecciones.size).toBeGreaterThan(1);
  });
});

/* ─────────────────────────────── confirmarEleccionAvatar ─────────────── */

describe("confirmarEleccionAvatar", () => {
  it("fecha la elección sin tocar el resto de campos", () => {
    const candidato: FuenteAvatar = {
      modo: "enlinea", url: "https://x.example/a.jpg", consulta: "q", proveedor: "Openverse · flickr",
      licencia: "CC0 (dominio público)", atribucion: "algo", elegidoEn: null,
    };
    const confirmado = confirmarEleccionAvatar(candidato, 1_700_000_000_000);
    expect(confirmado.elegidoEn).toBe(1_700_000_000_000);
    expect({ ...confirmado, elegidoEn: null }).toEqual(candidato);
  });
});

/* ─────────────────────────────── avatarFuenteProcedural / subido ─────── */

describe("avatarFuenteProcedural", () => {
  it("siempre construye un modo procedural, sin url ni licencia, fechado", () => {
    const f = avatarFuenteProcedural(123);
    expect(f).toEqual({ modo: "procedural", url: null, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: 123 });
  });
});

describe("avatarFuenteSubido", () => {
  it("acepta una URL http(s) válida", () => {
    const f = avatarFuenteSubido("https://mi-boveda.example/avatar.png", 999);
    expect(f).toEqual({ modo: "subido", url: "https://mi-boveda.example/avatar.png", consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: 999 });
  });

  it("recorta espacios en blanco", () => {
    expect(avatarFuenteSubido("  https://x.example/a.png  ")?.url).toBe("https://x.example/a.png");
  });

  it("rechaza cadena vacía", () => {
    expect(avatarFuenteSubido("")).toBeNull();
    expect(avatarFuenteSubido("   ")).toBeNull();
  });

  it("rechaza texto que no es una URL", () => {
    expect(avatarFuenteSubido("no es una url")).toBeNull();
  });

  it("rechaza protocolos que no son http/https", () => {
    expect(avatarFuenteSubido("ftp://ejemplo.com/a.png")).toBeNull();
    expect(avatarFuenteSubido("javascript:alert(1)")).toBeNull();
  });
});

/* ─────────────────────────────── decidirModoEfectivo ──────────────────── */

describe("decidirModoEfectivo", () => {
  it("sin avatarFuente, siempre procedural", () => {
    expect(decidirModoEfectivo(undefined, false)).toBe("procedural");
    expect(decidirModoEfectivo(null, true)).toBe("procedural");
  });

  it("modo procedural declarado se mantiene, pase lo que pase con fallaCarga", () => {
    const f: FuenteAvatar = { modo: "procedural", url: null, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: 1 };
    expect(decidirModoEfectivo(f, false)).toBe("procedural");
    expect(decidirModoEfectivo(f, true)).toBe("procedural");
  });

  it("en línea con url y sin fallo se mantiene en línea", () => {
    const f: FuenteAvatar = { modo: "enlinea", url: "https://x.example/a.jpg", consulta: "q", proveedor: "p", licencia: "CC0 (dominio público)", atribucion: null, elegidoEn: 1 };
    expect(decidirModoEfectivo(f, false)).toBe("enlinea");
  });

  it("en línea con url pero fallo de carga cae a procedural", () => {
    const f: FuenteAvatar = { modo: "enlinea", url: "https://x.example/a.jpg", consulta: "q", proveedor: "p", licencia: "CC0 (dominio público)", atribucion: null, elegidoEn: 1 };
    expect(decidirModoEfectivo(f, true)).toBe("procedural");
  });

  it("en línea sin url cae a procedural aunque no haya fallo reportado", () => {
    const f: FuenteAvatar = { modo: "enlinea", url: null, consulta: "q", proveedor: "p", licencia: "CC0 (dominio público)", atribucion: null, elegidoEn: 1 };
    expect(decidirModoEfectivo(f, false)).toBe("procedural");
  });

  it("subido se comporta igual que en línea frente a fallo de carga", () => {
    const f: FuenteAvatar = { modo: "subido", url: "https://x.example/a.png", consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: 1 };
    expect(decidirModoEfectivo(f, false)).toBe("subido");
    expect(decidirModoEfectivo(f, true)).toBe("procedural");
    expect(decidirModoEfectivo({ ...f, url: null }, false)).toBe("procedural");
  });
});

/* ─────────────────────────────── codigoDesdeEstadoHttp ────────────────── */

describe("codigoDesdeEstadoHttp", () => {
  it("mapea los status conocidos", () => {
    expect(codigoDesdeEstadoHttp(401)).toBe("no_autenticado");
    expect(codigoDesdeEstadoHttp(429)).toBe("limite");
    expect(codigoDesdeEstadoHttp(503)).toBe("no_configurado");
    expect(codigoDesdeEstadoHttp(400)).toBe("entrada");
  });

  it("cualquier otro status cae en 'proveedor'", () => {
    expect(codigoDesdeEstadoHttp(500)).toBe("proveedor");
    expect(codigoDesdeEstadoHttp(502)).toBe("proveedor");
    expect(codigoDesdeEstadoHttp(404)).toBe("proveedor");
    expect(codigoDesdeEstadoHttp(0)).toBe("proveedor");
  });
});
