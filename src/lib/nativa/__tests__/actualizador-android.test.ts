import { describe, it, expect } from "vitest";
import { abrirInstaladorAndroid, verificarPermisoAbrir, SOLO_NATIVA } from "../actualizador-android";

describe("actualizador-android", () => {
  describe("verificarPermisoAbrir", () => {
    it("permite abrir cuando existe shell:allow-open", () => {
      const perms = ["shell:allow-open", "core:default"];
      expect(verificarPermisoAbrir(perms).ok).toBe(true);
    });
    it("bloquea cuando falta permiso", () => {
      const perms: string[] = ["core:default"];
      const r = verificarPermisoAbrir(perms);
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain("shell:allow-open");
    });
  });

  describe("abrirInstaladorAndroid", () => {
    it("devuelve error sin Tauri", async () => {
      const r = await abrirInstaladorAndroid("https://example.com/app.apk", null);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe(SOLO_NATIVA);
    });
    it("abre URL con abridor simulado", async () => {
      const tauri = { shell: { open: async () => true } };
      const r = await abrirInstaladorAndroid("https://example.com/app.apk", tauri as any);
      expect(r.ok).toBe(true);
    });
  });
});
