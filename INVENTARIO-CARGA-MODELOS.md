# Inventario de puntos de carga de modelos

## Resumen
Se identificaron **4 puntos principales** de carga de modelos con caché de promesas en el repositorio. De estos, **2 tienen manejo correcto de errores** (limpian la caché al fallar) y **2 NO lo tienen** (dejan la promesa rechazada cacheada).

---

## 1. `src/lib/aurora/stt-oss/oss-stt.ts` ✅ CORRECTO
- **Función**: `loadModel()` (línea 209)
- **Caché**: `pipelinePromise` + `pipelineModelId` (líneas 166-168)
- **Manejo de error**: En `.catch()` limpia `pipelinePromise = null` y `pipelineModelId = null` (líneas 327-332)
- **Patrón**: Correcto - permite reintento tras fallo

---

## 2. `src/ai/astraura/vision.ts` ✅ CORRECTO
- **Función**: `getVisionPipeline()` (línea 94)
- **Caché**: `visionPipelines` Map por modelId (línea 87)
- **Manejo de error**: `created.catch(() => { delete visionPipelines[modelId]; })` (línea 122)
- **Patrón**: Correcto - permite reintento tras fallo

---

## 3. `src/ai/astraura/builtin-engines.ts` ❌ **PROBLEMA**
### 3a. `getWebllmEngine()` (línea 126)
- **Caché**: `webllmEnginePromise` + `webllmLoadedModel` (líneas 115-116)
- **Manejo de error**: **NINGUNO** - si la promesa rechaza, queda cacheada
- **Impacto**: Reintentos posteriores devuelven la misma promesa rechazada

### 3b. `getTransformersPipeline()` (línea 177)
- **Caché**: `tfPipelinePromise` + `tfLoadedModel` (líneas 169-170)
- **Manejo de error**: **NINGUNO** - si la promesa rechaza, queda cacheada
- **Impacto**: Reintentos posteriores devuelven la misma promesa rechazada

---

## 4. `src/ai/astraura/router.ts` (caché de respuestas, NO de modelos)
- **Archivo**: `src/ai/astraura/cache-respuestas.ts`
- **Funciones**: `leerCache()`, `guardarCache()`, `claveCache()`
- **Nota**: Es caché de **respuestas de chat** (TTL 10 min, LRU 60 entradas), no de carga de modelos. `guardarCache` ya filtra respuestas vacías (línea 91). No afecta a la carga de modelos.

---

## Archivos a modificar
1. `src/ai/astraura/builtin-engines.ts` - Añadir `.catch()` que limpie la caché en ambas funciones internas

## Tests a crear
- `src/ai/astraura/__tests__/builtin-engines-rejected-cache.test.ts` - Tests para verificar que tras un fallo se puede reintentar

## Patrón de referencia (de `vision.ts`)
```typescript
const created = (async () => {
  // ... carga del modelo ...
})();
created.catch(() => { delete visionPipelines[modelId]; });
return created;
```

## Patrón de referencia (de `oss-stt.ts`)
```typescript
pipelinePromise = (async () => {
  // ... carga del modelo ...
})().catch((err) => {
  pipelinePromise = null;
  pipelineModelId = null;
  throw err;
});
```