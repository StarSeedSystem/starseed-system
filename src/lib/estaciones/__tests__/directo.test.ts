import { describe, it, expect } from "vitest";
import {
  LATIDO_VIVO_MS,
  estadoDirecto,
  ordenarEstaciones,
  filtrarEstaciones,
  categoriasPopulares,
  type FiltroEstaciones,
} from "../directo";
import type { Estacion } from "../tipos";

const AHORA = new Date("2026-10-07T12:00:00.000Z").getTime();
const iso = (deltaMs: number) => new Date(AHORA + deltaMs).toISOString();

function base(parche: Partial<Estacion>): Estacion {
  return {
    id: "e1",
    owner_id: "u1",
    ambito_tipo: "persona",
    entidad_ref: null,
    titulo: "Radio libre",
    descripcion: "Señal abierta",
    tipo: "audio",
    fuente: "starseed",
    enlace: "/directo/e1",
    formato: "audio",
    imagen: null,
    idioma: "es",
    categorias: ["musica"],
    licencia: "cc0",
    visibilidad: "publica",
    empieza_en: null,
    termina_en: null,
    ultimo_latido: null,
    pausada: false,
    en_malla: false,
    espectadores: 0,
    created_at: iso(-3_600_000),
    updated_at: iso(-3_600_000),
    ...parche,
  };
}

describe("estadoDirecto", () => {
  it("pausada tiene prioridad", () => {
    expect(estadoDirecto(base({ pausada: true }), AHORA)).toBe("pausada");
  });
  it("terminada si termina_en pasó", () => {
    expect(estadoDirecto(base({ termina_en: iso(-1) }), AHORA)).toBe("terminada");
  });
  it("en-directo con latido fresco", () => {
    expect(estadoDirecto(base({ ultimo_latido: iso(-LATIDO_VIVO_MS + 1) }), AHORA)).toBe("en-directo");
  });
  it("latido viejo no cuenta", () => {
    expect(
      estadoDirecto(base({ ultimo_latido: iso(-LATIDO_VIVO_MS - 1) }), AHORA),
    ).toBe("terminada");
  });
  it("enlace externo sin latido y sin horario está en-directo", () => {
    expect(estadoDirecto(base({ fuente: "enlace", enlace: "https://x.tv" }), AHORA)).toBe("en-directo");
  });
  it("enlace externo sin latido dentro del horario está en-directo", () => {
    expect(
      estadoDirecto(
        base({ fuente: "enlace", empieza_en: iso(-60_000), termina_en: iso(60_000) }),
        AHORA,
      ),
    ).toBe("en-directo");
  });
  it("enlace externo con empieza_en futuro está programada", () => {
    expect(
      estadoDirecto(base({ fuente: "enlace", empieza_en: iso(60_000) }), AHORA),
    ).toBe("programada");
  });
  it("programada si empieza_en es futuro", () => {
    expect(estadoDirecto(base({ empieza_en: iso(60_000) }), AHORA)).toBe("programada");
  });
  it("cualquier otro caso es terminada", () => {
    expect(estadoDirecto(base({}), AHORA)).toBe("terminada");
  });
});

describe("ordenarEstaciones", () => {
  it("no muta la lista original", () => {
    const a = base({ id: "a", ultimo_latido: iso(-1) });
    const b = base({ id: "b", empieza_en: iso(60_000) });
    const lista = [a, b];
    const orden = ordenarEstaciones(lista, AHORA);
    expect(lista[0]).toBe(a);
    expect(orden).toHaveLength(2);
  });
  it("en-directo primero por espectadores y luego por actualización", () => {
    const d1 = base({ id: "d1", ultimo_latido: iso(-1), espectadores: 5 });
    const d2 = base({ id: "d2", ultimo_latido: iso(-1), espectadores: 9 });
    const d3 = base({
      id: "d3",
      ultimo_latido: iso(-1),
      espectadores: 9,
      updated_at: iso(-10_000),
    });
    const p1 = base({ id: "p1", empieza_en: iso(120_000) });
    const p2 = base({ id: "p2", empieza_en: iso(60_000) });
    const t1 = base({ id: "t1", updated_at: iso(-5_000) });
    const t2 = base({ id: "t2", updated_at: iso(-1_000) });
    const orden = ordenarEstaciones([t1, p1, d1, d3, t2, p2, d2], AHORA).map(
      (e) => e.id,
    );
    expect(orden).toEqual(["d3", "d2", "d1", "p2", "p1", "t2", "t1"]);
  });
});

