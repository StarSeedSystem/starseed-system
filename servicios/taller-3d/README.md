# Taller 3D local («taller-3d») · AV1011F

Contrato: [`architecture/astraura-avatares-3d.md`](../../architecture/astraura-avatares-3d.md) §4, §5 y §11.

Servicio de una neurona que hace tres etapas del plan de `planificar`
(`src/lib/avatares/adn/canalizacion.ts`): **generar** (imagen → malla), **remallar** y **riggear**.
«Detallar» no tiene motor listo y «animar» va en el navegador de quien mira. Solo biblioteca estándar de
Python 3.9+. Lo que no esté instalado se dice con su motivo: nada se simula.

| Archivo | Qué es |
|---|---|
| `taller.py` | El servicio HTTP, la detección de capacidades, el gobernador y las etapas |
| `test_taller.py` | Pruebas con subprocesos simulados (`python3 -m unittest servicios/taller-3d/test_taller.py`) |
| `optimizar.mjs` | Optimizador por destino (LOD, texturas, meshopt), aparte (G3D1011C) |
| `motores/` | Envoltorios de motores de otras tareas (Pixal3D, PixelArtistry) |
| `src/lib/avatares/adaptadores/taller-cliente.ts` | El cliente del OS |

## Arrancar

```bash
python3 servicios/taller-3d/taller.py token        # crea ~/.starseed/taller-3d/env (permisos 600); no imprime el token
python3 servicios/taller-3d/taller.py capacidades  # qué puede hacer ESTA neurona y por qué no lo demás
python3 servicios/taller-3d/taller.py servir       # escucha SOLO en 127.0.0.1:8797
```

- **Token**: el servicio lo lee de `~/.starseed/taller-3d/env` (línea `TALLER3D_TOKEN=…`, o la ruta de
  `TALLER3D_ENV`). No arranca si falta, si es corto (< 32) o si el archivo lo pueden leer otros usuarios. Nunca lo
  imprime ni lo escribe en el registro, que solo lleva método, ruta y código. Quien monte el cliente le pasa el token.
- **Solo esta máquina**: escucha en `127.0.0.1`, rechaza cualquier `Host` que no sea `127.0.0.1:<puerto>` o
  `localhost:<puerto>` y solo responde CORS a `TALLER3D_ORIGENES` (por defecto `http://localhost:9002` y
  `http://127.0.0.1:9002`), sin credenciales.
- Variables: `TALLER3D_RAIZ` (por defecto `~/.starseed/taller-3d`), `TALLER3D_PUERTO` (8797),
  `TALLER3D_BLENDER`, `TALLER3D_INSTANT_MESHES`, `TALLER3D_NODO=a1`.

## Rutas

| Ruta | Token | Qué hace |
|---|---|---|
| `GET /salud` | no | `{ok, servicio, version}` y nada más |
| `GET /capacidades` | sí | `requisitos` (nombres de `REQUISITOS_3D`), `hierro` (forma de `Hierro`), `a1`, `motores` (`{listo, motivo}` por motor) y `recursos` |
| `POST /trabajos` | sí | `{plan, optimizacion?, entrada: {nombre, base64}}` → 202 con el trabajo · 422 si un motor no está listo · 503 si el gobernador lo frena |
| `GET /trabajos/{id}` | sí | estado, etapa, progreso, motivo, resultado y procedencia |
| `GET /trabajos/{id}/resultado` | sí | el archivo final |

Un trabajo cada vez (los demás esperan en cola, en memoria). Cada uno vive en
`~/.starseed/taller-3d/trabajos/<id>/` con su `estado.json`.

## Capacidades (cómo se detectan)

- `apple-silicon-32gb`: macOS en arm64 y `sysctl -n hw.memsize` ≥ 32 GB.
- `cuda-8gb` / `cuda-16gb`: `nvidia-smi --query-gpu=memory.total` (GB redondeados: 16 376 MiB son 16 GB).
- `blender`: `TALLER3D_BLENDER`, `blender` en el PATH o `/Applications/Blender.app`.
- `cpu`: siempre (como `capacidadesDe`); si falta Instant Meshes lo dice su motor.
- **A1** (Oracle, ARM sin GPU; o `TALLER3D_NODO=a1`): solo remallar.

## Etapas y motores

### Generar · image-to-3dlab (AssetFurnace)

Repositorio: <https://github.com/Bingeljell/image-to-3dlab> (código Apache-2.0; cada motor con su licencia,
§1 del contrato). Se espera en `~/.starseed/taller-3d/image-to-3dlab`. Instalar (su instalador **no descarga
pesos**; léelo antes, como pide su README):

```bash
curl -fsSL https://assetfurnace.com/install.sh | bash -s -- --yes --dir ~/.starseed/taller-3d/image-to-3dlab
```

Órdenes que usa el taller (las de su README, sección «CLI»):

