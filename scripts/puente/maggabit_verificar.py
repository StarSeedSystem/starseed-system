# -*- coding: utf-8 -*-
"""Verificación y manifiesto del Maggabit (MAG1117).

Las tres decisiones son PURAS: deciden sin tocar nada. La E/S es fina e
inyectable (reloj, subprocess, lectura); todo subprocess lleva timeout y, sin
disco, no se lanza nada (principio 0). Nunca se borra en el origen ni se
guardan credenciales.
"""
import json, re, shlex, subprocess, sys, time
from typing import Any, Callable, Dict, List, Optional

from maggabit_ritmo import RITMOS_S

RUTA_MANIFIESTO = "/Volumes/Maggabit/MetaGenesis/estado/manifiesto.json"
RUTA_ESTADO = "~/.starseed/maggabit/estado.json"
SEMANAL_S, MENSUAL_S = 7 * 86400, 30 * 86400
_URL_CON_CLAVE = re.compile(r"(?i)(https?://)([^/@\s]+):([^/@\s]+)@")
_URL_USUARIO = re.compile(r"(?i)(https?://)[^/@\s:]+@")
_PARAMETRO = re.compile(r"(?i)\b(?:api[_-])?(token|clave|key|password|secret)=[^&\s]+")
_PORTEADOR = re.compile(r"(?i)bearer\s+[\w.\-]+")

def limpiar(texto: Any) -> Optional[str]:
    """Quita credenciales de un error antes de guardarlo o avisar."""
    if texto is None:
        return None
    limpio = _URL_CON_CLAVE.sub(r"\1***:***@", str(texto))
    limpio = _URL_USUARIO.sub(r"\1***@", limpio)
    limpio = _PARAMETRO.sub(r"\1=***", limpio)
    return _PORTEADOR.sub("Bearer ***", limpio)[:300]

def _num(valor: Any) -> Optional[float]:
    return (None if isinstance(valor, bool) or not isinstance(valor, (int, float))
            else float(valor))

def _solo_maggabit(datos: Dict[str, Any]) -> bool:
    otra = datos.get("otra_casa", datos.get("casas"))
    if isinstance(otra, bool):
        return not otra
    return len(otra) == 0 if isinstance(otra, (list, tuple)) else True

def manifiesto(medio: Dict[str, Any], fuentes: Dict[str, Dict[str, Any]],
               ahora: float) -> Dict[str, Any]:
    """Resume cada fuente sin tocar disco: último bueno, retraso y errores."""
    estado = medio.get("estado", "ausente") if isinstance(medio, dict) else "ausente"
    resumen: Dict[str, Dict[str, Any]] = {}
    solo: List[str] = []
    fallos: List[str] = []
    for nombre, entrada in (fuentes or {}).items():
        datos = entrada if isinstance(entrada, dict) else {}
        ritmo = _num(datos.get("ritmo_s")) or RITMOS_S.get(nombre, 86400)
        bueno = _num(datos.get("ultimo_bueno"))
        error = limpiar(datos.get("ultimo_error"))
        edad = None if bueno is None else max(0.0, ahora - bueno)
        resumen[nombre] = {
            "ritmo_s": ritmo, "ultimo_bueno": bueno,
            "edad_s": None if edad is None else round(edad, 1),
            "retraso_s": None if edad is None else round(max(0.0, edad - ritmo), 1),
            "tamano_bytes": _num(datos.get("tamano_bytes")),
            "archivos": _num(datos.get("archivos")), "ultimo_error": error,
        }
        if _solo_maggabit(datos):
            solo.append(nombre)
        if error or bueno is None:
            fallos.append(nombre)
    return {"generado": ahora, "medio": estado,
            "rutas": {"manifiesto": RUTA_MANIFIESTO, "estado": RUTA_ESTADO},
            "fuentes": resumen, "solo_en_maggabit": sorted(solo), "fallos": sorted(fallos)}

