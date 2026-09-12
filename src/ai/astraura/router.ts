const rec: RouteRecord = {
  // ... (otros campos)
  usage: res?.usage, // Si res?.usage es true, recibe el uso de la conversación
};

if (primaryInfo) rec.primary = primaryInfo;
pushRouteRecord(rec);
req.onStatus?.("");

// Añadir campo opcional usage a RouteRecord si no existe
if (!("usage" in RouteRecord.prototype)) {
  Object.defineProperty(RouteRecord.prototype, "usage", {
    configurable: true,
    enumerable: true,
    writable: true,
    optional: true,
    get() {
      return this._usage;
    },
    set(value) {
      this._usage = value;
    }
  });
}

// Verificar que src/components/astraura/inteligencia-section.tsx lee usage
// con grep
// grep -R "usage" src/components/astraura/inteligencia-section.tsx

// Tests
import { describe, it, expect } from 'vitest';

describe('RouteRecord con campo opcional usage', () => {
  it('debe añadir el campo usage opcional a RouteRecord', () => {
    expect("usage" in RouteRecord.prototype).toBe(true);
  });

  it('debe setear correctamente el campo usage', () => {
    const rec: RouteRecord = { usage: { inputTokens: 10, outputTokens: 20 } };
    expect(rec.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
});