| Motor | Orden | Dónde |
|---|---|---|
| `pixal3d` | `.venv/bin/python scripts/pixal3d_generate.py in.png out.glb --seed 42` | NVIDIA ≥ 8 GB (`motores.ts`; image-to-3dlab también lo corre en Mac, pero la tabla del núcleo lo pide con CUDA) |
| `hunyuan3d-mlx` | `hunyuan_mlx/shape/.venv/bin/python scripts/hunyuan_mlx_xiong_generate.py in.png out.glb --model 2.0` | Mac de 32 GB · **pesos sin licencia en la UE, Reino Unido y Corea del Sur** |
| `trellis2` | `vendor/trellis-space-mac/.venv/bin/python scripts/trellis_space_generate.py …` (o `trellis-cuda` + `trellis_cuda_generate.py` con NVIDIA) | Mac de 32 GB o NVIDIA ≥ 16 GB |
| `stable-fast-3d` | — | **No disponible aquí**: su README no documenta la orden de generar por línea de órdenes |

#### Pesos: nunca automáticos

Cada motor descarga 13–14 GB (TRELLIS.2 ~15). El servicio HTTP **no descarga nada nunca**. Hace falta una orden
explícita, y antes se comprueba que haya **el triple de ese espacio libre** (la Mac ya se quedó sin disco):

```bash
python3 servicios/taller-3d/taller.py descargar-pesos --motor pixal3d        # solo dice cuánto y si cabe
python3 servicios/taller-3d/taller.py descargar-pesos --motor pixal3d --si   # descarga (su guion vuelve a preguntar)
```

Lanza el guion de arranque de image-to-3dlab (`scripts/bootstrap_pixal3d.py`, `bootstrap_sf3d.py`,
`bootstrap_trellis_space_macos.py` / `bootstrap_trellis_cuda.py`, `hunyuan_mlx/download_weights.py`).

### Remallar

- **Instant Meshes** (BSD-3): `"Instant Meshes" in.obj -o out.obj -f <caras> -d`. Opciones comprobadas en su
  `src/main.cpp` (`-o/--output` modo por lotes, `-f/--faces`, `-d/--deterministic`). Solo lee y escribe OBJ/PLY:
  con Blender instalado se convierte el GLB antes y después; **sin Blender el resultado se queda en OBJ** y el
  cliente lo dice (la Biblioteca de modelos guarda GLB). Binarios: <https://github.com/wjakob/instant-meshes>
  («Pre-compiled binaries», Intel 64 bits; en la A1, ARM, hay que compilarlo con CMake). Ponlo en el PATH, en
  `~/.starseed/taller-3d/instant-meshes/` o en `TALLER3D_INSTANT_MESHES`.
- **QuadriFlow de Blender** y **vóxeles de Blender** (cierra la malla, pierde las UV): `blender -b
  --factory-startup --python-expr <guion> -- <modo> in out caras`. Necesitan Blender 4.x (importadores
  `wm.obj_import` y `wm.ply_import`).
- Caras: `optimizacion.remallado.caras` del plan (`planOptimizacion`), o 25 000.

### Riggear · UniRig (solo con CUDA)

Clónalo en `~/.starseed/taller-3d/UniRig` (<https://github.com/VAST-AI-Research/UniRig>, MIT, NVIDIA ≥ 8 GB) y
sigue su instalación. El taller corre sus tres guiones de inferencia: `generate_skeleton.sh`,
`generate_skin.sh` y `merge.sh`.

## Procedencia

Cada resultado lleva `<archivo>.provenance.json` (como image-to-3dlab): etapa, herramienta, licencia, uso,
atribución y regiones excluidas (los del motor que eligió `planificar`), sha256 de entrada y salida, ajustes y
fecha. Si el motor dejó su propio `.provenance.json`, va dentro como `origen`. El cliente lo convierte en
`Procedencia` (`procedenciaDeProvenance`): un «uso» desconocido nunca se trata como libre.

## Gobernador

- Generar y riggear (pesados): no con batería, no con presión de memoria ≥ 2 (macOS
  `kern.memorystatus_vm_pressure_level`; Linux `/proc/pressure/memory`), no con menos de 6 GB libres, y no si no
  se puede medir la memoria.
- Remallar: no con presión crítica (4) ni con menos de 1 GB libre.
- En la A1 solo remallar.
- Se comprueba al aceptar el trabajo y otra vez antes de cada etapa.

## Lo que falta (no es de esta tarea)

- Conectar el taller al diálogo «Crear en 3D» (`components/avatares/generar-3d.tsx` pasa `taller: null`): basta
  con `tallerComoDependencia({ token, … })`, pero hace falta decidir cómo llega el token al navegador.
- Un servicio de launchd/systemd que lo arranque, y la acción `taller_3d` en el préstamo de MetaGenesis
  (`src/lib/avatares/taller.ts`).
- Ninguna prueba ha corrido contra Blender, Instant Meshes, image-to-3dlab ni UniRig de verdad: solo con
  subprocesos simulados.
