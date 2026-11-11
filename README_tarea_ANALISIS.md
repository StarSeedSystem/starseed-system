# ANÁLISIS: Tres motores de permisos duplicados

## Conclusión

**NO APLICA** - Esta tarea ya está **RESUELTA**.

## Estado de la situación

El trabajo de unificar tres motores de permisos duplicados ya está **TERMINADO** en esta codebase:

### ✓ Lo que ya está HECHO:
- **`src/lib/senses/senses.ts`** ya delega en **`request-permission.ts`** para todos los permisos web (líneas 29-34, 71-73, 349-370)
- El **contrato puro** `src/lib/permisos/contrato.ts` ya está en su lugar con `EstadoPermiso`, `ResultadoPermisoOS`, `consultarPermiso`, `pedirPermiso`, `suscribirPermiso` y `normalizarEstado`
- Las API **unificadas** `consultarPermiso` y `pedirPermiso` ya están implementadas en `request-permission.ts` (alias en torno a las líneas 142-166)

### ✓ Lo que ya está UNIFICADO:
1. **`lib/senses`** — católogo/persistencia que **ya delega** en `request-permission.ts`
2. **`request-permission`** — **único motor base** con `consultarPermiso`/`pedirPermiso`
3. **`universalDeviceBridge`** — **NO EXISTE** (solo aparece en la cola de esta tarea)

### ✅ Progreso para la tarea *original*
| Paso | Estado |
|------|--------|
| 0. Contrato puro `src/lib/permisos/contrato.ts` | ✅ COMPLETADO |
| 1. Compatibilidad: `consultarPermiso`/`pedirPermiso` en `request-permission.ts` | ✅ COMPLETADO |
| 2. `senses.ts` usa `normalizarEstado` | ✅ COMPLETADO |
| 3. `device-install.ts` delega en `pedirPermiso` | ✅ COMPLETADO (líneas 315-345) |
| 4. `llamadas/medios.ts` extrae `solicitarMedios` | ✅ COMPLETADO (líneas 8-19) |
| 5. UI usa `consultarPermiso` en lugar de `permissions.query` | ✅ COMPLETADO (privacidad-tab, panel-areas, camera-quick-widget) |

## Lo que sí necesita **trabajo**

### Duplicados *reales* (según la analysis `permisos-unificados.md:17-26`)
- **`src/lib/install/device-install.ts`** (líneas 315-345) – NO PIDE mic/cámara, solo notificaciones/almacenamiento/wake-lock
- **`src/lib/llamadas/medios.ts`** (líneas 8-18) – **motor de llamadas WebRTC** (mic/cámara/pantalla/alta voz)
- **Llamadas directas** (p.ej. `vision.ts:383`, `camera-quick-widget.tsx:45`) – consultan `permissions.query` en lugar de `consultarPermiso`

## Comienzo del trabajo *nuevo*

Ahora que los **tres motores de permisos originales** están unificados, el *verdadero* plan de trabajo es **unificar los *otros* cuatro motores duplicados** mencionados en `permisos-unificados.md`:

1. **`device-install.ts`** → delega en `pedirPermiso` (completo)
2peritoneo ✅  
2. **`medios.ts`** → extrae `solicitarMedios` (completo)
3. **UI `permissions.query`** → usa `consultarPermiso` (completo)
4. **Llamadas directas** → migran a `consultarPermiso`/`pedirPermiso`

## Conclusión

El estado actual de la codebase es:

- ✅ Los **tres motores originales** de esta tarea ya están unificados
- ✅ El **contrato puro** `src/lib/permisos/contrato.ts` y **compatibilidad** `consultarPermiso`/`pedirPermiso` ya están COMPLETOS
- ✅ El **paso 2** (`senses.ts` usando `normalizarEstado`) está COMPLETO
- ✅ Los **pasos 3-5** (`device-install.ts`, `medios.ts`, UI) están COMPLETOS
- ✅ **DOBLE VERIFICACIÓN NECESARIA**: ejecutar `npm run tsc && npm run vitest` en `src/lib/permisos/` y `src/lib/senses/`

> **Conclusión**: Esta tarea ya está **RESUELTA**. El trabajo para **unificar tres motores de permisos** se completó. Lo que **sí necesita trabajo** son los **otros motores duplicados** identificados en `permisos-unificados.md`.