def plan_verificacion(ahora: float, ultimas: Dict[str, Any]) -> List[str]:
    """Pasos diarios, semanales y mensuales de verificación, sin ejecutarlos."""
    ultimas = ultimas if isinstance(ultimas, dict) else {}
    medio = ultimas.get("medio")
    if isinstance(medio, dict) and medio.get("estado") not in (None, "listo"):
        return []
    paquete = ultimas.get("paquete")
    if not isinstance(paquete, str) or not paquete.strip():
        return []
    planes = ["git bundle verify %s" % shlex.quote(paquete)]
    if ahora - (_num(ultimas.get("fsck")) or 0.0) >= SEMANAL_S:
        for espejo in ultimas.get("espejos") or []:
            planes.append("git -C %s fsck --connectivity-only" % shlex.quote(str(espejo)))
    if ahora - (_num(ultimas.get("restaurar")) or 0.0) >= MENSUAL_S:
        temporal = str(ultimas.get("temporal") or "/tmp/maggabit-restauracion")
        rama = str(ultimas.get("rama") or "main")
        planes.append("git clone %s %s" % (shlex.quote(paquete), shlex.quote(temporal)))
        planes.append("git -C %s rev-parse %s" % (shlex.quote(temporal), shlex.quote(rama)))
        esperado = ultimas.get("commit")
        if isinstance(esperado, str) and esperado:
            planes.append("comparar el commit %s de %s con el clon en %s"
                          % (esperado, rama, temporal))
    return planes

def avisos(manifiesto_antes: Dict[str, Any],
           manifiesto_ahora: Dict[str, Any]) -> List[str]:
    """Solo anuncia fallos que no estaban ya en el manifiesto anterior."""
    antes = manifiesto_antes.get("fuentes", {}) if isinstance(manifiesto_antes, dict) else {}
    actual = manifiesto_ahora.get("fuentes", {}) if isinstance(manifiesto_ahora, dict) else {}
    salida: List[str] = []
    for nombre, entrada in sorted(actual.items()):
        datos = entrada if isinstance(entrada, dict) else {}
        if not (datos.get("ultimo_error") or datos.get("ultimo_bueno") is None):
            continue
        previo = antes.get(nombre)
        if isinstance(previo, dict) and (previo.get("ultimo_error")
                                         or previo.get("ultimo_bueno") is None):
            continue
        motivo = datos.get("ultimo_error") or "sin respaldo bueno"
        salida.append("Fallo nuevo en %s: %s" % (nombre, limpiar(motivo)))
    return salida

def verificar(medio: Dict[str, Any], ultimas: Dict[str, Any],
              ahora_fn: Callable[[], float] = time.time,
              correr: Callable[..., Any] = subprocess.run,
              tope_s: float = 10) -> List[Dict[str, str]]:
    """Ejecuta el plan con timeout; con disco ausente no lanza nada."""
    if not isinstance(medio, dict) or medio.get("estado") != "listo":
        return []
    datos = dict(ultimas or {})
    datos["medio"] = medio
    resultados: List[Dict[str, str]] = []
    for paso in plan_verificacion(ahora_fn(), datos):
        if not paso.startswith("git "):
            resultados.append({"paso": paso, "estado": "sin-ejecutar"})
            continue
        try:
            respuesta = correr(shlex.split(paso), capture_output=True, timeout=tope_s)
            estado = "correcto" if getattr(respuesta, "returncode", 1) == 0 else "fallo"
        except (subprocess.TimeoutExpired, OSError):
            estado = "sin-respuesta"
        resultados.append({"paso": paso, "estado": estado})
    return resultados

def main(argv: Optional[List[str]] = None, medio_fn: Optional[Callable[[], Dict[str, Any]]] = None,
         fuentes_fn: Optional[Callable[[], Dict[str, Dict[str, Any]]]] = None,
         ahora_fn: Callable[[], float] = time.time,
         salida: Callable[[str], Any] = print) -> int:
    """Orden `manifiesto`: imprime el JSON calculado con lo inyectado."""
    orden = list(sys.argv[1:] if argv is None else argv) or ["manifiesto"]
    if orden[0] != "manifiesto":
        sys.stderr.write("Uso: maggabit_verificar.py manifiesto\n")
        return 2
    medio_fn = medio_fn or (lambda: {"estado": "ausente"})
    fuentes_fn = fuentes_fn or (lambda: {})
    salida(json.dumps(manifiesto(medio_fn(), fuentes_fn(), ahora_fn()),
                      ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
