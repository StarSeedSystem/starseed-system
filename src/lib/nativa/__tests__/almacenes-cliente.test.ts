import { describe, it, expect } from "vitest";
import type { Almacen, Resultado } from "@/lib/nativa/tipos";
import {
  bytesLegibles,
  candidatosParaCerebro,
  fraseAlmacenes,
  listarAlmacenesNativos,
  porcentajeLibre,
  resumenAlmacen,
  tieneIdentidad,
} from "@/lib/nativa/almacenes-cliente";

const base: Almacen = {
  etiqueta: "Disco USB",
  uuid: "abc",
  serie: "S1",
  sistema_archivos: "exfat",
  extraible: true,
  total_bytes: 100 * 1024 ** 3,
  libre_bytes: 50 * 1024 ** 3,
  punto_montaje: "/Volumes/USB",
  es_disco_sistema: false,
  tipo: "extraible",
  plataforma: "macos",
  motivo: null,
};

describe("candidatosParaCerebro", () => {
  it("excluye el disco del sistema, sin identidad y sin montaje", () => {
    const r = {
      plataforma: "macos",
      motivo: null,
      almacenes: [
        base,
        { ...base, es_disco_sistema: true },
        { ...base, uuid: "", serie: "" },
        { ...base, punto_montaje: "" },
      ],
    };
    expect(candidatosParaCerebro(r)).toEqual([base]);
  });
});

describe("tieneIdentidad", () => {
  it("basta con uuid o con serie", () => {
    expect(tieneIdentidad({ ...base, uuid: "", serie: "S" })).toBe(true);
    expect(tieneIdentidad({ ...base, uuid: " ", serie: "" })).toBe(false);
  });
});

describe("bytesLegibles y porcentajeLibre", () => {
  it("formatea en base 1024", () => {
    expect(bytesLegibles(0)).toBe("0 B");
    expect(bytesLegibles(512)).toBe("512 B");
    expect(bytesLegibles(1536)).toBe("1,5 KB");
    expect(bytesLegibles(50 * 1024 ** 3)).toBe("50 GB");
  });
  it("calcula el libre y acota", () => {
    expect(porcentajeLibre(base)).toBe(50);
    expect(porcentajeLibre({ total_bytes: 0, libre_bytes: 5 })).toBe(0);
    expect(porcentajeLibre({ total_bytes: 10, libre_bytes: 99 })).toBe(100);
  });
});

describe("resumenAlmacen", () => {
  it("resume en una línea", () => {
    expect(resumenAlmacen(base)).toBe("Disco USB · exfat · 50 GB libres de 100 GB");
    expect(resumenAlmacen({ ...base, etiqueta: " ", sistema_archivos: { desconocido: "zfs" } })).toBe(
      "Sin nombre · zfs · 50 GB libres de 100 GB",
    );
  });
});

describe("fraseAlmacenes", () => {
  it("traduce los rechazos", () => {
    expect(fraseAlmacenes("no-aplica: web")).toMatch(/app nativa/);
    expect(fraseAlmacenes("")).toBe("No se pudieron listar los almacenes.");
    expect(fraseAlmacenes("otro fallo")).toBe("otro fallo");
  });
});

describe("listarAlmacenesNativos", () => {
  const con = (r: Resultado<unknown>) => (async () => r) as never;
  it("sanea la respuesta correcta", async () => {
    const r = await listarAlmacenesNativos(
      con({ ok: true, valor: { almacenes: [base], plataforma: "macos", motivo: null } }),
    );
    expect(r.ok && r.valor.almacenes[0].uuid).toBe("abc");
  });
  it("rechaza una respuesta rota y traduce el error", async () => {
    const mala = await listarAlmacenesNativos(con({ ok: true, valor: 7 }));
    expect(mala.ok).toBe(false);
    const err = await listarAlmacenesNativos(con({ ok: false, motivo: "no-aplica" }));
    expect(!err.ok && err.motivo).toMatch(/app nativa/);
  });
});
