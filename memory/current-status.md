# StarSeed OS - Current Status (Updated 2026-08-23)

## 🧠 NOVEDAD (2026-08-23 · Adendas 153–155): Astraura 1.58-bit es el sistema primario de IA

- **Toda la inteligencia del OS pasa por defecto por el backend soberano Astraura 1.58-bit**
  (BitNet b1.58 2B-4T ternario, `llama-server` nativo gestionado en dos perfiles: interactivo para
  el chat y de fondo con prioridad baja para los procesos autónomos). Ollama, LM Studio, WebLLM,
  OpenRouter :free, Groq/Cerebras/Gemini, Pollinations y el servidor StarSeed **siguen operativos
  como secundarios**, con la cadena de failover intacta.
- **Configurable por ámbito**: agente > personalidad > cerebro > neurona > cuenta > defecto
  (`src/lib/astraura/primary-system.ts`, clave sincronizada con la cuenta).
- **Studio Astraura 1.58** (`/agent?tab=astraura-158&sub=…`, 13 secciones) opera de verdad los
  procesos del backend: imaginación intuitiva, sueños, enjambre multi-área, Director «Metis»,
  orquestador de autorizaciones, sentidos y air-gap, almacenamiento, proyectos, memoria y voz.
- **Personalidades y agentes 1.58 sembrados** en las bibliotecas del OS (`p158-*`, `agent158-*`)
  con su primario fijado; menciones `@Hermes @Logos` activan el modo multi-personalidad.
- **Notificaciones especiales** de los procesos autónomos en el centro de avisos del OS
  (puente `/api/starseed/events` + ack, reparto justo por proceso).
- **Corrección crítica del motor**: el llama.cpp del submódulo BitNet usaba SiLU donde el 2B-4T usa
  **ReLU²** → perplejidad **40.9 → 5.38**. Guarda: `backend/scripts/check_bitnet_patch.sh` (repo astraura).
- **Verificación funcional real**: 11/11 PASS con el modelo cargado
  (`backend/scripts/verify_real_ola3.py`); OS con `tsc` 0, vitest 90/90 y `next build` ✓.
- ⚠️ **Pendiente para el OS publicado**: commit + push + redeploy de Vercel. Detalle completo en
  `architecture/astraura-158-sistema-primario.md` §14 y `memory/state.md` (Adenda 155).

---

## Novedades y Última Migración Masiva (Proceso 4 & Sincronización Total)

El sistema ha superado una migración total de su infraestructura de sincronización y esquemas de base de datos para garantizar la coherencia en todos los contextos (Perfiles, Páginas, Astraura, Lienzos).

### 1. Esquema de Base de Datos Expandido
> ⚠️ **RECTIFICACIÓN (2026-07-12).** Esta sección decía que la migración se aplicó
> en `https://dzkjapinnewkxzjltadv.supabase.co` — **ese es el Supabase de
> Nexus/Café, NO el del OS**. La base del OS es **`nxstilnyidvkqeosofuh`**, y allí
> **13 tablas que el código usaba no existían** (`entity_state`, `os_spaces`,
> `os_space_editors`, `os_files`, `entity_mentions`, `os_contexts`,
> `os_dm_threads/_members/_messages`, `os_messages`, `neuron_devices`,
> `os_app_servers`, `os_app_server_members`, `vote_delegations`). Se crearon el
> 2026-07-12 con `supabase/migrations/20260712090000_missing_core_tables_library.sql`,
> `…_090100_missing_core_tables_spaces.sql` y `…_090200_missing_core_tables_messages.sql`
> (RLS verificada + publicación realtime).

Se aplicó la migración `20260708000004_os_full_schema.sql` en el Supabase del OS (`https://nxstilnyidvkqeosofuh.supabase.co`).
Se añadieron y activaron en `supabase_realtime`:
- **`os_contexts`**: Almacena configuraciones relativas de los usuarios para diferentes vistas (ej. temas o vistas por defecto al entrar a una página).
- **`os_libraries` & `os_brains`**: Estructuras para gestionar jerarquías de archivos y los cerebros de IA asignados a grupos/cuentas.
- **`os_messages`**: Unifica chats entre usuarios e hilos con Astraura/Aurora.
- **`os_events` & `os_maps`**: Entidades core nativas con geolocalización.
- **`os_dashboards` & `os_widgets`**: Para construir las vistas personalizadas del OS.

### 2. Motor Unificado de Sincronización (`src/lib/sync/sync-manager.ts`)
- **Problema Anterior**: Cada componente abría un canal de WebSocket para escuchar cambios, resultando en fugas de conexión que agotarían los recursos de la capa gratuita.
- **Solución Actual**: El `SyncManager` multiplexa los canales. Solo se abre **1 canal lógico por entidad**. Todos los componentes que consumen el hook `useEntitySync` comparten este canal.
- **Offline-First Ready**: Soporta funciones de mutación optimista.

### 3. Integración Agéntica (Astraura Realtime)
- **`src/ai/astraura/astraura-realtime.ts`**: Creado para que cuando la IA (Astraura) genere respuestas, deducciones o memorias autónomas, estas se inserten directamente en la base de datos y se sincronicen en el `SyncManager` de todos los dispositivos del usuario sin refrescar la página.
- **Contexto Híbrido**: Astraura ahora lee de `os_contexts` para adaptar sus respuestas al lugar exacto donde se invoca.

### 4. Cloud Run
El sistema está configurado en modo `standalone` con un Dockerfile *multi-stage* optimizado (<150MB), escalado a 0 instancias para mantener el coste en $0.

## Enlaces y Conexiones Activas
- **Supabase (base del OS)**: `https://nxstilnyidvkqeosofuh.supabase.co` — ⚠️ el de Nexus/Café es `dzkjapinnewkxzjltadv` y **NO comparte cuentas** con el OS (corregido 2026-07-12).
- **Frontend OS**: `https://starseed-os.vercel.app` (temporal, hasta rotar a GCP).
- **Nexus**: `https://starseed-nexus.vercel.app`

## Instrucciones para la próxima IA
Para continuar desarrollando cualquier entidad visual, utiliza SIEMPRE el hook `useEntitySync` (de `src/lib/sync/use-sync-manager.ts`) en lugar de suscribir canales de forma manual. Esto asegurará la cuota de WebSockets. Las tablas nuevas están disponibles y requieren `auth.uid()` válido por RLS.
