# Motor PixelArtistry Watertight Meshes (WT1011A)

Imagen → malla 3D **cerrada** (imprimible) o low-poly con texturas horneadas, usando los
flujos de [PixelArtistry-Watertight-Meshes](https://github.com/pixelartistry/PixelArtistry-Watertight-Meshes)
(flujos **MIT**, versión fijada por el instalador; añadimos la referencia exacta cuando el .bat
pinche una release concreta) sobre una **ComfyUI LOCAL** ya instalada.

Contrato: `architecture/astraura-avatares-3d.md` §11.1.

## Requisitos (solo Windows 10/11 + NVIDIA RTX 20 o más nueva)

- Windows 10 u 11, GPU NVIDIA RTX 20xx o superior con CUDA. En Mac/Linux `disponible()`
  devuelve `ok: False` con el motivo; el cierre allí lo hace el motor `blender-voxel` (WT1011B).
- ComfyUI instalada y escuchando en local (`COMFYUI_URL`, por defecto `http://127.0.0.1:8188`).
- Flujo 01 (imprimible) usa TRELLIS-Image3D a **1536**: exige ~10 GB de VRAM.
- Flujo **01b** es el mismo a **2048** y cambia TRELLIS a Pixal3D: **16 GB de VRAM o más**.

## Instalación — la lanza la persona, con permiso, NUNCA automática

Nada en este repo descarga software. Cuando la persona decida instalarlo en la neurona Windows:

```bat
curl -L -o watertightMeshes_win_installer.bat https://raw.githubusercontent.com/pixelartistry/PixelArtistry-Watertight-Meshes/refs/heads/main/watertightMeshes_win_installer.bat
watertightMeshes_win_installer.bat
```

El .bat (escribirlo `notepad %TEMP%\install_log.txt` guarda log) apunta a la carpeta de la
ComfyUI existente, crea un entorno si hace falta, instala los paquetes de nodos de MostAadTech
(WTiVo, Mesh Quad Reconstruct, LODTailor, CuMesh — **GPL-3.0 o MIT** según paquete) y descarga
los flujos JSON MIT al directorio de trabajo. Antes de lanzarlo, comprueba el espacio libre
**≥ 3 veces** (los modelos de TRELLIS/Pixal3D pesan varios GB); sin espacio verificado, no se ejecuta.

## Qué hace cada flujo (según su README real)

| Id del motor | JSON | Qué hace |
|---|---|---|
| `cerrada` | `PixelArtistry_01_Image_to_Watertight_Mesh.json` | Imagen → malla **watertight** lista para imprimir (1536, ~10 GB) |
| `cerrada-2k` | `PixelArtistry_01b_Image_to_Watertight_Mesh_2K.json` | Igual a 2048 con Pixal3D (≥ 16 GB) |
| `lowpoly` | `PixelArtistry_02_Image_to_GameReady_Asset.json` | Imagen → low-poly con texturas horneadas (juego/móvil) |
| `lowpoly-propia` | `PixelArtistry_03_Your_Mesh_to_GameReady_Asset.json` | Tu propia malla → low-poly horneado |

## Uso

El motor NUNCA decide la resolución: la da `resolucionPara(destino, vramGB)` del núcleo puro
(`src/lib/avatares/adn/optimizacion.ts`). Solo cambia la entrada (LoadImage o MeshEncoder)
y la `resolution` de los nodos WTiVo; todo lo demás del JSON queda intacto.

```python
from motores import pixelartistry as pa

pa.disponible()  # dict(ok, fallo); en Mac/Linux siempre ok=False con el motivo
r = pa.remallar_imagen("avatar.png", resolucion=1536, flujo="cerrada",
                       carpeta_workflows="C:/ComfyUI/workflows/pixelartistry")
# r = dict(ok, glb, procedencia, fallo, segundos, pico_memoria_gb)
```

La imagen/malla debe estar ya en la carpeta de entrada de la ComfyUI local; nada sale de la
neurona. `procedencia` declara las piezas y licencias usadas: «basta de ilusiones».

## Estado en este repo

`servicios/taller-3d/taller.py` **todavía no existe** en este worktree: el módulo queda listo
con la interfaz común (`disponible()` + función que devuelve `dict(ok, glb, procedencia,
fallo, segundos, pico_memoria_gb)`) para registrarlo cuando aparezca el taller.

## Pruebas

Sin red ni GPU: la API de ComfyUI se simula entera con `ComfyFalso`.

```bash
cd servicios/taller-3d/motores && python3 -m unittest test_pixelartistry -v
```

15 pruebas en verde (en Linux/Mac se validan también los caminos de «no disponible» con la
plataforma parcheada).
