import hashlib
import json
from pathlib import Path
from typing import Dict, Any, List, Optional


class Aprobacion:
    def __init__(self, texto: str, destinatario: str, canal: str):
        self.texto = texto
        self.destinatario = destinatario
        self.canal = canal
        self.hash = hashlib.sha256(texto.encode('utf-8')).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hash": self.hash,
            "texto": self.texto,
            "destinatario": self.destinatario,
            "canal": self.canal
        }


class AprobacionRegistro:
    def __init__(self, aprobacion: Aprobacion, quien: str, cuando: str):
        self.aprobacion = aprobacion
        self.quien = quien
        self.cuando = cuando

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hash": self.aprobacion.hash,
            "texto": self.aprobacion.texto,
            "destinatario": self.aprobacion.destinatario,
            "canal": self.aprobacion.canal,
            "quien": self.quien,
            "cuando": self.cuando,
            "estado": "aprobado"
        }


class RechazoRegistro:
    def __init__(self, aprobacion: Aprobacion, quien: str, cuando: str):
        self.aprobacion = aprobacion
        self.quien = quien
        self.cuando = cuando

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hash": self.aprobacion.hash,
            "texto": self.aprobacion.texto,
            "destinatario": self.aprobacion.destinatario,
            "canal": self.aprobacion.canal,
            "quien": self.quien,
            "cuando": self.cuando,
            "estado": "rechazado"
        }


def aprobar(texto: str, destinatario: str, canal: str, quien: str, cuando: str) -> Dict[str, Any]:
    """Registra una nueva aprobación."""
    aprobacion = Aprobacion(texto, destinatario, canal)
    registro = AprobacionRegistro(aprobacion, quien, cuando)
    _guardar_registro(registro.to_dict())
    return registro.to_dict()


def editar(texto: str, destinatario: str, canal: str, quien: str, cuando: str) -> Dict[str, Any]:
    """Invalida la aprobación existente para el hash dado e inicia una nueva.
    
    Si existe un hash aprobado para (texto, destinatario, canal), lo marca como inválido.
    Luego registra una nueva aprobación.
    """
    hash_nuevo = hashlib.sha256(texto.encode('utf-8')).hexdigest()
    aprobacion = Aprobacion(texto, destinatario, canal)

    hash_antiguo = _encontrar_hash_aprobado(texto, destinatario, canal)
    if hash_antiguo:
        _invalidar_hash(hash_antiguo)

    registro = AprobacionRegistro(aprobacion, quien, cuando)
    _guardar_registro(registro.to_dict())
    return registro.to_dict()


def rechazar(texto: str, destinatario: str, canal: str, quien: str, cuando: str) -> Dict[str, Any]:
    """Rechaza un texto como 'no contactar' si se solicita."""
    aprobacion = Aprobacion(texto, destinatario, canal)
    registro = RechazoRegistro(aprobacion, quien, cuando)
    _guardar_registro(registro.to_dict())
    return registro.to_dict()


def buscar_por_hash(hash: str) -> Optional[Dict[str, Any]]:
    """Busca un registro por hash."""
    for linea in _leer_registros():
        if linea.get("hash") == hash:
            return linea
    return None


def existe_aprobado(hash: str) -> bool:
    """Verifica si existe una aprobación para este hash."""
    return _obtener_aprobado(hash) is not None


def _encontrar_hash_aprobado(texto: str, destinatario: str, canal: str) -> Optional[str]:
    """Encuentra el hash aprobado para un texto/destinatario/canal específico."""
    hash_texto = hashlib.sha256(texto.encode('utf-8')).hexdigest()
    for registro in _leer_registros():
        if (registro.get("hash") == hash_texto and
                registro.get("destinatario") == destinatario and
                registro.get("canal") == canal and
                registro.get("estado") == "aprobado"):
            return hash_texto
    return None


def _leer_registros() -> List[Dict[str, Any]]:
    """Lee todos los registros de aprobaciones."""
    ruta = _ruta_registro()
    if not ruta.exists():
        return []

    registros = []
    with open(ruta, 'r', encoding='utf-8') as f:
        for linea in f:
            if linea.strip():
                registros.append(json.loads(linea.strip()))
    return registros


def _guardar_registro(registro: Dict[str, Any]):
    """Guarda un registro al final del archivo."""
    ruta = _ruta_registro()
    ruta.parent.mkdir(parents=True, exist_ok=True)

    with open(ruta, 'a', encoding='utf-8') as f:
        f.write(json.dumps(registro, ensure_ascii=False) + '\n')


def _invalidar_hash(hash: str):
    """Marca como inválido cualquier registro existente con este hash."""
    registros = _leer_registros()
    actualizado = False

    for registro in registros:
        if registro.get("hash") == hash and registro.get("estado") == "aprobado":
            registro["estado"] = "invalido"
            actualizado = True

    if actualizado:
        _escribir_todos_registros(registros)


def _obtener_aprobado(hash: str) -> Optional[Dict[str, Any]]:
    """Obtiene un registro aprobado por hash."""
    for registro in _leer_registros():
        if registro.get("hash") == hash and registro.get("estado") == "aprobado":
            return registro
    return None


def _escribir_todos_registros(registros: List[Dict[str, Any]]):
    """Escribe todos los registros de vuelta al archivo."""
    ruta = _ruta_registro()
    with open(ruta, 'w', encoding='utf-8') as f:
        for registro in registros:
            f.write(json.dumps(registro, ensure_ascii=False) + '\n')


def _ruta_registro() -> Path:
    """Retorna la ruta del archivo de registro."""
    return Path(f"starseed_memory_root/alcance/aprobaciones.jsonl")