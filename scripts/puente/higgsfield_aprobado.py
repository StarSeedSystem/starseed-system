#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higgsfield (HGF1113A): propuestas, aprobación humana, presupuesto y gasto.
Núcleo puro + E/S inyectable; `ejecutar()` es lo único que toca disco o lanza el CLI.
Con `lanzar`, `hay_cli`, `hay_sesion` y datos falsos se prueba sin red ni créditos.
Nunca reintenta: una llamada y se registra el gasto real en gasto.jsonl.
"""
from __future__ import annotations
import hashlib, json, os, shlex, shutil, subprocess
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(RAIZ, "starseed_memory_root", "produccion", "higgsfield")
UMBRAL_AVISO = 0.8

def _argv(comando):
    return shlex.split(comando) if isinstance(comando, str) else [str(x) for x in (comando or [])]

def hash_comando(comando):
    """sha256 del argv normalizado: cambiar un argumento cambia el hash."""
    crudo = json.dumps(_argv(comando), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(crudo.encode("utf-8")).hexdigest()

def aprobar(propuesta, por, ahora=None, aprobada=True, motivo=""):
    """Guarda el sha256 del comando, quién aprueba y cuándo."""
    return {"id": str(propuesta.get("id") or ""), "proyecto": propuesta.get("proyecto"),
            "estado": "aprobada" if aprobada else "rechazada",
            "sha256": hash_comando(propuesta.get("comando")), "por": str(por or "").strip(),
            "cuando": (ahora or datetime.now(timezone.utc)).isoformat(), "motivo": str(motivo or "")}

def rechazar(propuesta, por, ahora=None, motivo=""):
    return aprobar(propuesta, por, ahora=ahora, aprobada=False, motivo=motivo)

def presupuesto(proyecto, gastos, limite, estimado=0.0):
    """(pasa, motivo, aviso): aviso al 80 %, parada al 100 % sin pasarse del límite."""
    if limite is None: return True, "", ""
    usado = round(sum(float(g.get("creditos") or 0) for g in gastos or [] if str(g.get("proyecto")) == str(proyecto)), 4)
    tope = float(limite)
    if usado >= tope or usado + max(0.0, float(estimado or 0)) > tope:
        return False, "presupuesto de %s agotado: %.2f de %.2f créditos" % (proyecto, usado, tope), ""
    if usado >= tope * UMBRAL_AVISO:
        return True, "", "presupuesto de %s al %.0f %% (%.2f de %.2f créditos)" % (proyecto, 100.0 * usado / tope, usado, tope)
    return True, "", ""

def puede_ejecutar(propuesta, aprobacion, gastos, limite):
    """Solo con aprobación completa, hash intacto y presupuesto disponible."""
    if not isinstance(aprobacion, dict) or aprobacion.get("estado") != "aprobada": return False, "sin aprobación de una persona", ""
    if not aprobacion.get("por") or not aprobacion.get("cuando"): return False, "la aprobación no dice quién ni cuándo", ""
    if aprobacion.get("proyecto") != propuesta.get("proyecto"): return False, "el proyecto cambió desde la aprobación", ""
    if aprobacion.get("sha256") != hash_comando(propuesta.get("comando")): return False, "el comando cambió desde la aprobación (sha256 no coincide)", ""
    return presupuesto(propuesta.get("proyecto"), gastos, limite, propuesta.get("creditos_estimados"))

def _leer(base, nombre, defecto):
    try:
        with open(os.path.join(base, nombre), encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return defecto

def _gastos(base):
    try:
        with open(os.path.join(base, "gasto.jsonl"), encoding="utf-8") as f: return [json.loads(l) for l in f if l.strip()]
    except (OSError, ValueError): return []

def _limite(limites, proyecto):
    valor = (limites.get("proyectos") or limites).get(str(proyecto)) if isinstance(limites, dict) else None
    if isinstance(valor, dict): valor = valor.get("creditos")
    if valor is None: return None
    try: return float(valor)
    except (TypeError, ValueError): return None

def guardar_aprobacion(aprobacion, base=DIR):
    os.makedirs(base, exist_ok=True)
    datos = _leer(base, "aprobaciones.json", {})
    datos[str(aprobacion["id"])] = aprobacion
    with open(os.path.join(base, "aprobaciones.json"), "w", encoding="utf-8") as f: json.dump(datos, f, ensure_ascii=False, indent=1)

def anotar_gasto(gasto, base=DIR):
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, "gasto.jsonl"), "a", encoding="utf-8") as f: f.write(json.dumps(gasto, ensure_ascii=False) + "\n")

def _creditos(resultado, propuesta):
    try:
        dato = json.loads(resultado.get("stdout") or "{}")
        for clave in ("credits", "creditos"):
            if isinstance(dato, dict) and clave in dato: return float(dato[clave])
    except (TypeError, ValueError): pass
    try: return float(propuesta.get("creditos_estimados") or 0)
    except (TypeError, ValueError): return 0.0

def _lanzar(argv):
    proceso = subprocess.run(argv, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    return {"codigo": proceso.returncode, "stdout": proceso.stdout, "stderr": proceso.stderr}

def ejecutar(pid, *, propuestas=None, aprobaciones=None, gastos=None, limites=None,
             lanzar=None, hay_cli=None, hay_sesion=None, anotar=None, ahora=None, base=DIR):
    """Corre el comando aprobado UNA vez; devuelve motivo claro si no puede, sin lanzar."""
    if propuestas is None: propuestas = _leer(base, "propuestas.json", [])
    if isinstance(propuestas, dict): propuestas = propuestas.get("propuestas") or []
    propuesta = next((p for p in propuestas if str(p.get("id")) == str(pid)), None)
    if propuesta is None: return {"ok": False, "motivo": "no existe la propuesta %s" % pid, "reintentado": False}
    if aprobaciones is None: aprobaciones = _leer(base, "aprobaciones.json", {})
    gastos = _gastos(base) if gastos is None else gastos
    limites = _leer(base, "presupuestos.json", {}) if limites is None else limites
    ok, motivo, aviso = puede_ejecutar(propuesta, (aprobaciones or {}).get(str(pid)), gastos, _limite(limites, propuesta.get("proyecto")))
    if not ok: return {"ok": False, "motivo": motivo, "reintentado": False}
    if not (hay_cli or shutil.which)("higgsfield"):
        return {"ok": False, "motivo": "el CLI higgsfield no está instalado", "aviso": aviso, "reintentado": False}
    sesion = hay_sesion or (lambda: bool(os.environ.get("HIGGSFIELD_API_KEY") or (os.environ.get("HF_API_KEY_ID") and os.environ.get("HF_API_KEY_SECRET"))))
    if not sesion():
        return {"ok": False, "motivo": "no hay sesión de Higgsfield: falta HIGGSFIELD_API_KEY", "aviso": aviso, "reintentado": False}
    try:
        resultado = (lanzar or _lanzar)(_argv(propuesta.get("comando")))
    except (OSError, subprocess.SubprocessError) as error:
        return {"ok": False, "motivo": "no se pudo lanzar el CLI: %s" % error, "aviso": aviso, "reintentado": False}
    creditos = _creditos(resultado, propuesta)
    gasto = {"id": str(pid), "proyecto": propuesta.get("proyecto"), "pieza": propuesta.get("pieza"),
             "creditos": creditos, "cuando": (ahora or datetime.now(timezone.utc)).isoformat(), "codigo": resultado.get("codigo")}
    (anotar or (lambda g: anotar_gasto(g, base)))(gasto)
    codigo = resultado.get("codigo")
    return {"ok": codigo == 0, "codigo": codigo, "creditos": creditos, "aviso": aviso,
            "motivo": "" if codigo == 0 else "el CLI falló (código %s)" % codigo, "reintentado": False}
