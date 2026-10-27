"""Almacén PRIVADO del agente de alcance (R1, R5, R8).

Módulo puro con stdlib. home y reloj inyectables.
NUNCA bajo starseed_memory_root (se espeja a Drive).
Carpeta: ~/.starseed/alcance/ con permisos 700, archivos con 600.
"""

import hashlib
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

TIPOS_OBJETIVO = {"persona", "proyecto", "organizacion"}
CATEGORIAS_OBJETIVO = {
    "activista",
    "desarrollador",
    "influencer",
    "proyecto-afin",
    "fundacion",
    "otro",
}
NIVELES_OBJETIVO = {"alto", "medio", "bajo"}
MEDIOS_CANAL = {"correo", "github", "formulario", "red", "otro"}

CAMPOS_PROHIBIDOS_OBJETIVO = {
    "salud",
    "religion",
    "creencias",
    "orientacion",
    "politica_personal",
    "familia",
    "ubicacion_privada",
    "ingresos",
    "telefono_personal",
    "telefono",
    "direccion",
    "domicilio",
    "datos_salud",
}

PALABRAS_PROHIBIDAS = (
    "salud",
    "religion",
    "religioso",
    "creencia",
    "creencias",
    "orientacion",
    "orientación",
    "homosexual",
    "transgenero",
    "transgénero",
    "bisexual",
    "politica_personal",
    "partido",
    "afiliacion_politica",
    "afiliación política",
    "familia",
    "hijos",
    "conyuge",
    "cónyuge",
    "ubicacion_privada",
    "domicilio",
    "ingresos",
    "salario",
    "renta",
    "telefono_personal",
    "teléfono_personal",
    "móvil_privado",
)

PAUSA_RECHAZO_ALEX_DIAS = 90
PAUSA_NO_DESTINATARIO_DIAS = 180
RECORDATORIO_MAX_DIAS = 14
MENSAJES_MAX_POR_CICLO = 1
TOPE_DIARIO_DEFECTO = 5


def _ruta_base_alcance(home: Optional[Union[str, Path]] = None) -> Path:
    """Ruta base privada ~/.starseed/alcance. Nunca bajo starseed_memory_root."""
    if home is None:
        home_path = Path.home()
    else:
        home_path = Path(home)
    base = home_path / ".starseed" / "alcance"
    return base


def asegurar_almacen(
    home: Optional[Union[str, Path]] = None, modo_carpeta: int = 0o700
) -> Path:
    """Crea la carpeta privada con permisos 700. Archivos se crean con 600."""
    base = _ruta_base_alcance(home)
    base.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(base, modo_carpeta)
    except Exception:
        pass
    return base


def _ruta_suprimir(home: Optional[Union[str, Path]] = None) -> Path:
    base = asegurar_almacen(home)
    return base / "suprimir.json"


def _ruta_registro(home: Optional[Union[str, Path]] = None) -> Path:
    base = asegurar_almacen(home)
    return base / "registro.json"


def _aplicar_permisos_archivo(ruta: Path) -> None:
    try:
        os.chmod(ruta, 0o600)
    except Exception:
        pass