describe("filtrarEstaciones", () => {
  const lista = () => [
    base({ id: "a", titulo: "Música Andina", categorias: ["musica"], tipo: "audio" }),
    base({
      id: "b",
      titulo: "Vídeo de montaña",
      descripcion: "Escalada en directo",
      categorias: ["deporte"],
      tipo: "video",
      idioma: "en",
      ultimo_latido: iso(-1),
    }),
    base({
      id: "c",
      owner_id: "u9",
      ambito_tipo: "persona",
      titulo: "Programa propio",
      categorias: [],
    }),
    base({
      id: "d",
      ambito_tipo: "entidad",
      entidad_ref: "grupo:flora",
      titulo: "D",
      categorias: [],
    }),
  ];
  const f = (p: FiltroEstaciones) => filtrarEstaciones(lista(), p, AHORA).map((e) => e.id);

  it("filtra por tipo", () => {
    expect(f({ tipo: "audio" })).toEqual(["a", "c", "d"]);
  });
  it("tipo 'todas' no filtra", () => {
    expect(f({ tipo: "todas" })).toHaveLength(4);
  });
  it("filtra por categoría sin acentos", () => {
    expect(f({ categoria: "MÚSICA" })).toEqual(["a"]);
  });
  it("filtra por idioma", () => {
    expect(f({ idioma: "en" })).toEqual(["b"]);
  });
  it("texto busca sin acentos ni mayúsculas en título, descripción y categorías", () => {
    expect(f({ texto: "andina" })).toEqual(["a"]);
    expect(f({ texto: "ESCALADA" })).toEqual(["b"]);
    expect(f({ texto: "musica" })).toEqual(["a"]);
    expect(f({ texto: "nada" })).toEqual([]);
  });
  it("soloEnDirecto deja solo las vivas", () => {
    expect(f({ soloEnDirecto: true })).toEqual(["b"]);
  });
  it("ambito coincide con entidad_ref", () => {
    expect(f({ ambito: "grupo:flora" })).toEqual(["d"]);
  });
  it("ambito persona:<uid> pide owner y ambito_tipo persona", () => {
    expect(f({ ambito: "persona:u9" })).toEqual(["c"]);
    expect(f({ ambito: "persona:u1" })).toEqual(["a", "b"]);
  });
  it("combina filtros", () => {
    expect(f({ tipo: "video", soloEnDirecto: true, idioma: "en" })).toEqual(["b"]);
  });
});

describe("categoriasPopulares", () => {
  it("cuenta, ordena y recorta al máximo", () => {
    const lista = [
      base({ categorias: ["b", "a"] }),
      base({ categorias: ["a", "c", "a"] }),
      base({ categorias: ["b"] }),
    ];
    expect(categoriasPopulares(lista)).toEqual([
      { categoria: "a", cuenta: 3 },
      { categoria: "b", cuenta: 2 },
      { categoria: "c", cuenta: 1 },
    ]);
  });
  it("empate se desempata alfabéticamente y respeta max", () => {
    const lista = [base({ categorias: ["z", "y"] }), base({ categorias: [] })];
    expect(categoriasPopulares(lista)).toEqual([
      { categoria: "y", cuenta: 1 },
      { categoria: "z", cuenta: 1 },
    ]);
    expect(categoriasPopulares(lista, 1)).toEqual([{ categoria: "y", cuenta: 1 }]);
  });
  it("lista vacía devuelve []", () => {
    expect(categoriasPopulares([])).toEqual([]);
  });
});
