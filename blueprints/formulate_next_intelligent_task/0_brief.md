# blueprints/formulate_next_intelligent_task/0_brief.md
# Formulación de Tarea Inteligente - Director

## Propósito

Simula el `formulate_next_intelligent_task` del Director para generar tareas inteligentes para el enjambre.

## Descripción

Hoy el Director usa `random.choice` de `blueprints/formulate_next_intelligent_task/` para seleccionar un patrón de formulación de tareas.

## Precedente

El Director delega la formulación de tareas a `formulate_next_intelligent_task` para aprovechar el poder de estrellas externas y modelos.

## Archivo en el repo

`blueprints/formulate_next_intelligent_task/` (módulo puro, ≤ 120 líneas)

## Acciones

La formulación de tareas incluye: selección de blueprints aleatoria, llamada a motores de formulación y generación del prompt final.

## Tendencias

El uso de estilos mixtos de prompts impulsa la eficiencia y calidad del enjambre.

## Próximos pasos

1. Implementar `formulate_next_intelligent_task` que use `random.choice` de blueprints
2. Integrar con motores de formulación externos
3. Probar el sistema TDD completo

# blueprints/formulate_next_intelligent_task/1_task_gen_plugin.md
# Plugin de Generación de Tareas

## Tipo

Plugin de generación de tareas

## Descripción

Implementa la fase 1 (L0) de `_prepare_task_generation` y la fase 2 (L1) de `_integrate_generation`.

## Razón

El mejor plugin para formulación inteligente de tareas

## Arquitectura

Diseñado para sostener una generación de tareas impulsada por la IA

## Configuración

Usa modelos gratis disponibles; sin costo de API

## Precedente

Anteriormente solo capacidades mínimas, ahora generación completa

# blueprints/formulate_next_intelligent_task/2_agentes_ts_3_archivos.md
# Agentes con 3 Archivos

## Restricciones

Tareas con máximo 3 archivos (≤ ammaa líneas por archivo)

## Descripción

Implementa la generación de tareas para el enjambre usando 3 archivos por tarea

## Escenario

Contexto del Director: máximo 3 archivos, 120 líneas por archivo

## Arquitectura

Implementación de ventanas emergentes efectivas

## Tecnologías

Usa TypeScript puro y herramientas del OS

# blueprints/formulate_next_intelligent editalmente.md
# Formulación Editalmente

## Restricciones

Implementa funcionalidades normalizadas para usuarios en entornos comerciales

## Descripción

Implementa la formulación de tareas con estilo editorial

## Escenario

Usa el patrón contextual del Director

## Arquitectura

Formulación de tareas a través de modelos de diseño

## Tecnologías

Implementación de vista contextual

# blueprints/formulate_next_intelligent_task/3_usuarios.md
# Plantilla de Formulación de Tareas

## Restricciones

Tarea modesta con ventanas emergentes y secciones de características

## Descripción

Genera formulario de usuario para nuestro sistema de tareas

## Escenario

Implementa el ciclo de formulación del Director

## Arquitectura

Implementación de características contextuales

## Tecnologías

Potencia generativa emergente usando vistas contextuales

# blueprints/formulate_next_intelligent_task/4_impulsor.md
# Impulsor de Formulación

## Restricciones

Implementa el impulsor para la formulación de tareas

## Descripción

Implementa el impulsor para la formulación de tareas

## Escenario

Implementa el ciclo de formulación

## Arquitectura

Implementación de funcionalidades de formulación

## Tecnologías

Potencia generativa emergente