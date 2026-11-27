# Auditoría: Caché de promesas rechazadas en carga de modelos

**Fecha:** 2026-11-27  
**Área:** social / modelos  
**Estado:** Auditoría completada — no se requiere reparación

---

## Resumen ejecutivo

Se ha auditado el código de carga de modelos en `src/lib/` y `src/components/` buscando el patrón anti-pattern de **caché de promesas rechazadas** (una promesa que falla queda guardada y contamina reintentos posteriores).

**Resultado:** El códigobase **ya maneja correctamente** este problema en todos los puntos de carga de modelos identificados. No se requiere reparación.

---

## Inventario de puntos de carga de modelos

| Archivo | Función | Patrón de caché | Manejo de error |
|---------|---------|-----------------|-----------------|
| `src/lib/aurora/stt-oss/oss-stt.ts` | `loadModel()`, `importTransformers()` | Promesas memoizadas en variables de módulo (`transformersModPromise`, `pipelinePromise`) | **Correcto:** En `catch` se nullifican las promesas (`transformersModPromise = null`, `pipelinePromise = null`, `pipelineModelId = null`) permitiendo reintentos limpios |
| `src/lib/mando/modelos-disponibles.ts` | `modelosXkiro()`, `modelosPasarelas()` | Objetos con TTL (`cacheXkiro`, `cachePasarelas`: `{ t: timestamp, modelos: [...] }`) | **Correcto:** Solo cachean resultados exitosos. En error devuelven caché anterior o `[]`; no guardan promesas rechazadas |
| `src/lib/astraura/modelos/instalar.ts` | `ejecutarInstalacion()`, `listarInstaladosOllama()` | Sin caché de promesas (streaming directo a Ollama) | **Correcto:** Cada llamada es independiente; errores se devuelven como `ResultadoInstalacion.ok = false` |
| `src/lib/astraura/modelos/use-modelos.ts` | Hook `useModelosNeurona()` | localStorage (claves `starseed.astraura.modelos.*`) | **Correcto:** Persistencia de estado, no de promesas |
| `src/lib/astraura/model-preferences.ts` | `getModelPreferences()`, `saveModelPreferences()` | localStorage (`starseed.astraura.model-order.v1`) | **Correcto:** Solo preferencias, sin carga de modelos |

---

## Análisis del patrón anti-pattern

El problema clásico es:

```typescript
// ❌ MALO: promesa rechazada queda en caché para siempre
let cache: Promise<Model> | null = null;
async function loadModel() {
  if (cache) return cache;
  cache = fetchModel(); // Si falla, cache = Promise<rejected>
  return cache;
}
```

### Lo que se encontró en el códigobase

#### 1. `src/lib/aurora/stt-oss/oss-stt.ts` (líneas 166-199, 292-332)

```typescript
let transformersModPromise: Promise<any> | null = null;
let pipelinePromise: Promise<any> | null = null;

async function importTransformers(): Promise<any> {
  if (transformersModPromise) return transformersModPromise;
  transformersModPromise = (async () => { ... })().catch((err) => {
    transformersModPromise = null;  // ✅ Limpia la caché en error
    throw err;
  });
  return transformersModPromise;
}

pipelinePromise = (async () => { ... })().catch((err) => {
  pipelinePromise = null;           // ✅ Limpia la caché en error
  pipelineModelId = null;
  throw err;
});
```

**Veredicto:** **Correcto**. El patrón `promise.catch(() => { cache = null; throw err; })` garantiza que una promesa rechazada nunca permanezca en la variable de caché.

#### 2. `src/lib/mando/modelos-disponibles.ts` (líneas 91, 343-385, 418-443)

```typescript
let cacheXkiro: { t: number; modelos: ModeloDisponible[] } | null = null;

async function modelosXkiro(): Promise<ModeloDisponible[]> {
  if (cacheXkiro && Date.now() - cacheXkiro.t < 10 * 60 * 1000) return cacheXkiro.modelos;
  // ...
  try {
    const r = await fetch(...);
    // ...
    cacheXkiro = { t: Date.now(), modelos };
    return modelos;
  } catch {
    return cacheXkiro?.modelos ?? [];  // ✅ Devuelve caché vieja o array vacío, no guarda error
  }
}
```

**Veredicto:** **Correcto**. La caché almacena **datos** (`modelos: []`), no promesas. Un fallo de red no contamina la variable de caché.

---

## Puntos verificados en `src/components/`

| Componente | Uso de carga de modelos | Veredicto |
|------------|------------------------|-----------|
| `src/components/settings/aurora-voice-fallback-panel.tsx` | Llama a `loadModel()` de `oss-stt.ts` | ✅ Usa la API correcta que ya limpia en error |
| `src/components/neurons/model-downloads-panel.tsx` | UI de descargas, no carga modelos | N/A |
| `src/components/neurons/neuron-models-panel.tsx` | UI de modelos instalados | N/A |
| `src/components/astraura/genesis/ser-ficha.tsx` | Solo muestra `modelos.loading` | N/A |

---

## Pruebas existentes

| Archivo | Qué prueba |
|---------|------------|
| `src/lib/aurora/stt-oss/__tests__/oss-stt.test.ts` | No existe (pendiente) |
| `src/lib/mando/__tests__/modelos-disponibles.test.ts` | No existe (pendiente) |
| `src/lib/astraura/modelos/__tests__/instalar.test.ts` | Pruebas de `planInstalar`, no de carga con caché |

**Nota:** No hay pruebas unitarias específicas que verifiquen el comportamiento de "reintento tras fallo" (el patrón de limpieza de caché en error).

---

## Especificación de pruebas recomendadas (para futura integración)

Si se desea añadir cobertura de regresión para este patrón, se recomiendan dos pruebas puras (vitest, sin `vi.mock` de módulos de Node):

### 1. `src/lib/aurora/stt-oss/__tests__/loadModel-reintento.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadModel, isModelReady } from "@/lib/aurora/stt-oss/oss-stt";

describe("loadModel: caché de promesa rechazada", () => {
  beforeEach(() => {
    vi.resetModules(); // importante: cada test carga el módulo fresco
  });

  it("permite reintentar tras un fallo de red simulado", async () => {
    // Requiere mockear import() dinámico o fetch interno — test de integración ligera
    // Se omite aquí por ser test de comportamiento, no unitario puro
    expect(true).toBe(true); // placeholder
  });
});
```

### 2. `src/lib/mando/__tests__/modelos-disponibles-cache.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { modelosXkiro, modelosPasarelas } from "@/lib/mando/modelos-disponibles";

describe("modelosXkiro/modelosPasarelas: caché solo de éxitos", () => {
  it("no guarda promesa rechazada en cacheXkiro", async () => {
    // Verificar que cacheXkiro sigue siendo null o datos tras error
    expect(true).toBe(true); // placeholder
  });
});
```

---

## Conclusión

**NO APLICA** — La reparación no es necesaria porque el códigobase **ya implementa correctamente** el patrón de limpieza de caché en error en todos los puntos de carga de modelos auditados.

- `oss-stt.ts`: Limpia `transformersModPromise` y `pipelinePromise` en `catch`
- `modelos-disponibles.ts`: Caché de datos con TTL, no de promesas; errores no contaminan la caché
- Resto de archivos: Sin patrón de caché de promesas

---

## Próximos pasos (opcionales)

1. Añadir pruebas de regresión (ver sección "Especificación de pruebas recomendadas") para blindar el comportamiento.
2. Documentar el patrón correcto en `architecture/patrones-carga-modelos.md` para futuras incorporaciones.