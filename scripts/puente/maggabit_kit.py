# -*- coding: utf-8 -*-
"""Kit sin internet de Astraura (MAG1117): capas verificadas por SHA en el disco.

La decisión es pura (`plan`, `indice`, `orden_copiar`): recibe datos y no toca nada.
La E/S es fina e inyectable (reloj, subprocess, lectura de disco): con el disco
ausente no falla ni espera; todo subprocess lleva timeout y un volumen que no
responde se anota «sin-respuesta». Nunca se borra en el origen y jamás se imprimen
claves, tokens ni URLs con credenciales. Pruebas: test_maggabit_kit.py.
"""
from __future__ import annotations

import hashlib, json, os, subprocess, time
from typing import Any, Callable, Dict, List, Optional

RAIZ = "/Volumes/Maggabit"
CARPETA = "RAIZ/MetaGenesis/sin-internet"
INDICE = CARPETA + "/indice.json"
INSTALADORES = "../instaladores/"
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "..", "..", "config", "capas-astraura.json")
PAPELES = ("reflejo", "memoria", "palabra", "voz", "razon", "profunda")
TROZO = 1024 * 1024
SERVICIO: Dict[str, str] = {
    "reflejo": "Responde reflejo con Needle sin depender de la red.",
    "memoria": "Guarda recuerdos y búsquedas locales del cerebro.",
    "palabra": "Genera y entiende lenguaje en el propio aparato.",
    "voz": "Convierte voz en texto y texto en voz.",
    "razon": "Decide y razona sin depender de la nube.",
    "profunda": "Razonamiento largo cuando sobran recursos.",
}

__all__ = ["RAIZ", "CARPETA", "INDICE", "INSTALADORES", "CONFIG", "PAPELES",
           "plan", "comprobar", "indice", "cargar_capas", "orden_copiar", "ejecutar"]


def _texto(valor: Any) -> str:
    return valor.strip() if isinstance(valor, str) else ""


def _num(valor: Any) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return 0.0
    return float(valor)


def _sha(capa: Dict[str, Any]) -> str:
    valor = _texto(capa.get("sha256")).lower()
    if len(valor) != 64 or any(c not in "0123456789abcdef" for c in valor):
        return ""
    return valor


def _entrada(capa: Dict[str, Any], sha: str) -> Dict[str, Any]:
    papel = _texto(capa.get("capa")).lower()
    return {"archivo": _texto(capa.get("archivo")),
            "sistema": _texto(capa.get("id")) or _texto(capa.get("sistema")),
            "version": _texto(capa.get("version")), "sha256": sha,
            "bytes": int(_num(capa.get("tamano_bytes"))),
            "para_que_sirve": _texto(capa.get("para_que_sirve"))
            or SERVICIO.get(papel, "Capa de Astraura")}


def _prioridad(capa: Dict[str, Any], pos: int) -> tuple:
    papel = _texto(capa.get("capa")).lower().replace("ó", "o")
    return (PAPELES.index(papel) if papel in PAPELES else len(PAPELES), pos)


def plan(capas: List[Dict[str, Any]], presentes: Dict[str, str],
         tope_gb: float) -> Dict[str, List[Dict[str, Any]]]:
    """Qué capas bajar, cuáles ya están y cuáles quedan fuera.

    `presentes` da el sha256 visto en el kit por id de capa; si coincide, la capa
    ya está. Solo cuentan contra el tope las capas que hay que bajar. Las de SHA
    no publicado nunca entran y se anotan con su motivo.
    """
    if isinstance(capas, dict):
        capas = capas.get("capas", [])
    presentes = presentes or {}
    tope = max(0.0, _num(tope_gb))
    limite = tope * 1024 ** 3
    candidatos, fuera = [], []
    for pos, capa in enumerate(capas or []):
        if not isinstance(capa, dict):
            continue
        sha = _sha(capa)
        if not sha:
            entrada = _entrada(capa, _texto(capa.get("sha256")).lower())
            entrada["motivo"] = "sin SHA publicado: no se usa"
            fuera.append(entrada)
            continue
        candidatos.append((_prioridad(capa, pos), _entrada(capa, sha)))
    ya, bajar = [], []
    ocupado = 0
    for _, entrada in sorted(candidatos, key=lambda par: par[0]):
        if _texto(presentes.get(entrada["sistema"])).lower() == entrada["sha256"]:
            ya.append(entrada)
        elif ocupado + entrada["bytes"] > limite:
            fuera.append({**entrada, "motivo": "fuera del tope de %.2f GB" % tope})
        else:
            ocupado += entrada["bytes"]
            bajar.append(entrada)
    return {"bajar": bajar, "ya": ya, "fuera": fuera}


