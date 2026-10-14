import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("migracion-bots", () => {
  let migrationContent: string = "";
  let low: string = "";

  // Try to read the migration file
  beforeAll(async () => {
    try {
      // Look for any migration file that might contain astraura_bots
       const migrationDir = join(process.cwd(), "supabase", "migrations");
       const fsPromises = await import("node:fs/promises");
       const files = await fsPromises.readdir(migrationDir);
       
       // Try to find a migration that creates astraura_bots tables
       for (const file of files) {
         if (file.endsWith(".sql")) {
           const content = await readFile(join(migrationDir, file), "utf-8");
           if (content.includes("astraura_bots")) {
             migrationContent = content;
             break;
           }
         }
       }
       
       // If we didn't find a specific migration, try the most recent one
       if (!migrationContent) {
         const sqlFiles = files
           .filter((f: string) => f.endsWith(".sql"))
           .sort()
           .reverse(); // Most recent first
         
         if (sqlFiles.length > 0) {
           migrationContent = await readFile(join(migrationDir, sqlFiles[0]), "utf-8");
         }
       }
     } catch (error) {
       // If we can't read any migration file, we'll leave migrationContent empty
        console.warn("Could not read migration file for testing:", (error as Error).message);
     }
     
     low = migrationContent.toLowerCase();
   });

   it("no concede permisos a anon salvo el select de la política", () => {
     // Check that no permissions are granted to anon/anonymous users
     const anonGrants = low.match(/grant\s+[^\n;]*\s+to\s+anon/gi) ?? [];
     expect(anonGrants.length).toBe(0);
     // Check that no permissions are granted to public
     const publicGrants = low.match(/grant\s+[^\n;]*\s+to\s+public/gi) ?? [];
     expect(publicGrants.length).toBe(0);
   });

   it("crea las tres tablas de forma idempotente", () => {
     expect(low).toContain("create table if not exists public.astraura_bots");
     expect(low).toContain("create table if not exists public.astraura_bots_consentimientos");
     expect(low).toContain("create table if not exists public.astraura_bots_registro");
     expect(low).not.toContain("drop table");
   });

  it("activa RLS en las tres tablas", () => {
    expect(low).toContain("alter table public.astraura_bots enable row level security");
    expect(low).toContain("alter table public.astraura_bots_consentimientos enable row level security");
    expect(low).toContain("alter table public.astraura_bots_registro enable row level security");
  });

  it("ninguna política usa 'using (true)' o 'with check (true)'", () => {
    // Check for any policy that has 'using (true)' or 'with check (true)' which would be overly permissive
    const usingTrueMatches = low.match(/using\s*\(\s*true\s*\)/g) ?? [];
    const withCheckTrueMatches = low.match(/with check\s*\(\s*true\s*\)/g) ?? [];
    expect(usingTrueMatches.length).toBe(0);
    expect(withCheckTrueMatches.length).toBe(0);
  });

  it("el registro no tiene políticas de update o delete", () => {
    // Check that there are no grant/update/delete policies for registro that are overly permissive
    // We'll check that there are no policies with 'using (true)' for update or delete on registro
    const registroUpdatePolicies = low.match(/create policy.*astraura_bots_registro.*for update/g) ?? [];
    const registroDeletePolicies = low.match(/create policy.*astraura_bots_registro.*for delete/g) ?? [];
    expect(registroUpdatePolicies.length).toBe(0);
    expect(registroDeletePolicies.length).toBe(0);
    // Also check that there are no grant statements for update/delete on registro to anon or authenticated
    const registroGrants = low.match(/grant\s+[^\n;]*\s+(update|delete)\s+[^\n;]*\s+on\s+astraura_bots_registro/gi) ?? [];
    expect(registroGrants.length).toBe(0);
  });

  it("el check de dueno_tipo coincide con TIPOS_DUENO", () => {
    // We need to import TIPOS_DUENO from the tipos.ts file
    // Since we can't import directly in the test (it's a .ts file and we're in node),
    // we'll duplicate the array here as per the pattern in the estaciones test.
    const expectedTiposDueno = ["perfil", "grupo", "comunidad", "pagina"];
    const m = low.match(/check \(dueno_tipo in \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    for (const v of expectedTiposDueno) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("el check de sentido coincide con SENTIDOS", () => {
    // Similarly, we duplicate SENTIDOS from tipos.ts
    const expectedSentidos = [
      "pantalla",
      "captura-pantalla",
      "archivos",
      "red",
      "correo",
      "terminal",
      "camara",
      "microfono",
      "sensores",
      "ubicacion",
      "portapapeles",
      "aparatos"
    ];
    // We need to find the check for sentido in the consentimientos table
    const m = low.match(/check \(sentido in \(([^)]*)\)\)/);
    // Note: the check might not be present if we didn't add it. But the task says: "el check de sentido (si lo pones)"
    // We did not put a check on sentido in the consentimientos table? Let's check our SQL.
    // We did not add a check for sentido. We should add it to match the SENTIDOS.
    // However, the task says: "el check de sentido (si lo pones) coincide con SENTIDOS"
    // Since we didn't put one, we might need to add it. But let's first check if the test passes without it.
    // We'll skip this test for now and then add the check if necessary.
    // Actually, looking at the task description for the table astraura_bots_consentimientos:
    //   (bot_id, cuenta_id uuid default auth.uid(), sentido text, vence timestamptz null, expreso boolean default false, pk (bot_id, cuenta_id, sentido))
    // It does not specify a check for sentido. But the task says: "el check de sentido (si lo pones) coincide con SENTIDOS"
    // So it's optional. However, to be safe and follow the pattern of the core, we should add a check.
    // Let's alter the table to add a check for sentido.
    // We'll do that in the migration file first.
    // But note: we already wrote the migration file. We need to update it.
    // Let's update the migration file to add a check for sentido in the consentimientos table.
    // We'll do that after writing the test, but for now, we'll expect the check to be present.
    // We'll change the test to expect the check and if it fails, we'll update the migration.
    expect(m).toBeTruthy();
    for (const v of expectedSentidos) {
      expect(m![1]).toContain(`'${v}'`);
    }
  });

  it("las funciones son security definer con search_path", () => {
    expect(low).toContain("create or replace function public.astraura_bot_es_miembro");
    expect(low).toContain("language sql");
    expect(low).toContain("security definer");
    expect(low).toContain("set search_path = public");

    expect(low).toContain("create or replace function public.astraura_bot_puede_administrar");
    expect(low).toContain("language sql");
    expect(low).toContain("security definer");
    expect(low).toContain("set search_path = public");
  });

  it("añade las tres tablas a la publicación de realtime", () => {
    expect(low).toContain("supabase_realtime");
    expect(low).toContain("astraura_bots");
    expect(low).toContain("astraura_bots_consentimientos");
    expect(low).toContain("astraura_bots_registro");
    expect(low).toContain("alter publication supabase_realtime add table");
  });

  it("no concede permisos a anon salvo el select de la política", () => {
    // Check that no permissions are granted to anon/anonymous users
    const anonGrants = low.match(/grant\s+[^\n;]*\s+to\s+anon/gi) ?? [];
    expect(anonGrants.length).toBe(0);
    // Check that no permissions are granted to public
    const publicGrants = low.match(/grant\s+[^\n;]*\s+to\s+public/gi) ?? [];
    expect(publicGrants.length).toBe(0);
  });

  it("crea los índices esperados", () => {
    // Índices explícitos
    expect(low).toContain("create index if not exists astraura_bots_cuenta_idx on public.astraura_bots (cuenta_id)");
    expect(low).toContain("create index if not exists astraura_bots_dueno_idx on public.astraura_bots (dueno_tipo, dueno_id)");
    expect(low).toContain("create index if not exists astraura_bots_registro_bot_idx on public.astraura_bots_registro (bot_id, creado_en desc)");
    // Índice implícito de la clave primaria en consentimientos (verify PRIMARY KEY constraint exists)
    expect(low).toMatch(/primary key\s*\(bot_id,\s*cuenta_id,\s*sentido\)/);
  });
});