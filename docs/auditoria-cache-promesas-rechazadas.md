# Auditoría: Caché de Promesas Rechazadas en Carga de Modelos

**Fecha:** 2026-11-26  
**Área:** social / aurora / vivo  
**Estado:** Especificación (descubrimiento completado, no edición)

---

## Resumen Ejecutivo

Se han identificado **6 puntos de carga de modelos** con caché de promesas en el repositorio. **1 de ellos tiene un defecto confirmado**: la promesa rechazada no se limpia, lo que impide reintentos tras fallos transitorios (red, CDN, timeout). Los otros 5 ya implementan limpieza correcta.

---

## Inventario Completo de Carga de Modelos con Caché de Promesas

| # | Archivo | Modelo | Variable de Caché | Limpieza en Rechazo | Estado |
|---|---------|--------|-------------------|---------------------|--------|
| 1 | `src/lib/aurora/stt-oss/oss-stt.ts` | Whisper (STT) | `transformersModPromise`, `pipelinePromise` | ✅ Sí (líneas 193-196, 327-331) | **Correcto** |
| 2 | `src/lib/aurora/tts-oss/oss-tts.ts` | Kokoro (TTS) | `kokoroModPromise`, `ttsPromise` | ✅ Sí (líneas 135-138, 261-264) | **Correcto** |
| 3 | `src/lib/aurora/wake-acoustic/porcupine-wake.ts` | Porcupine (Wake-word) | `porcupineModPromise` | ❌ **NO** (líneas 381-392) | **DEFECTUOSO** |
| 4 | `src/components/vivo/espacial/cargar-modelo.ts` | GLB (3D) | `cache` (Map<string, Promise>) | ✅ Sí (línea 99) | **Correcto** |
| 5 | `src/lib/map/leaflet-loader.ts` | Leaflet (Mapas) | `pending` (Promise) | ✅ Sí (líneas 67, 91) | **Correcto** |
| 6 | `src/lib/aurora/tts-oss/voice-identity.ts` | Síntesis neural (caché de resultados) | `cache` (Map<string, Promise>) | ✅ Sí (líneas 238-240) | **Correcto** |

---

## Detalle del Defecto Confirmado

### Archivo: `src/lib/aurora/wake-acoustic/porcupine-wake.ts`

**Líneas afectadas:** 381-392

```typescript
// Cacheamos el módulo del SDK entre llamadas (no re-descargar el ESM por CDN).
let porcupineModPromise: Promise<any> | null = null;

/** Importa `@picovoice/porcupine-web` desde la CDN una sola vez (memoizado). */
async function importPorcupine(): Promise<any> {
  if (porcupineModPromise) return porcupineModPromise;
  porcupineModPromise = (async () => {
    // `webpackIgnore` / `@vite-ignore`: import de runtime puro, no lo resuelve el bundler.
    const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ PORCUPINE_CDN);
    return mod;
  })();
  return porcupineModPromise;
}
```

**Problema:** La promesa `porcupineModPromise` **no se pone a `null` en caso de rechazo**. Si la CDN falla (timeout, 404, CORS, sin red), la promesa rechazada queda almacenada. La siguiente llamada a `importPorcupine()` devuelve la **misma promesa rechazada** en lugar de reintentar la descarga.

**Impacto:**
- Usuario activa wake-word acústico → fallo de red transitorio → porcupine no carga
- Usuario reintenta → misma promesa rechazada → fallo inmediato sin reintento real
- Requiere recargar la página para limpiar el estado del módulo

**Patrón correcto (usado en los otros 5 archivos):**
```typescript
porcupineModPromise = (async () => {
  const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ PORCUPINE_CDN);
  return mod;
})().catch((err) => {
  porcupineModPromise = null;  // ← FALTA ESTA LÍNEA
  throw err;
});
```

---

## Patrones de Limpieza Correctos Encontrados

### Patrón A: Variable de módulo + variable de modelo (oss-stt.ts, oss-tts.ts)
```typescript
let modPromise: Promise<any> | null = null;
let modelPromise: Promise<any> | null = null;

modPromise = (async () => { ... })().catch((err) => {
  modPromise = null;
  throw err;
});

modelPromise = (async () => { ... })().catch((err) => {
  modelPromise = null;
  throw err;
});
```

