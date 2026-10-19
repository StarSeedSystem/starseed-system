# Módulo de Vídeo HTML con HyperFrames para StarSeed OS

## Descripción General

Este módulo implementa el átomo "video-html" de la Protomolécula para la edición y producción de vídeo con HyperFrames en StarSeed OS. Proporciona:

1. **`plantillaStarSeed()`**: Una plantilla HTML compatible con HyperFrames que genera composiciones de vídeo animadas solo con CSS @keyframes
2. **`detectarAdaptadores()`**: Un detector que identifica los adaptadores de animación utilizados en el HTML generado
3. **Test suite**: Pruebas unitarias para verificar las funcionalidades principales

## Características

### Template StarSeed
- **Compatibilidad con HyperFrames**: Incluye todos los atributos necesarios (`data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`, `data-no-timeline`)
- **Animaciones CSS solo**: Utiliza @keyframes para animaciones, evitando el uso de GSAP (prohibido por licencia)
- **Escapado de contenido**: Escapa automáticamente el contenido HTML para prevenir inyección de código
- **Tiempo estable**: Cada elemento visible tiene un ID estable y atributos de tiempo
- **Sin telemetría**: Listo para su uso con `HYPERFRAMES_NO_TELEMETRY=1`

### Detección de Adaptadores
- **Detección completa**: Detecta CSS, WAAPI, Anime.js, Lottie, Three.js, TypeGPU y GSAP
- **Verificación de licencia**: Marca GSAP como no editable visualmente con motivo de licencia apropiado
- **Compatibilidad con editor**: Indica qué adaptadores son compatibles con edición visual

## Instalación y Uso

### Importación
```typescript
import { plantillaStarSeed } from '@/src/lib/video-html/plantilla';
import { detectarAdaptadores } from '@/src/lib/video-html/adaptadores';
```

### Uso de la Plantilla
```typescript
const opciones = {
  ancho: 1280,
  alto: 720,
  duracion: 5,
  titulo: 'Mi Composición',
  fondo: '#10B981',  // Color del texto
  acento: '#007FFF'  // Color de acento
};

const html = plantillaStarSeed(opciones);
```

### Detección de Adaptadores
```typescript
const resultado = detectarAdaptadores(html);
console.log('Adaptadores usados:', resultado.usados);
console.log('Editable visualmente:', resultado.editableVisualmente);
console.log('Motivo:', resultado.motivo);
```

## API

### plantillaStarSeed(opciones)
Genera HTML para una composición HyperFrames usando la plantilla StarSeed.

**Parámetros:**
- `opciones: PlantillaOpciones` - Configuración para el template

**Devuelve:**
- `string` - HTML para composición HyperFrames

**PlantillaOpciones:**
```typescript
interface PlantillaOpciones {
  ancho: number;      // Ancho de la composición
  alto: number;       // Alto de la composición
  duracion: number;   // Duración en segundos
  titulo: string;     // Título de la composición
  fondo: string;      // Color del texto (CSS)
  acento: string;     // Color de acento (CSS)
}
```

### detectarAdaptadores(html)
Detecta qué adaptadores de animación se están utilizando en el HTML dado.

**Parámetros:**
- `html: string` - HTML a analizar

**Devuelve:**
- `AdapterDetectionResult` - Información sobre adaptadores detectados

**AdapterDetectionResult:**
```typescript
interface AdapterDetectionResult {
  usados: Array<'css' | 'waapi' | 'animejs' | 'lottie' | 'three' | 'typegpu' | 'gsap'>;
  editableVisualmente: boolean;
  motivo: string;
}
```

## Adaptadores Soportados

### CSS
- **Detección**: Busca `animation:` en estilos
- **Editable visualmente**: ✅ Sí

### WAAPI (Web Animations API)
- **Detección**: Combina `transform` y `animation`
- **Editable visualmente**: ✅ Sí

### Anime.js
- **Detección**: Busca `animejs` o `anime(`
- **Editable visualmente**: ✅ Sí

### Lottie
- **Detección**: Busca `lottie`
- **Editable visualmente**: ✅ Sí

### Three.js
- **Detección**: Busca `three.js`, `THREE.` o `Three`
- **Editable visualmente**: ✅ Sí

### TypeGPU
- **Detección**: Busca `typegpu` o `WebGPU`
- **Editable visualmente**: ✅ Sí

### GSAP
- **Detección**: Busca `gsap` o `GSAP`
- **Editable visualmente**: ❌ No (prohibido por licencia)
- **Motivo**: "Licencia GSAP Standard: prohíbe usar GSAP en herramientas que permiten crear animaciones visuales sin código (editor visual). Sugerencia: convertir a WAAPI para edición visual."

## Líneas de Composición

### Raíz
```html
<div data-composition-id="main"
      data-start="0"
      data-duration="5"
      data-width="1280"
      data-height="720"
      data-no-timeline="true">
```

### Elementos Visibles
```html
<h1 id="titulo-principal" class="clip"
    data-start="0"
    data-duration="5"
    data-easing="cubic-bezier(0.4, 0, 0.2, 1)"
    data-opacity="0->1"
    data-transform="translateX(-100%)->translateX(0)"
    data-transform-origin="center"
    data-animation="animarZoom"
    data-playback-rate="1">
  Mi Composición
</h1>
```

## Restricciones de Licencia

- **GSAP**: Prohibido usar GSAP en herramientas que permiten crear animaciones visuales sin código (editor visual) según su licencia Standard
- **Telemetría**: Siempre usar con `HYPERFRAMES_NO_TELEMETRY=1`
- **HTML sin claves**: Nunca incluir valores de claves en el HTML generado

## Casos de Uso

1. **Creación rápida de composiciones**: Genera plantillas consistentes para nuevos proyectos
2. **Validación de adaptadores**: Verifica qué tecnologías de animación se están utilizando
3. **Conversión de GSAP a WAAPI**: Obtiene sugerencias para actualizar desde GSAP a alternativas compatibles

## Pruebas

Las pruebas verifican:
- La plantilla no contiene "gsap"
- Detección correcta de cada adaptador
- Configuración apropiada de edición visual para GSAP

```bash
npx vitest run src/lib/video-html/__tests__/adaptadores.test.ts
```

## Mantenimiento

- **Actualizaciones GSAP**: Si GSAP lanza una nueva versión compatible, actualice la detección y motivo
- **Nuevos adaptadores**: Agregue soporte para nuevos adaptadores de animación si es necesario
- **Validación de seguridad**: Asegúrese de que la escapada de HTML previene inyección de código

## Compatibilidad

- **HyperFrames**: Compatible con HyperFrames 0.8.x
- **Navegadores**: Funciona en navegadores modernos con soporte para CSS Animations
- **Node**: Compatible con Node 14+

## Advertencias

- Este módulo genera HTML que debe ser renderizado por un reproductor HyperFrames
- Las animaciones están limitadas a @keyframes y no admiten efectos complejos
- GSAP no es compatible con edición visual en el editor HyperFrames
- Asegúrese de utilizar valores seguros de CSS para colores y parámetros de animación

## Licencia

Apache-2.0
