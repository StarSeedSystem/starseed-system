# Funciones auxiliares para produccion_medios (puramente para reducir líneas del archivo principal).
from __future__ import annotations


def web_publicar(lote, ejecutor, seco):
    sha = lote.get("sha")
    if seco:
        return ("web: haría push %s (seco)" % sha, True)
    cmd = ["git", "push", "origin", "main"]
    try:
        r = ejecutor(cmd, capture_output=True, text=True, timeout=60)
        return ("web: push %s (%s)" % ("ok" if r.returncode == 0 else "fallo", r.stdout[-120:] or r.stderr[-120:] or ""), r.returncode == 0)
    except Exception as exc:
        return ("web: error (%s)" % exc, False)


def web_confirmar(lote):
    sha = lote.get("sha")
    if not sha:
        return False, "web: sin sha"
    return True, "web: sha %s confirmado (patrón)" % sha


def web_revertir(lote, ejecutor):
    sha = lote.get("sha")
    if not sha:
        return "web: sin sha", False
    rev_ok = False
    push_ok = False
    try:
        rev = ejecutor(["git", "revert", "--no-edit", sha], capture_output=True, text=True, timeout=120)
        rev_ok = rev.returncode == 0
        push = ejecutor(["git", "push", "origin", "main"], capture_output=True, text=True, timeout=120)
        push_ok = push.returncode == 0
    except Exception as exc:
        return "web: error (%s)" % exc, False
    detalle = "revert %s" % sha
    if __import__("os").environ.get("VERCEL_TOKEN"):
        detalle += "; VERCEL_TOKEN presente"
    return "web: %s (%s)" % (detalle, "ok" if rev_ok and push_ok else "fallo"), rev_ok and push_ok
