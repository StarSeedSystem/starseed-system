/** red-completa — regresión de la red completa (MRA11b/MAP1116B): `filasAPublicar` →
 * servidor falso con la política SQL (frescura de 15 min y membresía) → lectura pura. */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MESH_PRIVACY, type MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { filasAPublicar, type EleccionPublicar } from "@/lib/senales/espectro/publicacion";
import { leerSenalesPublicadas } from "@/lib/senales/espectro/leer-senales";
import type { Medio, SenalEspectro } from "@/lib/senales/espectro/tipos";
import type { MapaVivoRed } from "@/lib/senales/tipos-vivo";

const AHORA = 1_800_000_000_000, FRESCO_MS = 15 * 60_000, LAT_A = 19.4326, LON_A = -99.1332;

/** Fila tal como la guardaría `os_senales_publicas` (con `ficha`, que la lectura nunca usa). */
interface Fila {
  id: string; owner: string; owner_id: string; device_id: string; capa: "publica" | "comunidad" | "privada"; comunidad: string | null;
  medio: Medio; banda: string; frecuencia_khz: number | null; ancho_khz: number | null; fuerza_dbm: number | null;
  calidad: number | null; origen: "medida" | "declarada" | "estimada"; zona: string | null;
  medido_en: number; fuente: string; vinculo_tipo: "neurona"; vinculo_id: string;
  compatibles: never[]; ficha: Record<string, unknown>;
}

interface Servidor { cliente: (uid: string) => SupabaseClient; visibles: (uid: string) => Fila[] }

function senal(id: string, medio: Medio): SenalEspectro {
  return { id, medio, banda: medio === "lora" ? "EU 868" : "2.4 GHz", frecuenciaKhz: 2_437_000, anchoKhz: 20_000, fuerzaDbm: -60, calidad: 0.7, origen: "medida", capa: "propia", fuente: "medida por su dueño", medidoEn: AHORA - 10_000, zona: null, compatibles: [] };
}

function publicar(owner: string, propias: readonly SenalEspectro[], eleccion: EleccionPublicar, o: { comunidades?: readonly string[]; zona?: string | null; privacidad?: Partial<MeshPrivacySettings>; ahora?: number } = {}): Fila[] {
  const ahora = o.ahora ?? AHORA;
  return filasAPublicar({
    privacidad: { ...DEFAULT_MESH_PRIVACY, publicRadar: "visible", ...o.privacidad },
    internetPublico: true,
    eleccion: { publicar: eleccion, comunidades: [...(o.comunidades ?? [])], incluirZona: !!o.zona },
    propias: [...propias], ocupacion: [], zonaGruesa: o.zona ?? null, deviceId: `dev-${owner}`, ahora,
  }).map((f) => ({
    id: f.id, owner, owner_id: owner, device_id: `dev-${owner}`, capa: f.capa, comunidad: f.comunidad, medio: f.medio, banda: f.banda,
    frecuencia_khz: f.frecuenciaKhz, ancho_khz: f.anchoKhz, fuerza_dbm: f.fuerzaDbm,
    calidad: f.calidad, origen: f.origen, zona: f.zona, medido_en: f.medidoEn, fuente: f.fuente,
    vinculo_tipo: "neurona", vinculo_id: `neu-${owner}`, compatibles: [], ficha: { lat: LAT_A, lon: LON_A },
  }));
}

function servidor(filas: readonly Fila[], miembros: Readonly<Record<string, readonly string[]>>, hayTabla = true): Servidor {
  const visibles = (uid: string): Fila[] => filas.filter((f) =>
    f.owner === uid || (f.capa === "publica" && f.medido_en > AHORA - FRESCO_MS) ||
    (f.capa === "comunidad" && f.medido_en > AHORA - FRESCO_MS && (miembros[uid] ?? []).includes(f.comunidad ?? "")));
  const cliente = (uid: string): SupabaseClient => ({
    from: () => ({ select: () => ({ order: () => ({ limit: async () => hayTabla
      ? { data: visibles(uid), error: null }
      : { data: null, error: { code: "PGRST205", message: 'relation "os_senales_publicas" does not exist' } } }) }) }),
  } as unknown as SupabaseClient);
  return { cliente, visibles };
}

