import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lee los .sql como texto (sin base de datos ni red): la migración solo está validada como texto.
const leer = (n: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", n), "utf8");
const subir = leer("20261116100000_spaces_rol_grupo.sql");
const bajar = leer("20261116100000_spaces_rol_grupo_rollback.sql");

/** Texto de un bloque desde su inicio hasta el siguiente `;` de cierre de sentencia. */
function bloque(sql: string, inicio: string): string {
  const i = sql.indexOf(inicio);
  expect(i).toBeGreaterThanOrEqual(0);
  const f = sql.indexOf("\n  );\n$$;", i);
  const g = sql.indexOf("\n  );\n", i);
  const fin = inicio.includes("FUNCTION") ? f + 8 : g + 6;
  return sql.slice(i, fin);
}

describe("migración spaces_rol_grupo (SVF1A1)", () => {
  it("define os_group_rank con SECURITY DEFINER, search_path y permiso solo a authenticated", () => {
    expect(subir).toMatch(/CREATE OR REPLACE FUNCTION public\.os_group_rank\(_slug text\)/);
    expect(subir).toMatch(/SECURITY DEFINER/);
    expect(subir).toMatch(/SET search_path = public/);
    expect(subir).toMatch(/GRANT EXECUTE ON FUNCTION public\.os_group_rank\(text\) TO authenticated/);
    expect(subir).toMatch(/FROM PUBLIC, anon/);
    expect(subir).toContain("os_entity_roles");
    expect(subir).toContain("os_memberships");
  });

  it("exige rango >= 2 y ya no usa os_is_group_member en space_can_edit ni sp_update", () => {
    expect(subir).toContain(">= 2");
    const fn = bloque(subir, "CREATE OR REPLACE FUNCTION public.space_can_edit");
    const pol = subir.slice(subir.indexOf("CREATE POLICY sp_update"));
    for (const t of [fn, pol]) {
      expect(t).toContain("os_group_rank(");
      expect(t).not.toContain("os_is_group_member(group_slug)");
      expect(t).not.toContain("os_is_group_member(s.group_slug)");
    }
    expect(pol.match(/os_group_rank\(group_slug\) >= 2/g)).toHaveLength(2); // USING y WITH CHECK
  });

  it("conserva las demás ramas y no toca sp_select ni otras políticas", () => {
    for (const rama of ["owner_account = auth.uid()", "os_owns_profile(", "space_editor_status("]) {
      expect(subir).toContain(rama);
    }
    const codigo = subir.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(codigo).not.toMatch(/sp_select|sp_insert|sp_delete|spe_/);
    expect(subir.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it("la reversa recupera os_is_group_member y borra os_group_rank", () => {
    expect(bajar).toContain("os_is_group_member(s.group_slug)");
    expect(bajar).toContain("os_is_group_member(group_slug)");
    expect(bajar).not.toContain(">= 2");
    expect(bajar).toMatch(/DROP FUNCTION IF EXISTS public\.os_group_rank\(text\)/);
    expect(bajar.trimEnd().split("\n").pop()).toContain("DROP FUNCTION IF EXISTS public.os_group_rank");
  });

  it("ninguno borra ni actualiza datos", () => {
    for (const sql of [subir, bajar]) {
      expect(sql).not.toMatch(/DELETE FROM/i);
      expect(sql).not.toMatch(/TRUNCATE/i);
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/UPDATE public\./i);
    }
  });

  it("ambos llevan el aviso de no aplicar sin la palabra de Alex", () => {
    expect(subir).toContain("NO APLICAR sin la palabra de Alex");
    expect(bajar).toContain("NO APLICAR sin la palabra de Alex");
  });
});
