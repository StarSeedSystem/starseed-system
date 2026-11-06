# Contrato de error · guardado de persona

## Estado actual auditado
- Punto de entrada: UI → `savePersonalityProfile` / `savePersonality` (Supabase)
  `src/lib/aurora/personalities.ts:1608`, `src/components/aurora/persona-coherence-panel.tsx:63`
- Persistencia: `localStorage` vía `safeSet` (`src/lib/safe-storage.ts:80`) + Supabase `aurora_personalities`
- Notificaciones: `PERSONALITY_CHANGED_EVENT`, `starseed:aurora-voice-style`, `STORAGE_DEGRADED_EVENT`

## Flujo actual
1. UI llama a `savePersonalityProfile`
2. `normalizePersonalityProfile` + `listPersonalityProfiles`
3. `writeProfileList` → `safeSet(PERSONALITY_LIST_KEY, JSON)`
4. Emisión de eventos si cambió

## Problemas
- Errores silenciados con `catch {}` y retorno `null`
- `safeSet` degrada a memoria sin feedback al usuario
- Sin distinción recuperable/no recuperable
- Sin métrica de fallo

## Contrato propuesto

### Tipos de error
- `Recuperable`: cuota local, offline temporal, conflicto de versión
- `NoRecuperable`: validación, permisos, esquema roto

### Resultado observable
`SaveResult<T>` con `ok`, `data`, `errorCode`, `mensajeUsuario`, `reintentable`

### Logging y métrica
- Log mínimo: `persona_save_failure` con código, origen, ts
- Métrica: contador diario de fallos por código

### Reglas UI
- Mostrar mensaje en español con acentos
- Botón reintentar si `reintentable`
- Cursor pointer en acciones