def comprobar(ruta: str, sha: str, abrir: Optional[Callable[..., Any]] = None,
              trozo: int = TROZO) -> bool:
    """Comprueba el sha256 de un archivo leyéndolo por trozos.

    Un archivo ausente o ilegible no falla: simplemente no está comprobado.
    """
    esperado = _texto(sha).lower()
    if len(esperado) != 64 or any(c not in "0123456789abcdef" for c in esperado):
        return False
    abrir = abrir or open
    digestedor = hashlib.sha256()
    try:
        with abrir(ruta, "rb") as archivo:
            while True:
                datos = archivo.read(max(1, int(trozo)))
                if not datos:
                    break
                digestedor.update(datos)
    except (OSError, TypeError, ValueError):
        return False
    return digestedor.hexdigest() == esperado


def indice(resultado: Dict[str, List[Dict[str, Any]]],
           instaladores: Optional[List[Dict[str, Any]]] = None,
           ahora: Optional[Callable[[], float]] = None) -> Dict[str, Any]:
    """Índice del kit: seis campos por archivo y hora sellada.

    Los instaladores no se copian al kit: el índice los referencia en
    `../instaladores/` con su nombre de archivo.
    """
    archivos = list(resultado.get("ya", [])) + list(resultado.get("bajar", []))
    for instalador in instaladores or []:
        if not isinstance(instalador, dict):
            continue
        archivos.append({
            "archivo": INSTALADORES + os.path.basename(_texto(instalador.get("archivo"))),
            "sistema": _texto(instalador.get("sistema")),
            "version": _texto(instalador.get("version")),
            "sha256": _texto(instalador.get("sha256")).lower(),
            "bytes": int(_num(instalador.get("bytes"))),
            "para_que_sirve": _texto(instalador.get("para_que_sirve")),
        })
    instante = (ahora or time.time)()
    return {"actualizado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(instante)),
            "archivos": archivos}


def cargar_capas(leer: Optional[Callable[..., Any]] = None) -> List[Dict[str, Any]]:
    """Lee el catálogo de capas con lectura inyectable; ilegible da vacío."""
    leer = leer or open
    try:
        with leer(CONFIG, "r", encoding="utf-8") as archivo:
            datos = json.load(archivo)
    except (OSError, ValueError, TypeError):
        return []
    if isinstance(datos, dict):
        datos = datos.get("capas", [])
    return [c for c in datos if isinstance(c, dict)] if isinstance(datos, list) else []


def orden_copiar(ruta: str, nombre: str) -> List[str]:
    """Copia al kit sin borrar el origen y con tope de espera en la transferencia."""
    destino = CARPETA.replace("RAIZ", RAIZ, 1) + "/" + os.path.basename(nombre)
    return ["rsync", "--timeout=30", "--partial", ruta, destino]


def ejecutar(orden: List[str], correr: Optional[Callable[..., Any]] = None,
             tope_s: float = 10, existe: Optional[Callable[[str], bool]] = None) -> Dict[str, str]:
    """Lanza una orden con timeout; ausente o sin respuesta no cuelga."""
    if not (existe or os.path.exists)(RAIZ):
        return {"estado": "ausente"}
    try:
        resultado = (correr or subprocess.run)(list(orden), capture_output=True,
                                                timeout=tope_s)
    except (subprocess.TimeoutExpired, OSError):
        return {"estado": "sin-respuesta"}
    if getattr(resultado, "returncode", 1) != 0:
        return {"estado": "fallo"}
    return {"estado": "listo"}
