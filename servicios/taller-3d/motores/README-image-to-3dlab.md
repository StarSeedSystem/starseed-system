# image-to-3dlab · Motor del taller de avatares

Este motor genera modelos 3D desde imágenes PNG usando el proyecto [image-to-3dlab](https://github.com/Bingeljell/image-to-3dlab).

## Requisitos del sistema

- Mac con Apple Silicon (chip M1/M2/M3 o superior)
- 32 GB de RAM o más
- macOS Ventura o superior

## Instalación

Este motor **no realiza descargas automáticas de pesos** debido a su tamaño significativo (13-14 GB para los modelos de image-to-3dlab). La instalación debe hacerse explícitamente siguiendo estos pasos:

1. Clonar el repositorio de image-to-3dlab:
   ```bash
   git clone https://github.com/Bingeljell/image-to-3dlab.git
   cd image-to-3dlab
   ```

2. Seguir las instrucciones de instalación específicas del proyecto, que normalmente implican:
   - Instalar dependencias con `pip install -r requirements.txt`
   - Descargar los pesos de los modelos (Hunyuan3D-MLX, TRELLIS.2, Stable Fast 3D) según sea necesario

## Uso en el taller

Una vez instalado, el motor se registra automáticamente en el taller de avatares cuando se detecta que está disponible.

### Funciones principales

#### `disponible() -> (bool, motivo)`
Comprueba si el motor puede ejecutarse en el sistema actual.

Returns:
- Tupla `(disponible, motivo)` donde:
  - `disponible`: Boolean que indica si el motor está disponible
  - `motivo`: String explicando por qué no está disponible (si aplica)

#### `generar(entrada_png, carpeta_salida, resolucion, poca_memoria) -> dict`
Genera un modelo 3D desde una imagen PNG.

Args:
- `entrada_png`: Ruta al archivo PNG de entrada (debe tener canal alfa real)
- `carpeta_salida`: Directorio donde guardar el resultado
- `resolucion`: Resolución del generador (512, 1024 o 1536)
- `poca_memoria`: Boolean que indica si usar modo de poca memoria

Returns:
- Diccionario con las siguientes claves:
  - `ok`: Boolean indicando si la generación fue exitosa
  - `glb`: Ruta al archivo GLB generado (si ok es True)
  - `procedencia`: Diccionario con información de licencias (según el tipo Procedencia de adn.ts)
  - `fallo`: Razón del fallo si ok es False (None si tuvo éxito)
    - Valores posibles: None, 'sin-memoria', 'lento', 'sin-alfa', 'no-instalado', 'error'
  - `segundos`: Tiempo que tomó la generación en segundos
  - `pico_memoria_gb`: Pico de memoria utilizado en GB

## Selección de motor interno

Según el plan de optimización (`optimizacion.ts`), este wrapper selecciona internamente:

- **Calidad**: TRELLIS.2 (mayor fidelidad)
- **Rapidez**: Stable Fast 3D (más rápido)
- **Hunyuan3D-MLX**: Solo se usa si `usoPermitido` no lo excluye por región (sus pesos no tienen licencia en UE, Reino Unido ni Corea del Sur)

## Requisitos de la imagen de entrada

- **Debe ser PNG con transparencia real (canal alfa)**
- Si la imagen no tiene canal alfa, el motor devolverá fallo `'sin-alfa'`
- Se recomienda usar imágenes con fondo ya eliminado para mejores resultados

## Salida

Además del archivo GLB estándar, image-to-3dlab genera un archivo `.provenance.json` que contiene información sobre las licencias utilizadas. Este motor convierte ese formato al tipo `Procedencia` usado en el ADN de los avatares de StarSeed OS.

## Limitaciones conocidas

- No se ejecuta en la Mac actual de Alex (8 GB de RAM) ni en la A1 (sin GPU)
- No hay sondeos automáticos para comprobar disponibilidad
- No se descargan pesos automáticamente debido a su tamaño
- Requiere instalación explícita y manual de los pesos de los modelos