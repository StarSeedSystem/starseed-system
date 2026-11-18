#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera capacidades.json con el estado vivo de salud/estado.json para el planificador."""
import json
import os
from pathlib import Path
from typing import Any


RAIZ_REPO = Path(__file__).parent.parent.parent
SALUD_ESTADO = RAIZ_REPO / "starseed_memory_root" / "salud" / "estado.json"
CAPACIDADES_SALIDA = RAIZ_REPO / "scripts" / "puente" / "capacidades.json"


def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _estado_sesion(salud: dict[str, Any], nombre: str) -> dict[str, Any]:
    """Extrae el estado de una sesión específica del salud/estado.json."""
    detalle = salud.get("detalle", {}).get(nombre, {})
    estado = detalle.get("estado", "desconocido")
    viva = estado == "viva"
    return {
        "viva": viva,
        "estado": estado,
        "detalle": detalle.get("detalle", "") if viva else detalle.get("motivo", ""),
        "comprobada": detalle.get("comprobada"),
        "fallos_consecutivos": detalle.get("fallos_consecutivos", 0),
    }


def generar_capacidades() -> dict[str, Any]:
    """Genera el registro de capacidades activas con estado vivo."""
    salud = _leer_json(SALUD_ESTADO, {})
    
    # Estado de sesiones clave
    notebooklm = _estado_sesion(salud, "notebooklm")
    google_docs = _estado_sesion(salud, "google-docs")
    google_drive = _estado_sesion(salud, "google-drive")
    youtube_nblm = _estado_sesion(salud, "youtube-notebooklm")
    higgsfield = _estado_sesion(salud, "higgsfield")
    mac_blender = _estado_sesion(salud, "mac-blender")
    mac_hyperframes = _estado_sesion(salud, "mac-hyperframes")
    enjambre = _estado_sesion(salud, "enjambre")
    mando = _estado_sesion(salud, "mando")
    
    # Modelos LLM
    modelos_llm = salud.get("modelos_llm", {})
    ultimo_exito = modelos_llm.get("ultimo_exito")
    fallos_consecutivos = modelos_llm.get("fallos_consecutivos", {})
    
    # Determinar qué rutas de modelos están disponibles
    freellmapi_vivo = bool(_leer_json(RAIZ_REPO / "starseed_memory_root" / "salud" / "catalogo_freellmapi.json", {}).get("modelos"))
    nim_vivo = "NIM_KEY" in os.environ
    openrouter_vivo = "OPENROUTER_KEY" in os.environ
    hermes_vivo = mando["viva"]  # Hermes usa la pasarela de la Mac
    
    capacidades = {
        "version": 1,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
        "notebooklm": {
            "disponible": notebooklm["viva"],
            "estado": notebooklm["estado"],
            "detalle": notebooklm["detalle"],
            "cuadernos": True,
            "investigacion_profunda": notebooklm["viva"],
            "formatos": [
                "informe", "audio", "video", "infografia", 
                "presentacion", "mapa_mental", "cuestionario", 
                "tarjetas", "tabla_datos"
            ] if notebooklm["viva"] else [],
        },
        "drive": {
            "disponible": google_drive["viva"],
            "estado": google_drive["estado"],
            "detalle": google_drive["detalle"],
            "archivos": google_drive["viva"],
            "carpetas": google_drive["viva"],
        },
        "docs": {
            "disponible": google_docs["viva"],
            "estado": google_docs["estado"],
            "detalle": google_docs["detalle"],
            "documentos": google_docs["viva"],
        },
        "youtube_notebooklm": {
            "disponible": youtube_nblm["viva"] and notebooklm["viva"],
            "estado": (
                youtube_nblm["estado"]
                if youtube_nblm["viva"] and notebooklm["viva"]
                else ("requiere_notebooklm" if not notebooklm["viva"] else "sesion_youtube_caida")
            ),
            "detalle": (
                youtube_nblm["detalle"]
                if youtube_nblm["viva"] and notebooklm["viva"]
                else ("NotebookLM caído" if not notebooklm["viva"] else youtube_nblm["detalle"])
            ),
            "transcripcion": youtube_nblm["viva"] and notebooklm["viva"],
            "add_source": youtube_nblm["viva"] and notebooklm["viva"],
        },
        "higgsfield": {
            "disponible": higgsfield["viva"],
            "estado": higgsfield["estado"],
            "detalle": higgsfield["detalle"],
            "solo_propuesta": True,  # Nunca ejecuta sin aprobación de Maggasukha
            "modelos": ["seedance-2.0", "veo-3"] if higgsfield["viva"] else [],
        },
        "agentes_alcance": {
            "disponible": True,  # Código local, no depende de sesión externa
            "estado": "vivo",
            "detalle": "ALC1113 - investigación canal, Codex, red de resonancia",
            "funciones": [
                "investigar_canal_youtube",
                "investigacion_profunda",
                "codex",
                "red_resonancia",
                "generar_informe",
                "ficha_contacto",
                "mensaje_pendiente_aprobacion",
            ],
        },
        "mac_blender": {
            "disponible": mac_blender["viva"],
            "estado": mac_blender["estado"],
            "detalle": mac_blender["detalle"],
            "solo_con_mac_viva": True,
        },
        "mac_hyperframes": {
            "disponible": mac_hyperframes["viva"],
            "estado": mac_hyperframes["estado"],
            "detalle": mac_hyperframes["detalle"],
            "solo_con_mac_viva": True,
        },
        "enjambre_olas": {
            "disponible": enjambre["viva"],
            "estado": enjambre["estado"],
            "detalle": enjambre["detalle"],
            "para_codigo": True,
            "puertas": ["alcance", "cableado", "tsc", "vitest", "revision", "integracion"],
        },
        "mando": {
            "disponible": mando["viva"],
            "estado": mando["estado"],
            "detalle": mando["detalle"],
            "genesis_local": mando["viva"],
            "puente_ides": mando["viva"],
        },
        "modelos_llm": {
            "freellmapi": {
                "disponible": freellmapi_vivo,
                "modelos": _leer_json(RAIZ_REPO / "starseed_memory_root" / "salud" / "catalogo_freellmapi.json", {}).get("modelos", []),
                "ultimo_exito": ultimo_exito if ultimo_exito and ultimo_exito.get("ruta") == "freellmapi" else None,
            },
            "nim": {
                "disponible": nim_vivo,
                "modelos": ["minimax-m3.1-flash", "nemotron-3.5-lightning"],
                "max_tokens_alto": True,
                "ultimo_exito": ultimo_exito if ultimo_exito and ultimo_exito.get("ruta") == "nim" else None,
            },
            "openrouter_free": {
                "disponible": openrouter_vivo,
                "modelos": [
                    "meta-llama/llama-3.1-8b-instruct:free",
                    "mistralai/mistral-7b-instruct:free",
                    "google/gemma-2-9b-it:free",
                    "qwen/qwen-2.5-7b-instruct:free",
                ],
                "ultimo_exito": ultimo_exito if ultimo_exito and ultimo_exito.get("ruta") == "openrouter_free" else None,
            },
            "hermes": {
                "disponible": hermes_vivo,
                "modelos": ["hermes"],
                "pasarela_mac": True,
                "ultimo_exito": ultimo_exito if ultimo_exito and ultimo_exito.get("ruta") == "hermes" else None,
            },
            "fallos_consecutivos": fallos_consecutivos,
            "orden_rutas": ["freellmapi", "nim", "openrouter_free", "hermes"],
        },
    }
    
    return capacidades


def main() -> None:
    """Punto de entrada CLI: genera y guarda capacidades.json."""
    capacidades = generar_capacidades()
    _escribir_atomico(CAPACIDADES_SALIDA, capacidades)
    print(f"capacidades.json generado en {CAPACIDADES_SALIDA}")
    print(json.dumps(capacidades, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()