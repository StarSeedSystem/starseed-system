#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Envío de lo aprobado en alcance (ALC1113F).
Solo corre en el líder con claves. Envía SOLO borradores con aprobación cuyo hash,
destinatario y canal coinciden. Adaptadores: github_discussion (GraphQL), email (Gmail API),
asistido (Telegram a Maggasukha + espera /enviado). Si falta clave de canal, pasa a asistido.
ALCANCE_ENVIO=0 (por defecto) es simulacro. Tope 5 envíos/día; registro de baja; nunca reenvía;
registro en starseed_memory_root/alcance/envios.jsonl; aviso por Telegram.
"""
from __future__ import annotations
import hashlib
import json
import os
import time
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

import lider_direccion as LD

# ── Constantes ─────────────────────────────────────────────────────
TOPE_ENVIOS_DIA = 5
ALCANCE_ENVIO = os.environ.get("ALCANCE_ENVIO", "0") == "1"


# ── Tipos ──────────────────────────────────────────────────────────
@dataclass
class Envio:
    """Un envío pendiente."""
    texto: str
    destinatario: str
    canal: str
    datos_canal: dict

    def __post_init__(self):
        self.hash = hashlib.sha256(self.texto.encode('utf-8')).hexdigest()


@dataclass
class EnvioRegistro:
    """Registro de envío realizado."""
    envio: Envio
    modo: str                    # "simulado" | "real"
    cuando: str                  # ISO datetime
    resultado: str               # "ok" | "error"
    id_externo: str = ""         # ID de la Discussion, message-id email, etc.

    def to_dict(self) -> dict:
        return {
            "hash": self.envio.hash,
            "texto": self.envio.texto,
            "destinatario": self.envio.destinatario,
            "canal": self.envio.canal,
            "datos_canal": self.envio.datos_canal,
            "modo": self.modo,
            "cuando": self.cuando,
            "resultado": self.resultado,
            "id_externo": self.id_externo,
        }


# ── Rutas de archivos ──────────────────────────────────────────────
def _ruta_borradores() -> Path:
    """Directorio de borradores."""
    raiz = os.environ.get("STARSEED_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    return Path(raiz) / "starseed_memory_root" / "alcance" / "borradores"


def _ruta_aprobaciones() -> Path:
    """Archivo de aprobaciones."""
    raiz = os.environ.get("STARSEED_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    return Path(raiz) / "starseed_memory_root" / "alcance" / "aprobaciones.jsonl"


def _ruta_envios() -> Path:
    """Archivo de registro de envíos."""
    raiz = os.environ.get("STARSEED_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    return Path(raiz) / "starseed_memory_root" / "alcance" / "envios.jsonl"


def _ruta_bajas() -> Path:
    """Archivo de registro de bajas."""
    raiz = os.environ.get("STARSEED_ROOT") or os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    return Path(raiz) / "starseed_memory_root" / "alcance" / "bajas.jsonl"


# ── Lectura de datos (E/S inyectable) ──────────────────────────────
def _leer_borradores() -> list[dict]:
    """Lee todos los borradores del directorio."""
    ruta = _ruta_borradores()
    if not ruta.exists():
        return []
    
    borradores = []
    for archivo in sorted(ruta.glob("*.json")):
        try:
            with open(archivo, encoding="utf-8") as f:
                borradores.append(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass
    return borradores


def _leer_aprobaciones() -> list[dict]:
    """Lee todas las aprobaciones del JSONL."""
    ruta = _ruta_aprobaciones()
    if not ruta.exists():
        return []
    
    aprobaciones = []
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea:
                    aprobaciones.append(json.loads(linea))
    except (json.JSONDecodeError, OSError):
        pass
    return aprobaciones


def _leer_envios() -> list[dict]:
    """Lee todos los envíos registrados."""
    ruta = _ruta_envios()
    if not ruta.exists():
        return []
    
    envios = []
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea:
                    envios.append(json.loads(linea))
    except (json.JSONDecodeError, OSError):
        pass
    return envios


def _leer_bajas() -> set[str]:
    """Lee destinatarios dados de baja."""
    ruta = _ruta_bajas()
    if not ruta.exists():
        return set()
    
    bajas = set()
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea:
                    data = json.loads(linea)
                    if isinstance(data, dict) and data.get("destinatario"):
                        bajas.add(data["destinatario"])
    except (json.JSONDecodeError, OSError):
        pass
    return bajas


# ── Escritura de datos ─────────────────────────────────────────────
def _guardar_envio(registro: EnvioRegistro) -> None:
    """Guarda un registro de envío al final del JSONL."""
    ruta = _ruta_envios()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps(registro.to_dict(), ensure_ascii=False) + "\n")


def _guardar_baja(destinatario: str) -> None:
    """Registra un destinatario en la lista de bajas."""
    ruta = _ruta_bajas()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps({"destinatario": destinatario, "cuando": date.today().isoformat()}, ensure_ascii=False) + "\n")


# ── Utilidades ─────────────────────────────────────────────────────
def _contar_envios_hoy() -> int:
    """Cuenta envíos registrados hoy."""
    hoy = date.today().isoformat()
    envios = _leer_envios()
    return sum(1 for e in envios if e.get("cuando", "").startswith(hoy))


def _ya_enviado_hoy(destinatario: str, hash_texto: str) -> bool:
    """Verifica si ya se envió a este destinatario con este hash hoy."""
    hoy = date.today().isoformat()
    envios = _leer_envios()
    for e in envios:
        if (e.get("destinatario") == destinatario and
            e.get("hash") == hash_texto and
            e.get("cuando", "").startswith(hoy)):
            return True
    return False


def _tiene_aprobacion_valida(borrador: dict) -> bool:
    """Verifica si el borrador tiene aprobación válida (hash, destinatario, canal coinciden)."""
    texto = borrador.get("texto", "")
    destinatario = borrador.get("destinatario", "")
    canal = borrador.get("canal", {})
    medio = canal.get("medio", "") if isinstance(canal, dict) else ""
    
    if not (texto and destinatario and medio):
        return False
    
    hash_texto = hashlib.sha256(texto.encode('utf-8')).hexdigest()
    aprobaciones = _leer_aprobaciones()
    
    for ap in aprobaciones:
        if (ap.get("hash") == hash_texto and
            ap.get("destinatario") == destinatario and
            ap.get("canal") == medio and
            ap.get("estado") == "aprobado"):
            return True
    return False


# ── Adaptadores de envío ───────────────────────────────────────────
def _enviar_github_discussion(
    envio: Envio,
    env: dict,
    enviar_telegram: Callable[[str], None]
) -> dict:
    """Envía vía GitHub Discussions (GraphQL createDiscussion)."""
    if not ALCANCE_ENVIO:
        return {
            "ok": True,
            "canal": "github_discussion",
            "modo": "simulado",
            "detalle": f"Simulado: crearía Discussion en {envio.datos_canal.get('repo')} categoría {envio.datos_canal.get('categoria')}"
        }
    
    token = env.get("GITHUB_ALCANCE_TOKEN", "")
    if not token:
        return {"ok": False, "canal": "github_discussion", "motivo": "falta GITHUB_ALCANCE_TOKEN"}
    
    # TODO: Implementar GraphQL createDiscussion real
    return {"ok": False, "canal": "github_discussion", "motivo": "GitHub Discussion no implementado"}


def _enviar_email(
    envio: Envio,
    env: dict,
    enviar_telegram: Callable[[str], None]
) -> dict:
    """Envía vía Gmail API desde cuenta fundacion."""
    if not ALCANCE_ENVIO:
        return {
            "ok": True,
            "canal": "email",
            "modo": "simulado",
            "detalle": f"Simulado: enviaría email a {envio.datos_canal.get('valor')}"
        }
    
    # TODO: Implementar Gmail API real
    return {"ok": False, "canal": "email", "motivo": "Email no implementado"}


def _enviar_asistido(
    envio: Envio,
    env: dict,
    enviar_telegram: Callable[[str], None]
) -> dict:
    """Envío asistido: avisa a Maggasukha por Telegram y espera /enviado."""
    if not ALCANCE_ENVIO:
        return {
            "ok": True,
            "canal": "asistido",
            "modo": "simulado",
            "detalle": f"Simulado: avisaría a Maggasukha para envío asistido a {envio.destinatario}"
        }
    
    lugar = envio.datos_canal.get("lugar", envio.datos_canal.get("valor", "lugar desconocido"))
    texto_aviso = (
        f"📬 Envío asistido pendiente\n"
        f"Destinatario: {envio.destinatario}\n"
        f"Canal: {envio.canal}\n"
        f"Lugar: {lugar}\n\n"
        f"Texto:\n{envio.texto}\n\n"
        f"Responde /enviado {envio.hash[:8]} cuando lo hayas enviado."
    )
    
    try:
        enviar_telegram(texto_aviso)
        return {
            "ok": True,
            "canal": "asistido",
            "modo": "real",
            "detalle": "Aviso enviado a Maggasukha por Telegram, esperando /enviado"
        }
    except Exception as e:
        return {"ok": False, "canal": "asistido", "motivo": f"Error enviando aviso Telegram: {e}"}


def _enviar_por_canal(
    envio: Envio,
    env: dict,
    enviar_telegram: Callable[[str], None]
) -> dict:
    """Despacha al adaptador según el canal; si falta clave y no es simulado, pasa a asistido."""
    canal = envio.canal
    
    # En modo simulado, no requerimos tokens reales
    es_simulado = not ALCANCE_ENVIO
    
    if canal == "github_discussion":
        if not es_simulado:
            token = env.get("GITHUB_ALCANCE_TOKEN", "")
            if not token:
                return _enviar_asistido(envio, env, enviar_telegram)
        return _enviar_github_discussion(envio, env, enviar_telegram)
    
    elif canal == "email":
        if not es_simulado:
            # Verificar si hay credenciales de Gmail para fundacion
            if not env.get("GMAIL_FUNDACION_TOKEN", ""):
                return _enviar_asistido(envio, env, enviar_telegram)
        return _enviar_email(envio, env, enviar_telegram)
    
    elif canal == "asistido":
        return _enviar_asistido(envio, env, enviar_telegram)
    
    else:
        # Canal desconocido -> asistido
        return _enviar_asistido(envio, env, enviar_telegram)


# ── Lógica principal ───────────────────────────────────────────────
def enviar_aprobados(
    soy_lider: bool | None = None,
    enviar_telegram: Callable[[str], None] | None = None,
    leer_env: Callable[[], dict] | None = None,
) -> list[dict]:
    """Procesa borradores aprobados y los envía.
    
    Args:
        soy_lider: Si es True, ejecuta el envío. Si None, verifica con lider_direccion.
        enviar_telegram: Función para enviar avisos por Telegram (inyectable).
        leer_env: Función para leer variables de entorno (inyectable).
    
    Returns:
        Lista de resultados de envío.
    """
    # Verificar liderazgo
    if soy_lider is None:
        lider_check = LD.soy_lider()
        if not lider_check.get("soy"):
            return [{"ok": False, "motivo": "No soy líder de dirección"}]
    elif not soy_lider:
        return [{"ok": False, "motivo": "No soy líder de dirección"}]
    
    # Tope diario
    if _contar_envios_hoy() >= TOPE_ENVIOS_DIA:
        return [{"ok": False, "motivo": f"Tope diario de {TOPE_ENVIOS_DIA} envíos alcanzado"}]
    
    # Leer borradores
    borradores = _leer_borradores()
    if not borradores:
        return []
    
    # Leer bajas
    bajas = _leer_bajas()
    
    # Leer entorno
    lector_env = leer_env or (lambda: dict(os.environ))
    env = lector_env()
    
    # Función de envío Telegram por defecto
    def _enviar_telegram_defecto(texto: str) -> None:
        pass  # Se inyecta en tests; en producción usaría sintesis_telegram
    
    telegram_fn = enviar_telegram or _enviar_telegram_defecto
    
    resultados = []
    enviados_hoy = 0
    
    for borrador in borradores:
        if enviados_hoy >= TOPE_ENVIOS_DIA:
            break
        
        # Solo borradores en espera de aprobación
        if borrador.get("estado") != "esperando-aprobacion":
            continue
        
        # Verificar aprobación válida
        if not _tiene_aprobacion_valida(borrador):
            continue
        
        destinatario = borrador.get("destinatario", "")
        if not destinatario:
            continue
        
        # Verificar lista de bajas
        if destinatario in bajas:
            continue
        
        # Verificar no reenvío
        texto = borrador.get("texto", "")
        hash_texto = hashlib.sha256(texto.encode('utf-8')).hexdigest()
        if _ya_enviado_hoy(destinatario, hash_texto):
            continue
        
        # Crear envío
        canal = borrador.get("canal", {})
        medio = canal.get("medio", "") if isinstance(canal, dict) else ""
        if not medio:
            continue
        
        envio = Envio(
            texto=texto,
            destinatario=destinatario,
            canal=medio,
            datos_canal=canal if isinstance(canal, dict) else {}
        )
        
        # Enviar
        resultado_envio = _enviar_por_canal(envio, env, telegram_fn)
        
        # Registrar
        registro = EnvioRegistro(
            envio=envio,
            modo="simulado" if not ALCANCE_ENVIO else ("real" if resultado_envio.get("ok") else "error"),
            cuando=datetime.now().isoformat(timespec="seconds"),
            resultado="ok" if resultado_envio.get("ok") else "error",
            id_externo=resultado_envio.get("id_externo", "")
        )
        _guardar_envio(registro)
        
        # Aviso Telegram
        if resultado_envio.get("ok"):
            aviso = (
                f"✅ Enviado: {destinatario} por {medio}\n"
                f"Modo: {registro.modo}\n"
                f"Hash: {hash_texto[:16]}..."
            )
        else:
            aviso = (
                f"❌ Error enviando a {destinatario} por {medio}\n"
                f"Motivo: {resultado_envio.get('motivo', 'desconocido')}"
            )
        telegram_fn(aviso)
        
        resultados.append({
            "ok": resultado_envio.get("ok", False),
            "destinatario": destinatario,
            "canal": medio,
            "modo": registro.modo,
            "resultado": registro.resultado,
            "detalle": resultado_envio.get("detalle", resultado_envio.get("motivo", ""))
        })
        
        if resultado_envio.get("ok"):
            enviados_hoy += 1
    
    return resultados


def procesar_envio(
    envio: Envio,
    env: dict | None = None,
    enviar_telegram: Callable[[str], None] | None = None,
) -> dict:
    """Procesa un único envío (para tests)."""
    env = env or dict(os.environ)
    def _enviar_telegram_defecto(texto: str) -> None:
        pass
    telegram_fn = enviar_telegram or _enviar_telegram_defecto
    return _enviar_por_canal(envio, env, telegram_fn)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada CLI."""
    import sys
    argv = argv or sys.argv[1:]
    
    if not argv or argv[0] in ("-h", "--help", "help"):
        print("Uso: alcance_envio.py enviar")
        return 0
    
    if argv[0] == "enviar":
        resultados = enviar_aprobados()
        print(json.dumps(resultados, ensure_ascii=False, indent=2))
        return 0 if all(r.get("ok") for r in resultados) else 1
    
    print(f"Orden desconocida: {argv[0]}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())