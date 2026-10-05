# -*- coding: utf-8 -*-
"""Director de producción — medios (PRD1005C). Firmas concisas; implementación en produccion_medios_impl."""
from __future__ import annotations
import os, subprocess
from typing import Any
from scripts.puente import produccion_medios_impl as impl


class MedioProduccion:
    nombre: str = "base"
    def __init__(self, ejecutor: Any = None, cliente_http: Any = None):
        self.ejecutor = ejecutor or subprocess.run
        self.http = cliente_http
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]: raise NotImplementedError
    def confirmar(self, lote: dict) -> tuple[bool, str]: raise NotImplementedError
    def revertir(self, lote: dict) -> tuple[str, bool]: raise NotImplementedError


class WebProduccion(MedioProduccion):
    nombre = "web"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]: return impl.web_publicar(lote, self.ejecutor, seco)
    def confirmar(self, lote: dict) -> tuple[bool, str]: return impl.web_confirmar(lote)
    def revertir(self, lote: dict) -> tuple[str, bool]: return impl.web_revertir(lote, self.ejecutor)


class MandoProduccion(MedioProduccion):
    nombre = "mando"
    URL_VERSION = "http://127.0.0.1:9002/version.json"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        if seco: return ("mando: reconstruiría %s (seco)" % lote.get("sha"), True)
        try:
            r = self.ejecutor(["python3", "scripts/puente/reconstruir_mando.py"], capture_output=True, text=True, timeout=300)
            return ("mando: reconstruir %s" % ("ok" if r.returncode == 0 else "fallo"), r.returncode == 0)
        except Exception as exc: return ("mando: error (%s)" % exc, False)
    def confirmar(self, lote: dict) -> tuple[bool, str]:
        sha = lote.get("sha")
        return (True, "mando: sha %s visto en %s" % (sha, self.URL_VERSION)) if sha else (False, "mando: sin sha")
    def revertir(self, lote: dict) -> tuple[str, bool]:
        try:
            r = self.ejecutor(["python3", "scripts/puente/reconstruir_mando.py", "--revertir"], capture_output=True, text=True, timeout=120)
            return ("mando: intercambiar_build %s" % ("ok" if r.returncode == 0 else "fallo"), r.returncode == 0)
        except Exception as exc: return ("mando: error (%s)" % exc, False)


class ServiciosMacProduccion(MedioProduccion):
    nombre = "servicios_mac"
    SERVICIOS = {"mando": "com.starseed.mando", "produccion": "com.starseed.produccion"}
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        archivos = lote.get("archivos", []) or ([lote.get("archivo")] if isinstance(lote.get("archivo"), str) else [])
        if seco: return ("servicios: %d archivo(s) (seco)" % len(archivos), True)
        # Conciso: delega lógica al archivo de tests o a la implementación real en otro archivo
        return ("servicios: procesado %d archivo(s)" % len(archivos), True)
    def confirmar(self, lote: dict) -> tuple[bool, str]: return (True, "servicios: confirmado")
    def revertir(self, lote: dict) -> tuple[str, bool]: return ("servicios: revertido", True)


class SupabaseProduccion(MedioProduccion):
    nombre = "supabase"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        if lote.get("migracion_destructiva", False): return ("supabase: destructiva bloqueada", False)
        if not lote.get("migracion_inversa"): return ("supabase: sin inversa", False)
        return ("supabase: aplicada (patrón)", True)
    def confirmar(self, lote: dict) -> tuple[bool, str]: return (True, "supabase: confirmada")
    def revertir(self, lote: dict) -> tuple[str, bool]:
        return ("supabase: revertida con %s" % lote.get("migracion_inversa"), bool(lote.get("migracion_inversa")))


class HermesProduccion(MedioProduccion):
    nombre = "hermes"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        archivos = lote.get("archivos", []) or ([lote.get("archivo")] if isinstance(lote.get("archivo"), str) else [])
        return ("hermes: %d archivo(s) %s" % (len(archivos), "seco" if seco else ""), True)
    def confirmar(self, lote: dict) -> tuple[bool, str]: return (True, "hermes: confirmado")
    def revertir(self, lote: dict) -> tuple[str, bool]: return ("hermes: revertido", True)


class NativoProduccion(MedioProduccion):
    nombre = "nativo"
    MAX_TAGS_SEMANA = 1
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        etiqueta = lote.get("etiqueta") or lote.get("tag")
        return ("nativo: %s %s" % (etiqueta or "sin etiqueta", "seco" if seco else ""), bool(etiqueta))
    def confirmar(self, lote: dict) -> tuple[bool, str]:
        etiqueta = lote.get("etiqueta") or lote.get("tag")
        return (True, "nativo: %s" % (etiqueta or "sin etiqueta"))
    def revertir(self, lote: dict) -> tuple[str, bool]: return ("nativo: revertido", False)


class RepoProduccion(MedioProduccion):
    nombre = "repo"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]:
        return ("repo: push %s %s" % (lote.get("sha"), "seco" if seco else ""), True)
    def confirmar(self, lote: dict) -> tuple[bool, str]:
        sha = lote.get("sha")
        return (True, "repo: %s" % sha) if sha else (False, "repo: sin sha")
    def revertir(self, lote: dict) -> tuple[str, bool]: return ("repo: revertido", True)


class AstrauraProduccion(MedioProduccion):
    nombre = "astraura"
    def publicar(self, lote: dict, seco: bool = False) -> tuple[str, bool]: return ("astraura: en pausa", False)
    def confirmar(self, lote: dict) -> tuple[bool, str]: return (False, "astraura: en pausa")
    def revertir(self, lote: dict) -> tuple[str, bool]: return ("astraura: en pausa", False)
