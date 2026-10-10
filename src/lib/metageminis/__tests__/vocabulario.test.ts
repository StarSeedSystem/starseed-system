/**
 * El vocabulario de tipos.ts tiene que ser EXACTAMENTE el de la migración: si alguien cambia un estado, un tipo o
 * un canal en un lado y no en el otro, esta prueba cae (antes de que lo haga un INSERT en producción).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CANALES, ESTADOS_BORRADOR, ESTADOS_PIEZA, FORMATO_RE, IDS_RAMA, MEDIOS_AGENTE, TIPOS_PIEZA } from "../tipos";
import { puedeTransitarBorrador, puedeTransitarPieza } from "../cola";
import { TABLAS } from "../datos";

const SQL = readFileSync(path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20261011090000_metageminis.sql"), "utf8");

/** El cuerpo de `CREATE TABLE ... public.<tabla> (` hasta su `);`. */
function cuerpoTabla(tabla: string): string {
  const ini = SQL.indexOf(`CREATE TABLE IF NOT EXISTS public.${tabla} (`);
  expect(ini, `falta la tabla ${tabla}`).toBeGreaterThan(-1);
  const fin = SQL.indexOf("\n);", ini);
  return SQL.slice(ini, fin);
}

/** Los valores de `<columna> ... CHECK (<columna> IN ('a','b'))` de una tabla. */
function valoresCheck(tabla: string, columna: string): string[] {
  const linea = cuerpoTabla(tabla)
    .split("\n")
    .find((l) => new RegExp(`^\\s+${columna}\\s`).test(l) && /IN \(/.test(l));
  expect(linea, `${tabla}.${columna} sin CHECK IN`).toBeTruthy();
  const lista = linea!.match(/IN \(([^)]*)\)/)![1];
  return [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("los tipos reflejan la migración", () => {
  it("ramas", () => {
    expect([...IDS_RAMA].sort()).toEqual(valoresCheck("metageminis_ramas", "id").sort());
  });
  it("estados y canales de los borradores", () => {
    expect([...ESTADOS_BORRADOR].sort()).toEqual(valoresCheck("metageminis_borradores", "estado").sort());
    expect([...CANALES].sort()).toEqual(valoresCheck("metageminis_borradores", "canal").sort());
    expect(valoresCheck("metageminis_borradores", "puntuacion_nivel").sort()).toEqual(["alto", "bajo", "medio"]);
  });
  it("estados y tipos de las piezas", () => {
    expect([...ESTADOS_PIEZA].sort()).toEqual(valoresCheck("metageminis_piezas", "estado").sort());
    expect([...TIPOS_PIEZA].sort()).toEqual(valoresCheck("metageminis_piezas", "tipo").sort());
  });
  it("medios de los agentes", () => {
    expect([...MEDIOS_AGENTE].sort()).toEqual(valoresCheck("metageminis_agentes", "medio").sort());
  });
  it("las tablas que lee el panel existen en la migración", () => {
    for (const { tabla } of Object.values(TABLAS)) expect(SQL, tabla).toContain(`CREATE TABLE IF NOT EXISTS public.${tabla} (`);
  });
  it("las columnas de orden existen en su tabla", () => {
    for (const { tabla, orden } of Object.values(TABLAS)) expect(cuerpoTabla(tabla), `${tabla}.${orden}`).toMatch(new RegExp(`^\\s+${orden}\\s`, "m"));
  });
  it("las transiciones de estado son las que fuerza la base", () => {
    const fn = SQL.slice(SQL.indexOf("FUNCTION public.metageminis_transicion_ok"), SQL.indexOf("FUNCTION public.metageminis_guardia_borrador"));
    const bloque = (clave: string) => fn.slice(fn.indexOf(`WHEN '${clave}' THEN`));
    const pares = (texto: string): string[] => {
      const out: string[] = [];
      for (const m of texto.matchAll(/_de = '(\w+)' AND _a (?:IN \(([^)]*)\)|= '(\w+)')/g)) {
        const destinos = m[2] ? [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]) : [m[3]];
        for (const d of destinos) out.push(`${m[1]}>${d}`);
      }
      return out.sort();
    };
    const sqlBorrador = pares(bloque("borrador").slice(0, bloque("borrador").indexOf("WHEN 'pieza'")));
    const sqlPieza = pares(bloque("pieza").slice(0, bloque("pieza").indexOf("ELSE")));
    expect(sqlBorrador).toHaveLength(5);
    expect(sqlPieza).toHaveLength(4);
    const enTs = (estados: readonly string[], ok: (a: never, b: never) => boolean) =>
      estados.flatMap((a) => estados.filter((b) => ok(a as never, b as never)).map((b) => `${a}>${b}`)).sort();
    expect(enTs(ESTADOS_BORRADOR, puedeTransitarBorrador as never)).toEqual(sqlBorrador);
    expect(enTs(ESTADOS_PIEZA, puedeTransitarPieza as never)).toEqual(sqlPieza);
  });
  it("el patrón de formato de TypeScript acepta lo mismo que el de SQL en los casos habituales", () => {
    for (const ok of ["1080x1920@15s", "1920x1080", "1080x1350", "1280x720@6.5s"]) expect(FORMATO_RE.test(ok), ok).toBe(true);
    for (const mal of ["1080*1920", "1080x1920@15", "x1080", "1080x1920@s", "1080x1920@15m"]) expect(FORMATO_RE.test(mal), mal).toBe(false);
    expect(cuerpoTabla("metageminis_piezas")).toContain("^[0-9]{2,5}x[0-9]{2,5}(@[0-9]+(\\.[0-9]+)?s)?$");
  });
});