async function modeloDelMapa(cliente: SupabaseClient, uid: string): Promise<MapaVivoRed> {
  const r = await leerSenalesPublicadas({ cliente, uid });
  let motivo = r.motivo;
  if (r.estado === "sin-tabla") motivo = "las señales públicas aún no están activadas en este servidor";
  else if (r.estado === "ok" && r.senales.length === 0 && !motivo) motivo = "nadie más ha publicado en esta capa todavía";
  const cuentas = new Set(r.senales.map((s) => s.vinculo?.id).filter((x): x is string => !!x));
  return { senales: r.senales, estado: r.estado, motivo, otrasCuentasPublicando: cuentas.size };
}

describe("red completa en el modelo del mapa", () => {
  const A = "cuenta-a", B = "cuenta-b", C = "cuenta-c", D = "cuenta-d";
  const filas: Fila[] = [
    ...publicar(A, [senal("a-wifi", "wifi"), senal("a-lora", "lora")], { wifi: "publica", lora: "publica" }, { zona: "MEX" }),
    ...publicar(B, [senal("b-bt", "bluetooth")], { bluetooth: "comunidad" }, { comunidades: ["c1"] }),
  ];
  filas.push({ ...publicar(A, [senal("a-priv", "wifi")], { wifi: "comunidad" }, { comunidades: ["c1"] })[0], capa: "privada", comunidad: null });
  filas.push({ ...filas[0], id: "b-vieja", owner: B, owner_id: B, device_id: "dev-cuenta-b", medio: "lora", medido_en: AHORA - 20 * 60_000 });
  const miembros = { [C]: ["c1"], [D]: [] };

  it("C (miembro de c1) ve las tres; D (no miembro) solo las públicas y frescas", async () => {
    const srv = servidor(filas, miembros);
    const c = await modeloDelMapa(srv.cliente(C), C);
    const d = await modeloDelMapa(srv.cliente(D), D);
    expect(c.senales.map((s) => s.medio).sort()).toEqual(["bluetooth", "lora", "wifi"]);
    expect(c.otrasCuentasPublicando).toBe(2);
    expect(d.senales.map((s) => s.medio).sort()).toEqual(["lora", "wifi"]);
  });

  it("lo que A deja en capa privada solo lo ve A", async () => {
    const srv = servidor(filas, miembros);
    const a = await modeloDelMapa(srv.cliente(A), A);
    const c = await modeloDelMapa(srv.cliente(C), C);
    const d = await modeloDelMapa(srv.cliente(D), D);
    expect(a.senales.some((s) => s.id.endsWith("a-priv"))).toBe(false); // la lectura omite las propias
    expect(c.senales.some((s) => s.id.endsWith("a-priv"))).toBe(false);
    expect(d.senales.some((s) => s.id.endsWith("a-priv"))).toBe(false);
  });

  it("ningún objeto del modelo lleva lat/lon de otra cuenta", async () => {
    const c = await modeloDelMapa(servidor(filas, miembros).cliente(C), C);
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/"(lat|lon|lng|latitude|longitude|position|pos|coords)"\s*:/);
    expect(json).not.toContain(String(LAT_A));
    expect(json).not.toContain(String(LON_A));
    expect(c.senales.filter((s) => s.medio === "wifi").every((s) => s.zona === "MEX")).toBe(true);
  });

  it("con el radar en off no sale nada a la capa pública (filasAPublicar)", () => {
    const salida = filasAPublicar({
      privacidad: { ...DEFAULT_MESH_PRIVACY, publicRadar: "off" }, internetPublico: true,
      eleccion: { publicar: { wifi: "publica" }, comunidades: ["c1"], incluirZona: true },
      propias: [senal("off-wifi", "wifi")], ocupacion: [], zonaGruesa: "MEX", deviceId: "dev-a", ahora: AHORA,
    });
    expect(salida.filter((f) => f.capa === "publica")).toEqual([]);
    expect(salida).toHaveLength(1);
    expect(salida.every((f) => f.capa === "comunidad")).toBe(true);
  });

  it("sin la tabla el modelo dice el motivo en vez de una lista vacía", async () => {
    const c = await modeloDelMapa(servidor(filas, miembros, false).cliente(C), C);
    expect(c.estado).toBe("sin-tabla");
    expect(c.senales).toEqual([]);
    expect(c.motivo).toBe("las señales públicas aún no están activadas en este servidor");
  });
});
