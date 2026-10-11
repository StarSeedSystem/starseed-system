"""
Pixal3D motor for the StarSeed OS 3D workshop.
Implements the common motor interface for the taller-3d service.
"""

import os
import subprocess
import time
import json
from typing import Tuple, Dict, Any

def disponible() -> Tuple[bool, str]:
    """
    Check if Pixal3D is available on this system.
    Returns (True, "") if available, (False, reason) otherwise.
    Checks:
      - NVIDIA GPU with at least 16 GB VRAM via nvidia-smi
      - Python environment and PyTorch with CUDA
      - Presence of Pixal3D inference script and checkpoints
    """
    try:
        # Check nvidia-smi
        result = subprocess.run(
            ["nvidia-smi"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return (False, f"nvidia-smi failed: {result.stderr.strip()}")
        
        # Parse VRAM total from nvidia-smi output
        lines = result.stdout.split('\n')
        vram_total_mib = None
        for line in lines:
            if 'MiB /' in line and '|' in line:
                parts = line.split('|')
                if len(parts) >= 3:
                    mem_part = parts[2].strip()
                    if 'MiB /' in mem_part:
                        total_str = mem_part.split('MiB /')[1].split('MiB')[0]
                        try:
                            vram_total_mib = int(total_str)
                        except ValueError:
                            pass
        if vram_total_mib is None:
            return (False, "Could not parse VRAM from nvidia-smi output")
        
        vram_total_gib = vram_total_mib / 1024
        if vram_total_gib < 16:
            return (False, f"Insufficient VRAM: {vram_total_gib:.1f} GB < 16 GB required")
    except subprocess.TimeoutExpired:
        return (False, "nvidia-smi timeout")
    except FileNotFoundError:
        return (False, "nvidia-smi not found - NVIDIA driver may not be installed")
    except Exception as e:
        return (False, f"Error checking NVIDIA GPU: {e}")

    # Check for Pixal3D root directory
    pixal3d_root = os.environ.get('PIXAL3D_ROOT', os.path.expanduser('~/Pixal3D'))
    inference_py = os.path.join(pixal3d_root, 'inference.py')
    if not os.path.isfile(inference_py):
        return (False, f"Pixal3D inference script not found at {inference_py}")

    # Check for checkpoints directory
    ckpts_dir = os.path.join(pixal3d_root, 'ckpts')
    if not os.path.isdir(ckpts_dir) or not os.listdir(ckpts_dir):
        return (False, f"Pixal3D checkpoints not found or empty in {ckpts_dir}")

    # Check PyTorch and CUDA availability
    try:
        import torch
        if not torch.cuda.is_available():
            return (False, "CUDA not available in PyTorch")
    except ImportError:
        return (False, "PyTorch not installed")

    return (True, "")

def generar(entrada_png: str, carpeta_salida: str, resolucion: int, poca_memoria: bool) -> Dict[str, Any]:
    """
    Generate a 3D model from a PNG image using Pixal3D.
    Args:
        entrada_png: Path to input PNG image.
        carpeta_salida: Directory where output files will be saved.
        resolucion: Resolution (512, 1024, or 1536).
        poca_memoria: If True, use low-VRAM mode.
    Returns:
        Dictionary with:
          ok: bool
          glb: str (path to generated GLB) if ok, else empty string
          procedencia: dict with Pixal3D provenance info
          fallo: str or None (one of: None, 'sin-memoria', 'lento', 'sin-alfa', 'no-instalado', 'error')
          segundos: float (time taken in seconds)
          pico_memoria_gb: float (peak memory used in GB)
    """
    # First, check availability
    avail, motivo = disponible()
    if not avail:
        return {
            "ok": False,
            "glb": "",
            "procedencia": {},
            "fallo": "no-instalado",
            "segundos": 0.0,
            "pico_memoria_gb": 0.0
        }

    # Prepare output directory
    os.makedirs(carpeta_salida, exist_ok=True)
    output_glb = os.path.join(carpeta_salida, "output.glb")
    
    # Build command
    pixal3d_root = os.environ.get('PIXAL3D_ROOT', os.path.expanduser('~/Pixal3D'))
    cmd = [
        "python",
        os.path.join(pixal3d_root, "inference.py"),
        "--image", entrada_png,
        "--output", output_glb,
    ]
    
    # Add resolution and low_vram flags
    if poca_memoria:
        cmd.append("--low_vram")
    # Always specify resolution to override default
    cmd.extend(["--resolution", str(resolucion)])
    
    # Measure time and run
    start_time = time.time()
    try:
        # We'll also set environment variables to control behavior
        env = os.environ.copy()
        # Optionally, we can set ATTN_BACKEND to sdpa if flash_attn is not available
        # But we leave it to the user to set via environment if needed.
        
        # Run the process and capture output
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3600,  # 1 hour timeout
            env=env,
            cwd=pixal3d_root
        )
        
        end_time = time.time()
        segundos = end_time - start_time
        
        # Check for CUDA out of memory in stderr
        stderr_lower = result.stderr.lower()
        if "cuda out of memory" in stderr_lower or "out of memory" in stderr_lower:
            return {
                "ok": False,
                "glb": "",
                "procedencia": _get_procedencia(),
                "fallo": "sin-memoria",
                "segundos": segundos,
                "pico_memoria_gb": 0.0  # We don't measure peak memory yet
            }
        
        # Check if the process succeeded
        if result.returncode != 0:
            return {
                "ok": False,
                "glb": "",
                "procedencia": _get_procedencia(),
                "fallo": "error",
                "segundos": segundos,
                "pico_memoria_gb": 0.0
            }
        
        # Check if output file was created and is not empty
        if not os.path.isfile(output_glb) or os.path.getsize(output_glb) == 0:
            return {
                "ok": False,
                "glb": "",
                "procedencia": _get_procedencia(),
                "fallo": "error",
                "segundos": segundos,
                "pico_memoria_gb": 0.0
            }
        
        # TODO: Measure peak memory usage (we'll leave as 0.0 for now)
        pico_memoria_gb = 0.0
        
        return {
            "ok": True,
            "glb": output_glb,
            "procedencia": _get_procedencia(),
            "fallo": None,
            "segundos": segundos,
            "pico_memoria_gb": pico_memoria_gb
        }
        
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "glb": "",
            "procedencia": _get_procedencia(),
            "fallo": "lento",
            "segundos": 3600.0,  # timeout value
            "pico_memoria_gb": 0.0
        }
    except Exception as e:
        return {
            "ok": False,
            "glb": "",
            "procedencia": _get_procedencia(),
            "fallo": "error",
            "segundos": time.time() - start_time,
            "pico_memoria_gb": 0.0
        }

def _get_procedencia() -> Dict[str, Any]:
    """
    Return the provenance dictionary for Pixal3D.
    Based on the motor definition in motores.ts and the NOTICE.
    """
    return {
        "herramienta": "pixal3d",
        "licencia": "MIT (código y pesos); terceros según su NOTICE",
        "uso": "condicionado"
        # Note: atribucion and regionesExcluidas are omitted as they are not specified
        # in the motor definition and we do not have specific requirements from the NOTICE
        # that require attribution in the UI (though good practice, it's optional).
        # The StarSeed OS will show attributions from the 'atribucion' field if present.
    }

if __name__ == "__main__":
    # Allow running as a script for testing: python3 -m motores.pixal3d --entrada x.png
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", required=True, help="Input PNG image")
    parser.add_argument("--salida", required=True, help="Output directory")
    parser.add_argument("--resolucion", type=int, default=1024, choices=[512, 1024, 1536])
    parser.add_argument("--poca_memoria", action="store_true")
    args = parser.parse_args()
    
    result = generar(args.entrada, args.salida, args.resolucion, args.poca_memoria)
    print(json.dumps(result, indent=2))