def _leer_json_seguro(ruta: Path) -> Any:
    if not ruta.exists():
        return None
    try:
        with ruta.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _escribir_json_seguro(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    contenido = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    with ruta.open("w", encoding="utf-8") as f:
        f.write(contenido)
    _aplicar_permisos_archivo(ruta)


def _hash_sha256(texto: str) -> str:
    if texto is None:
        texto = ""
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _normalizar_clave_suprimir(clave: str) -> str:
    if clave is None:
        return ""
    c = clave.strip().lower()
    return c


def _tiene_texto_prohibido(valor: Any) -> bool:
    if valor is None:
        return False
    if isinstance(valor, str):
        v = valor.lower()
        for p in PALABRAS_PROHIBIDAS:
            if p in v:
                return True
        return False
    if isinstance(valor, (list, tuple, set)):
        for item in valor:
            if _tiene_texto_prohibido(item):
                return True
        return False
    if isinstance(valor, dict):
        for k, v in valor.items():
            if _tiene_texto_prohibido(k):
                return True
            if _tiene_texto_prohibido(v):
                return True
        return False
    return False


def _es_url_https(url: str) -> bool:
    if not isinstance(url, str):
        return False
    u = url.strip()
    return u.startswith("https://")


def validar_objetivo(obj: Any) -> Dict[str, Any]:
    """Valida un objetivo según R1, R5, R8."""
    errores: List[str] = []
    if not isinstance(obj, dict):
        return {"ok": False, "errores": ["objetivo debe ser un diccionario"]}

    # Campos prohibidos explícitos
    for cp in CAMPOS_PROHIBIDOS_OBJETIVO:
        if cp in obj:
            errores.append(f"campo_prohibido:{cp}")
    if _tiene_texto_prohibido(obj):
        errores.append("texto_prohibido")

    oid = obj.get("id")
    if not isinstance(oid, str) or not oid.startswith("obj-"):
        errores.append("id_opaco_requerido")

    nombre_publico = obj.get("nombre_publico")
    if not isinstance(nombre_publico, str) or not nombre_publico.strip():
        errores.append("nombre_publico_requerido")

    tipo = obj.get("tipo")
    if tipo not in TIPOS_OBJETIVO:
        errores.append("tipo_invalido")

    categoria = obj.get("categoria")
    if categoria not in CATEGORIAS_OBJETIVO:
        errores.append("categoria_invalida")

    nivel = obj.get("nivel")
    if nivel is None:
        nivel = "alto"
        obj["nivel"] = "alto"
    if nivel not in NIVELES_OBJETIVO:
        errores.append("nivel_invalido")

    afinidad = obj.get("afinidad")
    if afinidad is None:
        pass
    else:
        if not isinstance(afinidad, int) or isinstance(afinidad, bool):
            errores.append("afinidad_invalida")
        elif afinidad < 0 or afinidad > 300:
            errores.append("afinidad_fuera_rango")

    urls_oficiales = obj.get("urls_oficiales")
    if urls_oficiales is None:
        urls_oficiales = []
        obj["urls_oficiales"] = []
    if not isinstance(urls_oficiales, list):
        errores.append("urls_oficiales_debe_ser_lista")
    else:
        for u in urls_oficiales:
            if not _es_url_https(u):
                errores.append("url_debe_ser_https")
                break

    canal_contacto = obj.get("canal_contacto")
    if canal_contacto is None:
        canal_contacto = {}
        obj["canal_contacto"] = {}
    if not isinstance(canal_contacto, dict):
        errores.append("canal_contacto_invalido")
    else:
        medio = canal_contacto.get("medio")
        valor = canal_contacto.get("valor")
        fuente_url = canal_contacto.get("fuente_url")
        if medio is not None and medio not in MEDIOS_CANAL:
            errores.append("canal_contacto_medio_invalido")
        if valor is not None and isinstance(valor, str):
            # Jamás dirección deducida por patrón ni dirección sin fuente_url pública
            if any(ch.isdigit() for ch in valor) and "@" not in valor and "http" not in valor:
                # heurística básica: si parece teléfono/dirección numérica sin contexto
                pass
        if fuente_url is None or not isinstance(fuente_url, str) or not _es_url_https(fuente_url):
            # Requiere fuente_url pública https
            errores.append("canal_contacto_sin_fuente_url_publica")
        # Si hay valor que parezca dirección sin @ y sin http pero con números largos
        if isinstance(valor, str) and "@" not in valor and not valor.strip().startswith("http"):
            # rechaza direcciones deducidas por patrón: exigir fuente_url
            if fuente_url is None or not _es_url_https(fuente_url):
                errores.append("direccion_sin_fuente_url_publica")

    estado = obj.get("estado")
    if estado is None:
        obj["estado"] = "nuevo"

    fechas = obj.get("fechas")
    if fechas is None:
        obj["fechas"] = {}

    if errores:
        return {"ok": False, "errores": errores}
    return {"ok": True, "errores": []}


def suprimir(
    identificador: Union[str, Dict[str, str]],
    home: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Guarda solo el hash SHA-256 de (correo | dominio+nombre)."""
    ruta = _ruta_suprimir(home)
    data = _leer_json_seguro(ruta) or {"hashes": []}
    if not isinstance(data, dict):
        data = {"hashes": []}
    if "hashes" not in data or not isinstance(data["hashes"], list):
        data["hashes"] = []

    clave = ""
    if isinstance(identificador, str):
        clave = identificador
    elif isinstance(identificador, dict):
        if "correo" in identificador and identificador.get("correo"):
            clave = str(identificador.get("correo"))
        elif "dominio" in identificador and "nombre" in identificador:
            clave = f"{identificador.get('dominio')}|{identificador.get('nombre')}"
        elif "dominio" in identificador and identificador.get("dominio"):
            clave = str(identificador.get("dominio"))
        elif "nombre" in identificador and identificador.get("nombre"):
            clave = str(identificador.get("nombre"))
    else:
        clave = str(identificador)

    clave_norm = _normalizar_clave_suprimir(clave)
    h = _hash_sha256(clave_norm)
    if h not in data["hashes"]:
        data["hashes"].append(h)
    _escribir_json_seguro(ruta, data)
    return {"ok": True, "hash": h}


def _esta_suprimido(obj: Dict[str, Any], hashes: List[str]) -> bool:
    candidatos = []
    cc = obj.get("canal_contacto") or {}
    if isinstance(cc, dict):
        v = cc.get("valor")
        if isinstance(v, str):
            candidatos.append(v)
    # también por nombre público
    np = obj.get("nombre_publico")
    if isinstance(np, str):
        candidatos.append(np)
    for c in candidatos:
        cn = _normalizar_clave_suprimir(c)
        if _hash_sha256(cn) in hashes:
            return True
    return False


def _contar_envios_hoy(registro: Dict[str, Any], ahora: datetime) -> int:
    envios = registro.get("envios") or []
    if not isinstance(envios, list):
        return 0
    hoy = ahora.date()
    cnt = 0
    for e in envios:
        if not isinstance(e, dict):
            continue
        ts = e.get("timestamp")
        try:
            if isinstance(ts, (int, float)):
                dt = datetime.fromtimestamp(ts)
            elif isinstance(ts, str):
                # intentar iso
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    continue
            else:
                continue
            if dt.date() == hoy:
                cnt += 1
        except Exception:
            continue
    return cnt


def puede_contactar(
    obj: Any,
    registro: Any = None,
    ahora: Any = None,
    home: Optional[Union[str, Path]] = None,
    tope_diario: int = TOPE_DIARIO_DEFECTO,
    reloj=None,
) -> Dict[str, Any]:
    """Evalúa si se puede contactar según reglas."""
    if obj is None or not isinstance(obj, dict):
        return {"puede": False, "razon": "objeto_invalido"}

    # Reloj inyectable
    if ahora is None and reloj is not None:
        try:
            ahora = reloj()
        except Exception:
            ahora = None
    if ahora is None:
        ahora = datetime.now()
    if isinstance(ahora, (int, float)):
        ahora_dt = datetime.fromtimestamp(ahora)
    elif isinstance(ahora, datetime):
        ahora_dt = ahora
    else:
        try:
            ahora_dt = datetime.fromisoformat(str(ahora))
        except Exception:
            ahora_dt = datetime.now()

    if registro is None:
        ruta_reg = _ruta_registro(home)
        registro = _leer_json_seguro(ruta_reg) or {}
    if not isinstance(registro, dict):
        registro = {}

    ruta_sup = _ruta_suprimir(home)
    sup_data = _leer_json_seguro(ruta_sup) or {"hashes": []}
    hashes = sup_data.get("hashes") or []
    if not isinstance(hashes, list):
        hashes = []

    # Suprimido
    if _esta_suprimido(obj, hashes):
        return {"puede": False, "razon": "suprimido"}

    # Validación básica
    val = validar_objetivo(obj)
    if not val.get("ok"):
        return {"puede": False, "razon": "objetivo_invalido", "errores": val.get("errores")}

    nivel = obj.get("nivel") or "alto"
    if nivel == "alto":
        # alto perfil → nunca automático
        return {"puede": False, "razon": "alto_perfil_nunca_automatico"}

    oid = obj.get("id")

    # Pausas
    pausas = registro.get("pausas") or {}
    if isinstance(pausas, dict) and oid in pausas:
        p = pausas[oid]
        if isinstance(p, dict):
            hasta = p.get("hasta")
            motivo = p.get("motivo")
            try:
                if isinstance(hasta, (int, float)):
                    hasta_dt = datetime.fromtimestamp(hasta)
                elif isinstance(hasta, str):
                    hasta_dt = datetime.fromisoformat(hasta.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    hasta_dt = None
                if hasta_dt and ahora_dt < hasta_dt:
                    return {"puede": False, "razon": "en_pausa", "motivo": motivo}
            except Exception:
                pass

    # Historial de contactos
    contactos = registro.get("contactos") or {}
    if not isinstance(contactos, dict):
        contactos = {}
    hist = contactos.get(oid) or []
    if not isinstance(hist, list):
        hist = []

    # Contar mensajes enviados
    mensajes_enviados = 0
    ultimo_envio = None
    for hitem in hist:
        if not isinstance(hitem, dict):
            continue
        if hitem.get("tipo") == "mensaje":
            mensajes_enviados += 1
            ts = hitem.get("timestamp")
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.fromtimestamp(ts)
                elif isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt = None
                if dt and (ultimo_envio is None or dt > ultimo_envio):
                    ultimo_envio = dt
            except Exception:
                pass
        if hitem.get("tipo") == "rechazo_alex":
            # 90 días de pausa tras un rechazo de Alex
            ts = hitem.get("timestamp")
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.fromtimestamp(ts)
                elif isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt = None
                if dt and ahora_dt < dt + timedelta(days=PAUSA_RECHAZO_ALEX_DIAS):
                    return {"puede": False, "razon": "pausa_rechazo_alex"}
            except Exception:
                pass
        if hitem.get("tipo") == "no_destinatario":
            # 180 tras un «no» del destinatario
            ts = hitem.get("timestamp")
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.fromtimestamp(ts)
                elif isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt = None
                if dt and ahora_dt < dt + timedelta(days=PAUSA_NO_DESTINATARIO_DIAS):
                    return {"puede": False, "razon": "pausa_no_destinatario"}
            except Exception:
                pass

    # Un mensaje y un recordatorio a los 14 días como máximo
    if mensajes_enviados >= MENSAJES_MAX_POR_CICLO:
        # Permitir recordatorio solo si pasó >= 14 días desde último envío
        if ultimo_envio is None:
            return {"puede": False, "razon": "sin_recordatorio_sin_ultimo_envio"}
        if ahora_dt < ultimo_envio + timedelta(days=RECORDATORIO_MAX_DIAS):
            return {"puede": False, "razon": "recordatorio_no_disponible_aun"}
        # ya tendría recordatorio? contar recordatorios
        recordatorios = sum(1 for hitem in hist if isinstance(hitem, dict) and hitem.get("tipo") == "recordatorio")
        if recordatorios >= 1:
            return {"puede": False, "razon": "recordatorio_maximo_alcanzado"}
    elif mensajes_enviados == 0:
        pass
    else:
        if ultimo_envio is None or ahora_dt < ultimo_envio + timedelta(days=RECORDATORIO_MAX_DIAS):
            recordatorios = sum(1 for hitem in hist if isinstance(hitem, dict) and hitem.get("tipo") == "recordatorio")
            if recordatorios >= 1:
                return {"puede": False, "razon": "recordatorio_maximo_alcanzado"}

    # Tope diario configurable
    tope = tope_diario if isinstance(tope_diario, int) and tope_diario >= 0 else TOPE_DIARIO_DEFECTO
    envios_hoy = _contar_envios_hoy(registro, ahora_dt)
    if envios_hoy >= tope:
        return {"puede": False, "razon": "tope_diario_alcanzado"}

    return {"puede": True, "razon": "permitido"}


def crear_objetivo_ejemplo(
    oid: str = "obj-ejemplo-001",
    nombre_publico: str = "Ejemplo",
    tipo: str = "proyecto",
    categoria: str = "proyecto-afin",
    nivel: str = "medio",
    afinidad: int = 100,
    urls_oficiales: Optional[List[str]] = None,
    canal_contacto: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Crea un objetivo con estructura válida."""
    if urls_oficiales is None:
        urls_oficiales = ["https://ejemplo.org"]
    if canal_contacto is None:
        canal_contacto = {
            "medio": "formulario",
            "valor": "contacto",
            "fuente_url": "https://ejemplo.org/contacto",
        }
    obj = {
        "id": oid,
        "nombre_publico": nombre_publico,
        "tipo": tipo,
        "categoria": categoria,
        "nivel": nivel,
        "afinidad": afinidad,
        "urls_oficiales": urls_oficiales,
        "canal_contacto": canal_contacto,
        "estado": "nuevo",
        "fechas": {},
    }
    return obj
