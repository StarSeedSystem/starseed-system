# StarSeed OS - Current Status (Updated 2026-07-08)

## Novedades y Última Migración Masiva (Proceso 4 & Sincronización Total)

El sistema ha superado una migración total de su infraestructura de sincronización y esquemas de base de datos para garantizar la coherencia en todos los contextos (Perfiles, Páginas, Astraura, Lienzos).

### 1. Esquema de Base de Datos Expandido
Se aplicó la migración `20260708000004_os_full_schema.sql` en Supabase (`https://dzkjapinnewkxzjltadv.supabase.co`).
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
- **Supabase**: `https://dzkjapinnewkxzjltadv.supabase.co`
- **Frontend OS**: `https://starseed-os.vercel.app` (temporal, hasta rotar a GCP).
- **Nexus**: `https://starseed-nexus.vercel.app`

## Instrucciones para la próxima IA
Para continuar desarrollando cualquier entidad visual, utiliza SIEMPRE el hook `useEntitySync` (de `src/lib/sync/use-sync-manager.ts`) en lugar de suscribir canales de forma manual. Esto asegurará la cuota de WebSockets. Las tablas nuevas están disponibles y requieren `auth.uid()` válido por RLS.
