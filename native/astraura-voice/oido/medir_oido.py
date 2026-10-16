#!/usr/bin/env python3
"""Script de medición para oído Astraura (Phonon-2)"""

import asyncio
import json
import platform
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

CONFIG_DIR = Path.home() / ".starseed"
MEDIDAS_FILE = CONFIG_DIR / "oido-medidas.json"

async def transcribe_phonon(audio_file: Path) -> Dict[str, Any]:
    """Envía un archivo de audio al servidor Phonon y mide el tiempo real"""

    if not audio_file.exists():
        return {"error": "Archivo no encontrado", "tiempoRealMs": 0}

    import aiohttp

    start_time = time.time()
    try:
        async with aiohttp.ClientSession() as session:
            form_data = aiohttp.FormData()
            form_data.add_field('file', audio_file.open('rb'),
                                filename=audio_file.name)

            async with session.post(f"http://127.0.0.1:4470/v1/audio/transcriptions",
                                     data=form_data) as response:
                end_time = time.time()
                tiempo_real_ms = (end_time - start_time) * 1000

                if response.status == 200:
                    result = await response.json()
                    return {
                        "motor": "Phonon-2",
                        "tiempoRealMs": round(tiempo_real_ms, 2),
                        "idioma": result.get("language", "unknown"),
                        "texto": result.get("text", ""),
                        "fecha": datetime.now().isoformat()
                    }
                else:
                    return {
                        "motor": "Phonon-2",
                        "tiempoRealMs": round(tiempo_real_ms, 2),
                        "error": f"HTTP {response.status}",
                        "fecha": datetime.now().isoformat()
                    }
    except Exception as e:
        end_time = time.time()
        tiempo_real_ms = (end_time - start_time) * 1000
        return {
            "motor": "Phonon-2",
            "tiempoRealMs": round(tiempo_real_ms, 2),
            "error": str(e),
            "fecha": datetime.now().isoformat()
        }

async def generate_test_audio() -> Path:
    """Genera un archivo de audio de prueba con la voz"""
    audio_file = CONFIG_DIR / "test_audio.wav"

    try:
        if platform.system() == "Darwin":
            subprocess.run(["say", "Astraura test audio"], check=True,
                         capture_output=True)
        else:
            subprocess.run(["espeak", "Astraura test audio", "-w",
                          str(audio_file)], check=True, capture_output=True)

        if not audio_file.exists():
            return None

        return audio_file
    except Exception as e:
        print(f"error al generar audio: {e}")
        return None

async def main():
    """Ejecuta la suite completa de pruebas"""
    print("=== Mediciones del oído Astraura (Phonon-2) ===")

    audio_file = await generate_test_audio()
    if not audio_file:
        print("Error: no se pudo generar el audio de prueba")
        return

    print(f"Audio generado: {audio_file}")

    results = await asyncio.gather(
        transcribe_phonon(audio_file),
        return_exceptions=True
    )

    medidas = {}
    for result in results:
        if isinstance(result, Exception):
            print(f"Error en la prueba: {result}")
            continue

        motor = result.get("motor")
        medidas[motor] = {
            "tiempoRealMs": result.get("tiempoRealMs", 0),
            "idioma": result.get("idioma", "unknown"),
            "fecha": result.get("fecha", datetime.now().isoformat())
        }

        if "texto" in result:
            medidas[motor]["texto"] = result["texto"]

    MEDIDAS_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(MEDIDAS_FILE, "w") as f:
        json.dump(medidas, f, indent=2)

    print(f"\n=== Resultados guardados en {MEDIDAS_FILE} ===")
    for motor, data in medidas.items():
        print(f"{motor}: {data.get('tiempoRealMs', 0)} ms, idioma: {data.get('idioma', 'unknown')}")

    if audio_file and audio_file.exists():
        audio_file.unlink()