### Patrón B: Map con limpieza en `.catch()` (cargar-modelo.ts)
```typescript
const cache = new Map<string, Promise<THREE.Group>>();

export function cargarModelo(url: string): Promise<THREE.Group> {
  const previo = cache.get(url);
  if (previo) return previo;
  const p = (async () => { ... })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));  // ← Limpieza automática
  return p;
}
```

### Patrón C: Variable única con limpieza en callbacks de error (leaflet-loader.ts)
```typescript
let pending: Promise<LeafletNS> | null = null;

const fail = () => {
  pending = null;  // ← Limpieza en fallo
  reject(...);
};
```

### Patrón D: Caché de resultados con rechazo no cacheado (voice-identity.ts)
```typescript
const job = Promise.resolve()
  .then(factory)
  .catch(() => null)
  .then((blob) => {
    if (!blob) cache.delete(key);  // ← Fallo (null) NO se cachea
    return blob;
  });
```

---

## Especificación de Reparación

### Archivo a modificar: `src/lib/aurora/wake-acoustic/porcupine-wake.ts`

**Cambio mínimo (líneas 384-392):**

```typescript
/** Importa `@picovoice/porcupine-web` desde la CDN una sola vez (memoizado). */
async function importPorcupine(): Promise<any> {
  if (porcupineModPromise) return porcupineModPromise;
  porcupineModPromise = (async () => {
    // `webpackIgnore` / `@vite-ignore`: import de runtime puro, no lo resuelve el bundler.
    const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ PORCUPINE_CDN);
    return mod;
  })().catch((err) => {  // ← AÑADIR .catch()
    porcupineModPromise = null;  // ← LIMPIAR EN RECHAZO
    throw err;
  });
  return porcupineModPromise;
}
```

---

## Pruebas de Verificación

### Prueba unitaria propuesta (`src/lib/aurora/wake-acoustic/__tests__/porcupine-cache.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del import dinámico
vi.mock("@/lib/aurora/wake-acoustic/porcupine-wake", async () => {
  const actual = await vi.importActual("@/lib/aurora/wake-acoustic/porcupine-wake");
  return {
    ...actual,
    PORCUPINE_CDN: "https://cdn.jsdelivr.net/npm/@picovoice/porcupine-web@3.0.3/dist/esm/index.js",
  };
});

describe("importPorcupine - caché de promesas rechazadas", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("debe permitir reintentar tras fallo de red", async () => {
    const { importPorcupine } = await import("@/lib/aurora/wake-acoustic/porcupine-wake");
    
    // Primer intento: falla
    const p1 = importPorcupine();
    await expect(p1).rejects.toThrow();
    
    // Segundo intento: debe crear NUEVA promesa (no devolver la rechazada)
    const p2 = importPorcupine();
    expect(p2).not.toBe(p1);  // Promesas distintas = reintento real
  });
});
```

### Prueba de integración (manual)
1. Abrir página con wake-word acústico
2. Desactivar red / bloquear CDN jsDelivr
3. Activar wake-word → error esperado
4. Reactivar red
5. Activar wake-word de nuevo → **debe reintentar y cargar** (no fallar instantáneo)

---

## Archivos Relacionados (No Requieren Cambios)

| Archivo | Patrón | Verificado |
|---------|--------|------------|
| `src/lib/aurora/stt-oss/oss-stt.ts` | Patrón A | ✅ |
| `src/lib/aurora/tts-oss/oss-tts.ts` | Patrón A | ✅ |
| `src/components/vivo/espacial/cargar-modelo.ts` | Patrón B | ✅ |
| `src/lib/map/leaflet-loader.ts` | Patrón C | ✅ |
| `src/lib/aurora/tts-oss/voice-identity.ts` | Patrón D | ✅ |

---

## Criterios de Aceptación

- [ ] `importPorcupine()` limpia `porcupineModPromise = null` en `.catch()`
- [ ] Test unitario pasa: dos llamadas tras fallo devuelven promesas distintas
- [ ] Test de integración manual: reintento tras fallo de red funciona
- [ ] `bash scripts/enjambre/tsc-turno.sh` → verde
- [ ] `npx vitest run src/lib/aurora/wake-acoustic/__tests__/porcupine-cache.test.ts` → verde

---

## Notas Adicionales

- Este defecto existe desde la introducción del wake-word acústico (Ola ~350)
- No afecta al respaldo simple por energía (que no usa Porcupine)
- Solo afecta a usuarios con AccessKey de Picovoice configurado
- La reparación es de **1 línea efectiva** + test