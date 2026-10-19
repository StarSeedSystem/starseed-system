import { describe, it, expect } from "vitest";
import { fusionarCatalogos } from "../catalogo-opciones";
import { PROVEEDORES_CATALOGO } from "../../../../lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "../../../../ai/astraura/free-catalog";

describe("fusionarCatalogos", () => {
  it("should not have duplicate IDs", () => {
    const resultado = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    const ids = resultado.map(item => item.id);
    const idsUnicos = new Set(ids);
    expect(idsUnicos.size).toBe(ids.length);
  });

  it("should have all URLs as https", () => {
    const resultado = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    
    // Check that base URLs are https (for items that have them)
    for (const item of resultado) {
      // Skip items that don't have base URLs (like some special sources)
      if ((item as any).base && !(item as any).base.startsWith("https://")) {
        // Allow special cases like builtin:// or malla:// or http://localhost
        const base = (item as any).base;
        if (!base.startsWith("builtin://") && 
            !base.startsWith("malla://") && 
            !base.startsWith("http://localhost")) {
          expect(base).toMatch(/^https:/);
        }
      }
      
      // Check panelClaves/getKeyUrl equivalent - only if it looks like a URL
      const enlaceClave = item.enlaceClave;
      if (enlaceClave && enlaceClave.startsWith("http")) {
        expect(enlaceClave).toMatch(/^https:/);
      }
      
      // Check enlaceAlta - only if it looks like a URL
      const enlaceAlta = item.enlaceAlta;
      if (enlaceAlta && enlaceAlta.startsWith("http")) {
        expect(enlaceAlta).toMatch(/^https:/);
      }
    }
  });

  it("should have paid items outside of gratis", () => {
    const resultado = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    
    // Identify paid items (those with dePago: true in proveedores-catalogo)
    const paidItemIds = new Set(
      PROVEEDORES_CATALOGO
        .filter(p => p.dePago === true)
        .map(p => p.id)
    );
    
    // Check that paid items have gratis: null
    for (const item of resultado) {
      if (paidItemIds.has(item.id)) {
        expect(item.gratis).toBeNull();
      }
      
      // Also check that free items from free-catalog have gratis info
      // (This is harder to verify without knowing which are paid in free-catalog)
      // For now, we'll just verify the structure
    }
  });

  it("should correctly map proveedores-catalogo entries", () => {
    const resultado = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    
    // Find a provider that has papel defined
    const openaiItem = resultado.find(item => item.id === "openai");
    expect(openaiItem).toBeDefined();
    expect(openaiItem?.nombre).toBe("OpenAI · Astra (de pago)");
    expect(openaiItem?.tipo).toBe("proveedor");
    expect(openaiItem?.papeles).toContain("director");
    
    // Find Claude which should have papel: director
    const claudeItem = resultado.find(item => item.id === "claude");
    expect(claudeItem).toBeDefined();
    expect(claudeItem?.nombre).toBe("Claude · dirección y verificación");
    expect(claudeItem?.tipo).toBe("proveedor");
    expect(claudeItem?.papeles).toContain("director");
    
    // Find codex-suscripcion which should have papel: escritor
    const codexItem = resultado.find(item => item.id === "codex-suscripcion");
    expect(codexItem).toBeDefined();
    expect(codexItem?.nombre).toBe("Codex · suscripción ChatGPT");
    expect(codexItem?.tipo).toBe("proveedor");
    expect(codexItem?.papeles).toContain("escritor");
  });

  it("should correctly map free-catalog entries", () => {
    const resultado = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
    
    // Find a known free-catalog entry
    const ollamaLocalItem = resultado.find(item => item.id === "ollama-local");
    expect(ollamaLocalItem).toBeDefined();
    expect(ollamaLocalItem?.nombre).toBe("Ollama (este equipo)");
    expect(ollamaLocalItem?.tipo).toBe("modelo");
    expect(ollamaLocalItem?.requiereCuenta).toBe(false);
    expect(ollamaLocalItem?.privacidad).toBe("local");
  });
});