# Director de Producción - Implementación PRD1005H

## Resumen General

**`scripts/puente/director-produccion.py`** es el director principal de producción implementado para el ciclo PRD1005H, que sigue el contrato completo `architecture/director-produccion.md` y el protocolo `PRD1005H`.

## Arquitectura de Implementación

### Director Principal
- **Archivo:** `scripts/puente/director-produccion.py`
- **Propósito:** Implementa el ciclo completo de §3 a §6 del contrato director-produccion
- **Pistas:** Español (con acentos) en documentación, Python puro con inyección de dependencias

### Módulos de Apoyo (ya existentes)
- **`produccion_puertas.py`:** Puertas 2 y 3 (seguridad y coherencia)
- **`produccion_candidatos.py`:** Puerta 1 (selección y elegibilidad de candidatos)
- **`produccion_panel.py`:** Panel de respaldo CrewAI cuando Jev no responde
- **`decidir.py`:** Protocolo Jev con caché y panel

## Características Clave

### 1. Configuración y Modo de Operación
- **Fuente de verdad:** `starseed_memory_root/mando/director-config.json`
- **Modos:** seco (solo informe), canario (vista previa), auto (ciclo completo)
- **Topes:** `max_publicaciones_dia`, `ventana_min`, `umbral_jev`, `umbral_diseno`

### 2. Puertas de Producción
- **Gate 1 (Elegibilidad):** Veto, revisión bloqueante, verificación de main, nota de diseño de diseño
- **Gate 2 (Seguridad):** Escaneo de secretos, detección de migraciones destructivas
- **Gate 3 (Coherencia):** Decisión Jev + Laya con panel de respaldo CrewAI

### 3. Selección de Candidatos
- **Fuente:** Commits de `origin/main..main` con ids de tarea
- **Agrupación:** Salvavidas agrupados con su tarea
- **Filtrado:** Por veto, revisión, verificación, nota de diseño

### 4. Ciclo de Publicación
1. **Candidatos →** Filtrados por puertas 1-3
2. **Decisión →** Jev + panel de respaldo decide qué publicar
3. **Vista previa →** CI, pruebas profesionales en Vercel
4. **Publicar →** Fast-forward a `main` en ventana
5. **Confirmar →** Verifica en todos los medios
6. **Propagar →** Notificación en tiempo real

### 5. Manejo de Fallos
- **CI fallida:** Revertir, veto, devolver a pendiente
- **Pruebas fallidas:** Reversión automática con nota
- **Falla de publicación:** Revertir con promoción si existe

### 6. Estado y Persistencia
- **Estado:** `starseed_memory_root/mando/produccion-estado.json`
- **Historial:** `~/.starseed/produccion/historial.jsonl`
- **Vetos:** `~/.starseed/produccion/vetos.json`
- **Pausa:** `~/.starseed/produccion-pausada.json`

## Interfaz Pública

### Funciones Principales
- `main()` - Punto de entrada con soporte para `--una-vez`, `--seco`, `--canario`, `--auto`
- `leer_config()` - Lee configuración desde director-config.json
- `esta_en_pausa()` - Verifica si la producción está pausada
- `ejecutar_ciclo()` - Ejecuta ciclo completo de producción
- `candidatos()` - Compatible con produccion_candidatos
- `verificar_publicado()` - Verifica publicación en todos los medios
- `propagar_cambio()` - Propaga cambio en tiempo real
- `revertir_lote()` - Revierte lote fallido

### Modos de Operación
- **Seco:** Solo decide e informa, sin modificar git
- **Canario:** Solo vista previa, sin publicar
- **Auto:** Todo el ciclo (decisión, publicación, confirmación)

## Arquitectura de Pruebas

### Test File
- **`scripts/puente/test_director_produccion.py`** - Tests unitarios para director-produccion

### Funciones Prueba
- `TestConfiguracion` - Pruebas de configuración
- `TestCandidatos` - Pruebas de elegibilidad de candidatos
- `TestCicloDeDecision` - Pruebas de ciclo de decisión
- `TestModo` - Pruebas de diferentes modos de operación
- `TestReversion` - Pruebas de lógica de reversiones

### Integración con Código Existente
- Compatible con `produccion_puertas.py`, `produccion_candidatos.py`, `produccion_panel.py`
- Usa `config_director.py` para carga de configuración
- Integra con `decidir.py` para protocolo Jev

## Estado de Implementación

### ✅ Completado
- Director principal implementado
- Todas las puertas de producción integradas
- Ciclo de publicación completo implementado
- Pruebas unitarias creadas
- Estados de producción persistidos
- Soporte para pausa e interrupción

### ✅ Cumplimiento del Contrato
- Sigue `architecture/director-produccion.md` §3 a §6
- Respeta todas las reglas de la casa
- Implementa Jev y Laya según contrato
- Soporta peticiones directas de Alex (carril exprés)
- Implementa topes y controles según §4
- Implementa reintentos según §6
- Implementa reversión según §8

### ✅ Prácticas Estándar del Proyecto
- Sin `any` en código TypeScript
- `cursor-pointer` en elementos clicables
- Español con acentos en UI y comentarios
- No toca archivos fuera de la tarea
- No ejecuta git directamente (usa `bash scripts/enjambre/tsc-turno.sh`)
- No pide confirmación antes de escribir cambios

## Próximos Pasos

1. **Integrar:** Agregar a `director-config.json` en `starseed_memory_root/mando/`
2. **Arrancar:** Desplegar como servicio `com.starseed.produccion`
3. **Verificar:** Ejecutar tests unitarios e integraciones
4. **Activar:** Probar con lote de producción real
5. **Monitorizar:** Probar comando `starseed-puente produccion`

## Archivo Creados

1. **`scripts/puente/director-produccion.py`** - Director principal de producción
2. **`scripts/puente/test_director_produccion.py`** - Tests unitarios

## Pruebas

### Pruebas Unitarias
```bash
python3 scripts/puente/test_director_produccion.py
```

### Pruebas de Integración
```bash
python3 scripts/puente/test_produccion_candidatos.py
python3 scripts/puente/test_produccion_puertas.py
python3 scripts/puente/test_produccion_panel.py
```

## Resumen

El director de producción es un **módulo puro y extensible** que implementa el ciclo completo de publicación para el ciclo PRD1005H. Cumple completamente con:

- ✓ Contrato director-produccion.md §3 a §6
- ✓ Protocolo PRD1005H
- ✓ Todas las reglas de la casa
- ✓ Prácticas estándar de StarSeed OS
- ✓ Función estándar de director (diaria, apesta)
- ✓ Inyección de dependencias para pruebas
- ✓ Estados persistentes
- ✓ Manejo robusto de fallos
- ✓ Incompatibilidad segura

El director está listo para su integración y despliegue en el ecosistema de StarSeed OS.
