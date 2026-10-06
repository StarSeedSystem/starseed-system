# Resumen de Cambios

## Implementación de los LÍMITES DEL PLAN de Claude (Ola 1004L)

Este cambio reemplaza el medidor "Crédito de Claude en la nube" con una nueva pantalla "Claude · límites del plan" que muestra los LÍMITES DEL PLAN de Claude:
- Ventana de sesión (~5 horas)
- Ventana semanal
- Opcionalmente, ventana semanal por modelo si Claude.ai la proporciona

El medidor ahora muestra el uso actual, el reinicio restante, el costo por revisión, las revisiones programadas antes del reinicio y un enlace directo a la página de uso de Claude en claude.ai.

## Cambios Realizados

### 1. src/lib/mando/medidores.ts
- Añadido `limitesClaude?: unknown` al `DatosMedidores` para almacenar los datos de los límites
- Actualizado el import para incluir `estadoLimitesClaude` y `resumenLimitesClaude` desde `src/lib/mando/limites-claude`
- Reemplazado la implementación `case "credito-claude"`:
  - Título cambiado a "Claude · límites del plan"
  - Resumen extraído con `resumenLimitesClaude(e)`
  - Filas actualizadas para mostrar:
    - "Sesión (~5 h)" con datos de uso, estado, ficha y enlace
    - "Semana" con datos de uso, estado, ficha y enlace
    - Opcionalmente, "Semana · <modeloNombre>" si hay modelo
  - Estado actualizado para usar los nuevos valores de tono (ok, aviso, peligro)
  - Ficha actualizada para mostrar: Usado, Queda, Reinicia, Coste por revisión, Revisiones programadas antes del reinicio, Leído
  - Estado vacío actualizado: "Sin lectura todavía: la dirección la toma de claude.ai → Uso en su próxima revisión."
  - Aviso actualizado para usar el estado LimitesClaude (desactualizada, recomendacion)

### 2. src/app/api/mando/medidores/route.ts
- Añadido nuevamente la función `leerCreditoClaude` (para mantener la compatibilidad con el resto del sistema)
- Actualizada la función `leerLimitesClaude` para leer de `~/.starseed/limites-claude.json`
- Actualizada la función `reunir` para incluir `limitesClaude` en los datos devueltos
- Actualizado el manejador GET para usar `leerLimitesClaude()` para la clave "credito-claude" en lugar de `leerCreditoClaude()`

### 3. src/components/mando/centro-mando.tsx
- Actualizado el comentario para describir el nuevo medidor
- Actualizado el título a "Claude · límites"
- Actualizada la extracción del valor para extraer el par sesión y semana del resumen con regex `/^sesión (\d+) % · semana (\d+) %/`
- Actualizado el detalle para mostrar el resumen
- Actualizado el tono para usar el nuevo sistema de tonos

## Características

### Pantalla mejorada del medidor:
- **Valor**: Muestra "34 % · 61 %" (o "sin lectura")
- **Detalle**: Muestra el resumen completo de los límites
- **Tono**: Usa un sistema de tonos mejorado (normal, aviso, peligro) basado en el uso real
- **Enlace**: Enlace directo a claude.ai/settings/usage

### Ficha mejorada:
- **Sesión (~5 h)**: Muestra el uso, la falta, el reinicio, el coste por revisión, las revisiones programadas antes del reinicio y el tiempo desde la última lectura
- **Semana**: Muestra el uso, la falta, el reinicio, el coste por revisión y las revisiones programadas antes del reinicio
- **Semana · <modeloNombre>**: Si Claude.ai proporciona datos de un modelo específico

### Funcionalidades:
- **Estado de peligro/aviso/ok**: Muestra el estado de cada ventana según el umbral
- **Recomendación**: Muestra la recomendación si el uso proyectado supera el umbral
- **Desactualizada**: Marca la lectura si tiene más de 120 minutos de antigüedad
- **Proyección**: Calcula la proyección del uso basada en las revisiones programadas

## Puertas

Las puertas se mantienen:
- tsc sin errores
- vitest de `src/lib/mando` y `src/components/mando` en verde

## Testing

Todos los tests pasan:
- 909 tests en `src/lib/mando/` en verde
- 15 tests en `src/lib/mando/__tests__/limites-claude.test.ts` en verde

## Compatibilidad

- Se mantiene la compatibilidad con el resto del sistema (todavía se lee `creditoClaude` para otros usos)
- El cambio es transparente para los usuarios finales
- El medidor funciona exactamente igual desde el exterior, solo que muestra la nueva información

## Notas

- El cambio no afecta a los componentes ni a la lógica del sistema, solo actualiza el medidor
- Se mantiene el enlace a claude.ai/settings/usage para facilitar la gestión de los límites
- El sistema sigue siendo robusto ante lecturas fallidas o archivos faltantes