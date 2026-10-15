import { describe, it, expect } from "vitest";
import { vetoPorPolitica, ordenarPorViabilidad } from "../adaptador-elegidores";
import { politicaDeTransporte, NFC_LIMITE_PUBLICO_BYTES } from '../cifrado/politica';
import type { Medio, ClaseDato } from "../tipos";

describe("vetoPorPolitica", () => {
  it.each([
    ['interno', 'lora', false],   // interno: cifrado E2E obligatorio -> permitido=true -> veto=false
    ['privado', 'lora', false],   // privado: cifrado E2E obligatorio -> permitido=true -> veto=false
    ['publico', 'lora', false],   // publico: puede ir sin cifrar -> permitido=true -> veto=false
    ['publico', 'webrtc', false], // publico: puede ir sin cifrar -> permitido=true -> veto=false
  ])("vetoPorPolitica(%s, %s) = %s", (clase, medio, expected) => {
    expect(vetoPorPolitica(clase as ClaseDato, medio as Medio)).toBe(expected);
  });
  
  it('should veto publico dato grande por NFC', () => {
    console.log(`NFC_LIMITE_PUBLICO_BYTES: ${NFC_LIMITE_PUBLICO_BYTES}`);
    const bytesGrande = NFC_LIMITE_PUBLICO_BYTES + 1;
    console.log(`bytesGrande: ${bytesGrande}`);
    console.log(`bytesGrande > NFC_LIMITE_PUBLICO_BYTES: ${bytesGrande > NFC_LIMITE_PUBLICO_BYTES}`);
    
    // Test politicaDeTransporte directly
    const resultado = politicaDeTransporte('publico', 'nfc', bytesGrande);
    console.log(`resultado.permitido: ${resultado.permitido}`);
    expect(resultado.permitido).toBe(false);
    
    // Therefore vetoPorPolitica should return true (vetoed)
    expect(vetoPorPolitica('publico', 'nfc')).toBe(true);
  });
  
  it('should not veto publico pequeno por cualquier medio', () => {
    // Test with small bytes
    const permitido = politicaDeTransporte('publico', 'lora', 100).permitido;
    expect(permitido).toBe(true);
    expect(vetoPorPolitica('publico', 'lora')).toBe(false);
  });
});

describe("ordenarPorViabilidad", () => {
  it('should sort array stably by score function', () => {
    interface Item { id: string; score: number; }
    
    const items: Item[] = [
      { id: 'a', score: 2 },
      { id: 'b', score: 1 },
      { id: 'c', score: 2 }, // Same score as 'a'
      { id: 'd', score: 3 }
    ];
    
    const sorted = ordenarPorViabilidad(items, item => item.score);
    
    // Should be sorted by score ascending: b(1), a(2), c(2), d(3)
    // For same score (a and c), should maintain original order (a before c)
    expect(sorted.map(item => item.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  
  it('should not mutate the original array', () => {
    const items = [{ id: 'a', score: 1 }, { id: 'b', score: 2 }];
    const original = [...items];
    
    ordenarPorViabilidad(items, item => item.score);
    
    expect(items).toEqual(original);
  });
});

describe("elegirEnlaces con opciones", () => {
  // We need to import some test helpers from eleccion-enlace.test.ts
  // Since we can't import from there directly, we'll recreate the necessary test helpers
  
  const LORA_MAX_BYTES = 200; // From eleccion-enlace.ts
  
  function enlace(p: Partial<import("@/lib/malla/eleccion-enlace").EnlaceDisponible> & Pick<import("@/lib/malla/eleccion-enlace").EnlaceDisponible, "id" | "tipo">): import("@/lib/malla/eleccion-enlace").EnlaceDisponible {
    return {
      etiqueta: p.id,
      alcanza: { syncDeviceId: "B" },
      abierto: true,
      sinInternet: false,
      admite: { mensaje: true, archivo: true, flujo: false },
      ...p,
    };
  }
  
  const local = enlace({ id: "local:1", tipo: "local", sinInternet: true, admite: { mensaje: true, archivo: true, flujo: true } });
  const cuentaLan = enlace({ id: "cuenta:B", tipo: "cuenta", ruta: "misma-red-local", rttMs: 4 });
  const cuentaNet = enlace({ id: "cuenta:B2", tipo: "cuenta", ruta: "internet-directo", rttMs: 40 });
  const cuentaTurn = enlace({ id: "cuenta:B3", tipo: "cuenta", ruta: "reenviado-turn", rttMs: 90 });
  const rele = enlace({ id: "rele", tipo: "rele", alcanza: { difusion: true }, admite: { mensaje: true, archivo: false, flujo: false } });
  const lora = enlace({ id: "lora", tipo: "lora", alcanza: { difusion: true }, sinInternet: true, maxBytes: LORA_MAX_BYTES, admite: { mensaje: true, archivo: false, flujo: false } });
  
  // Import elegirEnlaces from the actual module
  const { elegirEnlaces } = require('@/lib/malla/eleccion-enlace');
  
  it('should veto enlaces based on politica de transporte cuando opciones.clase is provided', () => {
    const destino = { syncDeviceId: "B" };
    const claseEnvio = "mensaje";
    
    // Test that without opciones, behavior is unchanged
    const sinOpciones = elegirEnlaces([local, cuentaLan], destino, claseEnvio, 0);
    expect(sinOpciones.elegidos.map(e => e.enlace.id)).toEqual(["cuenta:B", "local:1"]);
    
    // Test with opciones but without puntuar - should filter by politico de transporte
    const opcionesSinPuntuar = { clase: "interno" };
    // interno should allow all our test enlaces since they all admit mensaje and interno requiere cifrado E2E
    // which our test enlaces support (they admit mensaje and we assume they can do cifrado E2E)
    const conOpciones = elegirEnlaces([local, cuentaLan], destino, claseEnvio, 0, opcionesSinPuntuar);
    expect(conOpciones.elegidos.map(e => e.enlace.id)).toEqual(["cuenta:B", "local:1"]);
  });
  
  it('should sort by puntuar function within same rango cuando opciones.puntuar es proporcionado', () => {
    const destino = { syncDeviceId: "B" };
    const claseEnvio = "mensaje";
    
    // Create two enlaces con mismo rango pero diferentes puntuaciones para nuestra función puntuar
    const enlaceA = enlace({ id: "enlaceA", tipo: "cuenta", ruta: "misma-red-local", rttMs: 10 }); // rango 1
    const enlaceB = enlace({ id: "enlaceB", tipo: "cuenta", ruta: "misma-red-local", rttMs: 20 }); // rango 1
    
    // Mismo rango (1), así que sin puntuar, A debería venir antes que B debido a menor rttMs
    // Con puntuar que favorece a B, B debería venir antes que A
    
    const opciones = {
      puntuar: (e: import("@/lib/malla/eleccion-enlace").EnlaceDisponible) => {
        // Dar una puntuación más alta a enlaceB
        if (e.id === "enlaceB") return 100;
        return 0;
      }
    };
    
    // Import elegirEnlaces nuevamente para esta prueba (o usar el de arriba)
    const { elegirEnlaces: elegirEnlacesFunc } = require('@/lib/malla/eleccion-enlace');
    const resultado = elegirEnlacesFunc([enlaceA, enlaceB], destino, claseEnvio, 0, opciones);
    
    // Debe ordenarse por rango (ambos 1), luego por puntuar descendente (B primero, luego A)
    expect(resultado.elegidos.map(e => e.enlace.id)).toEqual(["enlaceB", "enlaceA"]);
  });
});