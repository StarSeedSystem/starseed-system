#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jobs de Hermes en background para tareas largas del Director presidente.

Permite lanzar Hermes como job con su ID, publicar "en curso" y resultado
al acabar (evitando el corte a 120s del chat normal).
"""
import threading
import time
import uuid
from typing import Any, Callable, Dict, Optional

SEGUNDOS_JOB_FONDO = 600


def crear_job(prompt: str, estado: Dict[str, Any], job_id: Optional[str] = None) -> str:
    """Crea un nuevo job de Hermes en el estado."""
    if job_id is None:
        job_id = f"hjob-{uuid.uuid4().hex[:12]}"
    estado.setdefault("hermes_jobs", {})[job_id] = {
        "id": job_id, "prompt": prompt, "estado": "en_curso",
        "inicio": time.time(), "resultado": None, "error": None, "fin": None,
    }
    return job_id


def obtener_estado(job_id: str, estado: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Obtiene el estado actual de un job."""
    return estado.get("hermes_jobs", {}).get(job_id)


def _orden_hermes(prompt: str, modelo: Optional[str] = None, sesion: Optional[str] = None) -> list:
    orden = ["hermes"]
    if sesion:
        orden += ["--resume", sesion]
    orden += ["-z", prompt]
    if modelo and modelo != "predeterminado":
        orden += ["-m", modelo]
    return orden


def _ejecutar(job_id: str, estado: Dict, correr: Callable, modelo: Optional[str],
              sesion: Optional[str], segundos: int, callback: Optional[Callable[[str], None]]) -> None:
    job = estado["hermes_jobs"][job_id]
    prompt = job["prompt"]

    def avisar(msg: str):
        if callback:
            try:
                callback(f"[{job_id}] {msg}")
            except Exception:
                pass

    avisar("iniciando job Hermes en background…")
    try:
        rc, salida = correr(_orden_hermes(prompt, modelo, sesion), entrada=None, segundos=segundos)
        if rc == 0 and salida and salida.strip():
            job["estado"] = "completado"
            job["resultado"] = salida.strip()
            avisar(f"completado en {time.time() - job['inicio']:.1f}s")
        else:
            job["estado"] = "error"
            job["error"] = (salida or f"Hermes salió con código {rc}").strip()[:500]
            avisar(f"falló: {job['error'][:100]}")
    except Exception as e:
        job["estado"] = "error"
        job["error"] = f"Excepción: {type(e).__name__}: {e}"
        avisar(f"excepción: {e}")
    finally:
        job["fin"] = time.time()


def lanzar_job(job_id: str, estado: Dict[str, Any], correr: Callable,
               modelo: Optional[str] = None, sesion: Optional[str] = None,
               segundos: int = SEGUNDOS_JOB_FONDO,
               callback_progreso: Optional[Callable[[str], None]] = None) -> threading.Thread:
    """Lanza un job de Hermes en background. Devuelve el hilo."""
    if job_id not in estado.get("hermes_jobs", {}):
        raise ValueError(f"Job {job_id} no existe")
    hilo = threading.Thread(
        target=_ejecutar, args=(job_id, estado, correr, modelo, sesion, segundos, callback_progreso),
        daemon=True,
    )
    hilo.start()
    return hilo


def esperar_job(job_id: str, estado: Dict[str, Any], timeout: Optional[float] = None) -> Dict[str, Any]:
    """Espera a que un job termine y devuelve su estado final."""
    inicio = time.time()
    while True:
        job = obtener_estado(job_id, estado)
        if not job:
            raise ValueError(f"Job {job_id} no existe")
        if job["estado"] in ("completado", "error"):
            return job
        if timeout and time.time() - inicio > timeout:
            raise TimeoutError(f"Job {job_id} no terminó en {timeout}s")
        time.sleep(0.5)


__all__ = ["SEGUNDOS_JOB_FONDO", "crear_job", "obtener_estado", "lanzar_job", "esperar_job"]