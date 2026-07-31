# Descargas de modelos locales en 2º plano + modelos propios (Adenda 113)

Roadmap **item #3** del mega-encargo: descargar modelos locales EN SEGUNDO PLANO (el OS se sigue
usando; se avisa al terminar) e integrar **modelos propios** con cualquier acceso — local, API con
clave o MCP — para LLM o voz. Se apoya en el instalador real ya existente (`installed-models.ts`).

## Piezas
- `src/ai/astraura/model-downloads.ts` (NUEVO): capa de cola/observabilidad sobre `installed-models`.
  `DownloadTask {sourceId,label,sizeLabel,state,pct,error,startedAt}`; `startDownload(sourceId)`
  (llama a `installModelInBackground`, que descarga de verdad y emite progreso); `_ingest(detail)`
  procesa los eventos `MODEL_DOWNLOAD_EVENT` (progreso/fin) → actualiza la tarea; al terminar fija
  `lastCompleted` y emite `MODEL_DOWNLOAD_DONE_EVENT` (notificación). `downloadTasksSnapshot`,
  `taskFor`, `subscribeDownloadTasks`, `uninstall`. Un listener DOM reenvía el evento real a
  `_ingest`; en tests se llama a `_ingest` directamente.
- `src/ai/astraura/custom-models.ts` (NUEVO): registro de **modelos propios**. `CustomModel
  {kind: llm|voice, access: local|api|mcp, endpoint?, apiKeyRef?, mcpServer?, model?}`. CRUD
  local-first (`addCustomModel/updateCustomModel/removeCustomModel/listCustomModels/
  customModelsByKind/subscribeCustomModels`). NO guarda la clave en claro (solo una referencia).
  Los del servidor StarSeed no se registran aquí (los ofrece el servidor oficial).
- `src/components/neurons/model-downloads-panel.tsx` (NUEVO): lista de modelos locales descargables
  (tamaño, requisitos de `model-requirements`, estado instalado, **«Descargar en 2º plano»** con
  barra de progreso viva, desinstalar) + alta de modelos propios (formulario local/API/MCP para LLM
  o voz) + lista. **Embebido** en el panel de Neuronas (`neuron-models-panel.tsx`).
- `src/components/neurons/model-download-notifier.tsx` (NUEVO): escucha `MODEL_DOWNLOAD_DONE_EVENT` y
  muestra un **toast** de éxito/error esté donde esté el usuario. Montado una vez en
  `src/app/(app)/app-providers.tsx`.

## Flujo
1. El usuario pulsa «Descargar en 2º plano» → `startDownload` inicia la descarga real (WebGPU/
   WebLLM/transformers.js cachean los pesos) y la tarea pasa a `downloading` con progreso.
2. Puede seguir usando el resto del OS; la descarga continúa (estado singleton en el cliente).
3. Al completar, `installed-models` marca instalado y `model-downloads` emite el aviso → **toast**
   global «Modelo listo… adáptalo a las personalidades de esta neurona».
4. Los modelos propios (local/API/MCP) quedan registrados y disponibles para configurarse por chat/
   personalidad/cerebro.

## Verificación
`scripts/test-model-downloads.ts` (23/23): etiquetas, ciclo descarga→progreso→hecho, error, acotado
de pct, snapshot, evento sin sourceId ignorado; CRUD de modelos propios con normalización de acceso/
kind (inválido → local/llm) y filtro por tipo.

## Pendiente / próximos pasos
- **Instalación completa de la app del OS** para modelos locales fuera del navegador (hoy se
  descargan los de navegador WebGPU/WASM; los de Ollama/LM Studio requieren el servidor local).
- Persistir la cola entre recargas duras (hoy sobrevive a la navegación SPA; el estado instalado sí
  persiste siempre).
- Probar/configurar el modelo propio desde la ficha (ping al endpoint/MCP) y auto-adaptar
  personalidades al terminar la descarga.

Roadmap restante del mega-encargo: (4) gestión completa por neurona; (5) seguridad de la 108.

*Relacionado: 109 (capacidades + requisitos de modelos), 111 (ventana de inicio/actualizaciones),
`installed-models.ts` (instalador real + HuggingBay).*
