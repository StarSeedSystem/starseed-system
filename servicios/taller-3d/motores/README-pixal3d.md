# Pixal3D Motor for StarSeed OS 3D Workshop

This module implements the Pixal3D motor as a plugin for the StarSeed OS 3D workshop service (`taller-3d`).

## Installation

To use this motor, you must first install Pixal3D following the official instructions:

1. Follow the [TRELLIS.2 installation guide](https://github.com/microsoft/TRELLIS.2#installation) to set up the base environment.
2. Install additional dependencies as per the [Pixal3D README](https://github.com/TencentARC/Pixal3D#installation):
   ```bash
   pip install -r requirements.txt
   NATTEN_CUDA_ARCH="xx" NATTEN_N_WORKERS=xx pip install natten==0.21.0 --no-build-isolation
   pip install https://github.com/LDYang694/Storages/releases/download/20260430/utils3d-0.0.2-py3-none-any.whl
   ```
3. Download the model checkpoints from the [Pixal3D Hugging Face page](https://huggingface.co/TencentARC/Pixal3D) and place them in a directory (e.g., `~/Pixal3d/ckpts`).

## Configuration

Set the following environment variables to configure the motor:

- `PIXAL3D_ROOT`: Path to the root of the Pixal3D repository (where `inference.py` is located). Defaults to `~/Pixal3D`.
- Other environment variables as per the Pixal3D documentation (e.g., `ATTN_BACKEND=sdpa` if you don't have `flash_attn` installed).

## Usage in StarSeed OS

The motor is automatically registered by the `taller-3d` service if it detects the module. Otherwise, you can test it directly:

```bash
python3 -m motores.pixal3d --entrada input.png --salida output_dir --resolucion 1024 --poca_memoria
```

## Implementation Notes

- The motor requires an NVIDIA GPU with at least 16 GB of VRAM.
- It checks for the presence of the Pixal3D inference script and model checkpoints.
- The provenance information includes the tool name, license (MIT with third-party components as per NOTICE), and usage type (condicionado).
- Possible failure modes:
  - `no-instalado`: Motor not available (missing GPU, dependencies, or files)
  - `sin-memoria`: CUDA out of memory during generation
  - `lento`: Generation took too long (timeout)
  - `error`: Other error during generation
  - `None`: Successful generation

## License

This motor is released under the same terms as Pixal3D: MIT for the code, with third-party components licensed according to their respective terms (see the Pixal3D NOTICE file).