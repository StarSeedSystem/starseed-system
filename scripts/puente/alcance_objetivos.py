#!/usr/bin/env python3
"""Almacén PRIVADO del agente de alcance (INV1025J · R1, R5, R8).
Vive en ~/.starseed/alcance/ (carpeta 700 y archivos 600); NUNCA bajo
starseed_memory_root, que se espeja a Drive (R5). La supresión guarda solo el
hash SHA-256; un objetivo sin nivel es ALTO (R8). home y reloj inyectables.
"""
from __future__ import annotations

import json
import secrets
import time
from pathlib import Path

from alcance_prohibidos import hash_token, prohibidos_en, token_supresion, validar_canal, textos

DIA, TOPE_DIARIO_DEFECTO = 86400, 5
NIVEL_ALTO, NIVELES = "alto", ("alto", "medio", "bajo")
TIPOS = ("persona", "proyecto", "organizacion")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
MADRE_PROHIBIDA, SUPRESION_JS = "starseed_memory_root", "supresion.json"

def normalizar_objetivo(d: dict, ahora: float) -> dict:
    """Completa el objetivo: id opaco `obj-…`, sin nivel → alto (R8), fechas."""
    objetivo = dict(d)
    if not str(objetivo.get("id", "")).startswith("obj-"):
        objetivo["id"] = "obj-" + secrets.token_hex(5)
    if objetivo.get("nivel") not in NIVELES:
        objetivo["nivel"] = NIVEL_ALTO  # R8: sin dato = alto (solo manual)
    if not str(objetivo.get("estado", "")).strip():
        objetivo["estado"] = "nuevo"
    if not isinstance(objetivo.get("afinidad"), int):
        objetivo["afinidad"] = 0
    fechas = dict(objetivo.get("fechas") or {})
    fechas.setdefault("creado", ahora)
    fechas["actualizado"] = ahora
    objetivo["fechas"] = fechas
    return objetivo

def validar_objetivo(objetivo: dict) -> list[str]:
    """Lista de motivos de rechazo (vacía = válido). R5."""
    if not isinstance(objetivo, dict):
        return ["objetivo-no-es-diccionario"]
    rechazos: list[str] = []
    if not str(objetivo.get("nombre_publico", "")).strip():
        rechazos.append("falta-nombre-publico")
    for clave, buenos, motivo in (("tipo", TIPOS, "tipo-invalido"), ("categoria", CATEGORIAS, "categoria-invalida")):
        if objetivo.get(clave) not in buenos:
            rechazos.append(motivo)
    if objetivo.get("nivel", NIVEL_ALTO) not in NIVELES:
        rechazos.append("nivel-invalido")
    if not isinstance(objetivo.get("afinidad", 0), int) or not 0 <= objetivo.get("afinidad", 0) <= 300:
        rechazos.append("afinidad-fuera-de-rango")
    if any(not str(url).startswith("https://") for url in objetivo.get("urls_oficiales", [])):
        rechazos.append("url-no-https")
    for texto in textos(objetivo):
        rechazos.extend("campo-prohibido:" + motivo for motivo in prohibidos_en(str(texto)))
    if objetivo.get("canal_contacto"):
        rechazos.extend(validar_canal(objetivo["canal_contacto"]))
    return sorted(set(rechazos))

def puede_contactar(objetivo: dict, registro: dict, ahora: float, *, automatico: bool = False, contactos_hoy: int = 0, tope_diario: int = TOPE_DIARIO_DEFECTO) -> tuple[bool, str]:
    """Decisión pura: solo un mensaje y un recordatorio a los 14 días.
    `registro`: suprimido (bool), rechazo_alex y no_destinatario (épocas) y envios ({cuando, tipo}).
    """
    if registro.get("suprimido"):
        return False, "suprimido"
    if automatico and objetivo.get("nivel") == NIVEL_ALTO:  # R8: alto nunca automático
        return False, "nivel-alto-solo-manual"
    if registro.get("rechazo_alex") and ahora < registro["rechazo_alex"] + 90 * DIA:
        return False, "pausa-rechazo-alex"
    if registro.get("no_destinatario") and ahora < registro["no_destinatario"] + 180 * DIA:
        return False, "pausa-no-destinatario"
    envios = registro.get("envios") or []
    if len(envios) >= 2:
        return False, "maximo-dos-envios"
    if len(envios) == 1 and ahora - float(envios[0].get("cuando", 0)) < 14 * DIA:
        return False, "recordatorio-antes-de-14-dias"
    if contactos_hoy >= tope_diario:
        return False, "tope-diario"
    return True, ""

class Almacen:
    """Almacén privado de objetivos y supresión. home y reloj inyectables."""
    def __init__(self, home: Path | str | None = None, ahora=time.time) -> None:
        self.ahora = ahora
        self.carpeta = Path(home) / ".starseed" / "alcance" if home else Path.home() / ".starseed" / "alcance"
        if MADRE_PROHIBIDA in str(self.carpeta):  # R5: allí se espeja a Drive y lo leen agentes
            raise ValueError("El almacén privado NUNCA vive bajo " + MADRE_PROHIBIDA)
        self.carpeta.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.carpeta.chmod(0o700)

    def _escribir_archivo(self, nombre: str, datos: dict):
        ruta = self.carpeta / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        ruta.chmod(0o600)
        return ruta

    def guardar_objetivo(self, objetivo: dict) -> dict:
        """Valida, escribe la ficha (600) y devuelve el objetivo normalizado."""
        ficha = normalizar_objetivo(objetivo, self.ahora())
        rechazos = validar_objetivo(ficha)
        if rechazos:
            raise ValueError("objetivo rechazado: " + ", ".join(rechazos))
        self._escribir_archivo(ficha["id"] + ".json", ficha)
        return ficha

    def _lista_supresion(self) -> dict:
        ruta = self.carpeta / SUPRESION_JS
        return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}

    def suprimir(self, correo=None, *, dominio=None, nombre=None) -> str:
        """Anota SOLO el hash del correo o del par dominio+nombre (R5)."""
        huella = hash_token(token_supresion(correo, dominio, nombre))
        lista = self._lista_supresion()
        lista[huella] = {"desde": self.ahora()}
        self._escribir_archivo(SUPRESION_JS, lista)
        return huella

    def suprimido(self, correo=None, *, dominio=None, nombre=None) -> bool:
        return hash_token(token_supresion(correo, dominio, nombre)) in self._lista_supresion()
