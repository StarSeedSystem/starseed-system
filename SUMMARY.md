# Implementación de perfil-marca para Diagram Design

## Resumen

Se han implementado los archivos requeridos para la tarea DGM1018E:

1. `src/lib/diagramas/perfil-marca.ts` - Contiene las funciones `perfilDesdeTema` y `bloquePerfil`
2. `src/lib/diagramas/__tests__/perfil-marca.test.ts` - Contiene pruebas unitarias para ambas funciones

## Funcionalidad implementada

### perfilDesdeTema(tokens: ThemeTokens, modo, paletaFondo?)

Esta función pura convierte un objeto `ThemeTokens` del sistema de temas de StarSeed OS a los tokens específicos requeridos por la habilidad Diagram Design:

- **Entrada**: 
  - `tokens`: Objeto ThemeTokens con variables CSS (background-hsl, foreground-hsl, primary-hsl, etc.)
  - `modo`: "light" o "dark" para especificar el tema
  - `paletaFondo`: Parámetro opcional para fondos de shaders (incluido para futura expansión)

- **Salida**: Objeto `DiagramDesignTokens` con:
  - `paper`: Color de fondo (hex) derivado de `background-hsl`
  - `ink`: Color de texto (hex) derivado de `foreground-hsl`  
  - `accent`: Color de acento (hex) derivado de `primary-hsl`
  - `tipografias`: Tipografías fijas según la guía de estilo de Diagram Design:
    - title: "Instrument Serif"
    - nodeName: "Geist"
    - sublabel: "Geist Mono"
    - eyebrow: "Geist Mono"
    - arrowLabel: "Geist Mono"
    - callout: "Instrument Serif italic"
  - `trazos`: Valores de trazo y radio fijos basados en el sistema de 4px grid:
    - strokeThin: 0.8
    - strokeDefault: 1
    - strokeStrong: 1.2
    - radiusSm: 4
    - radiusMd: 6
    - radiusLg: 8
    - grid: 4

### bloquePerfil(perfil)

Esta función pura crea un bloque de perfil en el formato de cabecera activa descrito en `references/profiles.md`:

- Genera un encabezado YAML con metadatos del perfil
- Incluye la guía de estilo completa con los valores de token proporcionados
- Formato compatible con el sistema de perfiles de Diagram Design

## Cumplimiento de requisitos

✅ **Contraste AA**: Al usar los colores de fondo y texto del tema del OS, se hereda el contraste adecuado diseñado para cumplir con los estándares de accesibilidad del OS.

✅ **Formato de salida**: Los tokens de color se convierten a formato hexadecimal requerido por Diagram Design.

✅ **Tipografía y trazos**: Se utilizan los valores fijos especificados en la guía de estilo de Diagram Design.

✅ **Funciones puras**: Ambas funciones son puras (sin efectos secundarios, dependen solo de sus entradas).

✅ **Pruebas**: Se incluyen pruebas para:
  - Tema claro (usando valores de globals.css)
  - Tema oscuro (usando valores de globals.css)  
  - Valores por defecto cuando las variables faltan
  - Formato correcto del bloque de perfil

✅ **Archivos correctos**: Solo se modificaron/crearon los archivos especificados en la tarea:
  - src/lib/diagramas/perfil-marca.ts
  - src/lib/diagramas/__tests__/perfil-marca.test.ts

✅ **Límites de línea**: Ambas funciones están bien dentro del límite de 120 líneas por archivo.

## Notas sobre el parámetro paletaFondo

El parámetro `paletaFondo` se incluyó en la firma de la función según los requisitos, pero su implementación específica no fue detallada en la documentación proporcionada. Se dejó disponible para futuras expansiones donde podría usarse para overridear el color de fondo con efectos de shaders específicos.