#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Captura de Jev (MGM1110B · fase 0 de memory/orquestacion-economica.md §22).

POR QUÉ EXISTE
--------------
`~/.starseed/experiencias.jsonl` recorta cada entrada a 401 caracteres: sirve para calibrar,
no para REPETIR una decisión. Para medir si un modelo pequeño propio (Needle 3, Laya) podría
tomar las decisiones sí/no de Jev hace falta el prompt completo. Este módulo lo guarda,
en local, sin que ningún director lo note.

QUÉ GUARDA (una línea JSON por llamada a Jev que sí obtuvo respuesta)
--------------------------------------------------------------------
    id · t (UTC) · quien · dominio · tipos · estratos · medio · modelo · estado · preguntas
    (instrucciones y opciones completas) · respuestas · confianza · ms · truncado

Las llamadas servidas desde la caché de 6 h NO se vuelven a guardar: su decisión ya está.

DÓNDE: `~/.starseed/jev-captura/AAAA-MM-DD.jsonl` (directorio 0700, archivos 0600), FUERA del repo.

PRIVACIDAD (regla de Alex)
--------------------------
Estos prompts pueden llevar mensajes privados (el puente de Telegram es el mayor llamador).
La captura se queda en la máquina donde ocurrió la llamada: no se commitea, no se sube, no se
copia a informes, al buzón ni al Mando. Solo salen contadores y métricas (`resumen`).
Antes de escribir se tachan claves y tokens y cada línea se acota a 16 KB (marcando `truncado`).

GARANTÍAS
---------
· Nunca lanza y nunca espera: solo `open(O_APPEND)` + `write`, sin red ni cerrojos. Cualquier
  fallo se traga y se cuenta (`FALLOS`, y una línea en `fallos.log` si hay disco).
· Rotación: 14 días y 200 MB como mucho, lo más viejo primero.
· Interruptor: `STARSEED_JEV_CAPTURA=0` la apaga (por defecto encendida).
· En pruebas (unittest/pytest) no escribe en el directorio real salvo que la prueba fije
  `STARSEED_JEV_CAPTURA_DIR`.

Quitarlo todo: `STARSEED_JEV_CAPTURA=0` y borrar `~/.starseed/jev-captura` y `~/.starseed/jev-sombra`.

    python3 scripts/puente/jev_captura.py resumen [--json]
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timedelta, timezone

BASE = os.path.expanduser("~/.starseed/jev-captura")
SOMBRA_ULTIMO = os.path.expanduser("~/.starseed/jev-sombra/ultimo.json")

#: Tope de cada línea (bytes). Pasado esto se acortan los textos y se marca `truncado`.
MAX_LINEA_B = 16 * 1024
#: Rotación: días que se conservan y tope total (bytes). Lo más viejo se borra primero.
DIAS_MAX = 14
BYTES_MAX = 200 * 1024 * 1024
#: Se revisa la rotación al cambiar de día y, por si un proceso vive mucho, cada tantas escrituras.
ROTAR_CADA = 200
#: Máximo de líneas de `fallos.log` por proceso (el contador en memoria sigue subiendo).
FALLOS_LOG_MAX = 20

#: La meta de la fase 0 (la prueba en sombra no emite veredicto sin esto).
OBJETIVO_LLAMADAS = 1000
#: Estratos que deben estar representados: «tipo:dominio». El dominio lo fija quien llama
#: (`decidir.consultar(dominio=…)`); si no lo fija, vale el nombre de quien pregunta.
ESTRATOS_OBJETIVO = (
    "noul:bloqueadas",
    "noul:aprobacion",
    "noul:produccion",
    "choice:enjambre:escritor",
    "choice:ramas-nube",
)

#: Contador de fallos tragados en ESTE proceso.
FALLOS = 0
_fallos_log = 0
_escrituras = 0
_rotado_dia = None
_ctx = threading.local()

# ── tachado de secretos ──────────────────────────────────────────────────────
_EXTRA = [
    re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{10,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bocid1\.[A-Za-z0-9_.\-]{10,}"),
    re.compile(r"\bglpat-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\b[0-9]{8,10}:[A-Za-z0-9_\-]{30,}"),  # token de bot de Telegram
    re.compile(
        r"(?i)\b(api[_-]?key|apikey|secret|token|password|passwd|authorization|clave)\b"
        r"(\s*[\"']?\s*[:=]\s*[\"']?)([^\s\"',}\]]{6,})"
    ),
]
_CLAVE_SECRETA = re.compile(r"(?i)(api[_-]?key|apikey|secret|token|password|passwd|authorization|bearer)")
_BASE_FALLBACK = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
    re.compile(r"(?i)(?<=bearer )[A-Za-z0-9._\-]{20,}"),
]
_patrones = None


def _cargar_patrones():
    """Los patrones del ayudante del repo (`decidir._SECRETOS`) más los de aquí."""
    global _patrones
    if _patrones is None:
        base = list(_BASE_FALLBACK)
        try:
            import decidir as _d

            base = list(getattr(_d, "_SECRETOS", None) or base)
        except Exception:
            pass
        _patrones = base
    return _patrones


def tachar(texto):
    """El texto sin claves ni tokens reconocibles."""
    t = texto if isinstance(texto, str) else str(texto)
    for p in _cargar_patrones():
        t = p.sub("[REDACTADO]", t)
    for p in _EXTRA:
        if p.groups >= 3:
            t = p.sub(lambda m: m.group(1) + m.group(2) + "[REDACTADO]", t)
        else:
            t = p.sub("[REDACTADO]", t)
    return t


def _limpiar(x, nivel=0):
    """Copia JSON-segura de `x` con los textos tachados (y los valores de claves «secretas» fuera)."""
    if nivel > 12:
        return "[profundo]"
    if isinstance(x, str):
        return tachar(x)
    if isinstance(x, bool) or x is None or isinstance(x, (int, float)):
        return x
    if isinstance(x, dict):
        fuera = {}
        for k, v in x.items():
            k = str(k)[:120]
            if isinstance(v, str) and _CLAVE_SECRETA.search(k):
                fuera[k] = "[REDACTADO]"
            else:
                fuera[k] = _limpiar(v, nivel + 1)
        return fuera
    if isinstance(x, (list, tuple, set)):
        return [_limpiar(v, nivel + 1) for v in list(x)[:500]]
    return tachar(str(x))


def _acotar(x, n):
    """Copia de `x` con cada texto a lo sumo de `n` caracteres."""
    if isinstance(x, str):
        return x if len(x) <= n else x[:n] + "…[truncado]"
    if isinstance(x, dict):
        return {k: _acotar(v, n) for k, v in list(x.items())[:200]}
    if isinstance(x, list):
        return [_acotar(v, n) for v in x[:100]]
    return x


# ── interruptor y rutas ──────────────────────────────────────────────────────
def _en_pruebas():
    argv0 = (sys.argv[0] if sys.argv else "") or ""
    base = os.path.basename(argv0)
    return (
        "PYTEST_CURRENT_TEST" in os.environ
        or "pytest" in argv0
        or "unittest" in argv0
        or base.startswith("test_")
    )


def activa():
    """Encendida salvo `STARSEED_JEV_CAPTURA=0`; y en pruebas solo con directorio propio."""
    if os.environ.get("STARSEED_JEV_CAPTURA", "1").strip().lower() in ("0", "no", "false", "off"):
        return False
    if not os.environ.get("STARSEED_JEV_CAPTURA_DIR") and _en_pruebas():
        return False
    return True


def directorio():
    return os.environ.get("STARSEED_JEV_CAPTURA_DIR") or BASE


# ── contexto por hilo: lo que Jev no sabe (dominio) y el id de la última captura ──
class con_dominio:
    """`with con_dominio("bloqueadas"): jev.decidir(...)` — el dominio de la decisión."""

    def __init__(self, dominio):
        self.dominio = dominio

    def __enter__(self):
        try:
            self._antes = getattr(_ctx, "dominio", None)
            _ctx.dominio = (str(self.dominio)[:60] or None) if self.dominio else None
            _ctx.ultimo = None
        except Exception:
            pass
        return self

    def __exit__(self, *a):
        try:
            _ctx.dominio = self._antes
        except Exception:
            pass
        return False


def ultimo_id():
    """Id de la última captura hecha en este hilo (para enlazarla con su experiencia)."""
    return getattr(_ctx, "ultimo", None)


def enlazar(captura_id, experiencia_id):
    """Línea de enlace captura↔experiencia (para conocer el desenlace real al medir). Nunca lanza."""
    try:
        if not captura_id or not experiencia_id or not activa():
            return False
        _anexar(json.dumps({"enlace": captura_id, "experiencia": experiencia_id}) + "\n", _dia())
        return True
    except Exception:
        _contar_fallo("enlace")
        return False


# ── escritura ────────────────────────────────────────────────────────────────
def _dia(ahora=None):
    return datetime.fromtimestamp(ahora or time.time(), timezone.utc).strftime("%Y-%m-%d")


def _contar_fallo(motivo):
    global FALLOS, _fallos_log
    FALLOS += 1
    try:
        if _fallos_log < FALLOS_LOG_MAX:
            _fallos_log += 1
            fd = os.open(os.path.join(directorio(), "fallos.log"), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, ("%d\t%s\n" % (int(time.time()), str(motivo)[:60])).encode("utf-8"))
            finally:
                os.close(fd)
    except Exception:
        pass


def _anexar(linea, dia):
    d = directorio()
    if not os.path.isdir(d):
        os.makedirs(d, mode=0o700, exist_ok=True)
        try:
            os.chmod(d, 0o700)
        except OSError:
            pass
    fd = os.open(os.path.join(d, dia + ".jsonl"), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        try:
            os.fchmod(fd, 0o600)
        except OSError:
            pass
        datos = linea.encode("utf-8")
        while datos:
            n = os.write(fd, datos)
            datos = datos[n:]
    finally:
        os.close(fd)


def rotar(d=None, hoy=None, dias=DIAS_MAX, bytes_max=BYTES_MAX):
    """Borra lo de más de `dias` y, si aún pasa de `bytes_max`, lo más viejo. Devuelve cuántos borró."""
    d = d or directorio()
    borrados = 0
    try:
        hoy = hoy or datetime.now(timezone.utc).date()
        corte = (hoy - timedelta(days=dias)).strftime("%Y-%m-%d")
        archivos = sorted(f for f in os.listdir(d) if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.jsonl", f))
        for f in list(archivos):
            if f[:10] < corte:
                try:
                    os.remove(os.path.join(d, f))
                    borrados += 1
                    archivos.remove(f)
                except OSError:
                    pass
        tallas = []
        for f in archivos:
            try:
                tallas.append((f, os.path.getsize(os.path.join(d, f))))
            except OSError:
                pass
        total = sum(t for _, t in tallas)
        for f, t in tallas:
            if total <= bytes_max or len(tallas) <= 1:
                break
            try:
                os.remove(os.path.join(d, f))
                borrados += 1
                total -= t
            except OSError:
                pass
    except Exception:
        pass
    return borrados


def _tipos_de(preguntas):
    return [str((q or {}).get("type")) for q in (preguntas or {}).values() if isinstance(q, dict)]


def _confianza(respuestas, preguntas):
    cs = []
    for n in (preguntas or {}):
        a = (respuestas or {}).get(n)
        if isinstance(a, dict) and a.get("confidence") is not None:
            try:
                cs.append(float(a["confidence"]))
            except (TypeError, ValueError):
                pass
    return round(min(cs), 4) if cs else None


def construir(estado, preguntas, quien, medio, modelo, respuestas, ms, dominio=None, ahora=None):
    """El dict de la línea (ya tachado y acotado). Puro: no toca el disco."""
    ahora = ahora or time.time()
    dominio = dominio or getattr(_ctx, "dominio", None)
    tipos = _tipos_de(preguntas)
    dom = dominio or quien or "desconocido"
    estratos = sorted({"%s:%s" % (t, dom) for t in tipos})
    nombres = list((preguntas or {}).keys())
    ident = hashlib.sha256(
        ("%s|%s|%s" % (time.time_ns(), quien, json.dumps(preguntas, sort_keys=True, default=str)[:2000])).encode("utf-8", "replace")
    ).hexdigest()[:16]
    e = {
        "v": 1,
        "id": ident,
        "t": datetime.fromtimestamp(ahora, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "quien": str(quien or "desconocido")[:40],
        "dominio": dominio,
        "tipos": tipos,
        "estratos": estratos,
        "medio": medio,
        "modelo": None if modelo is None else str(modelo)[:80],
        "estado": _limpiar(estado),
        "preguntas": _limpiar(preguntas),
        "respuestas": _limpiar({n: (respuestas or {}).get(n) for n in nombres if n in (respuestas or {})}),
        "confianza": _confianza(respuestas, preguntas),
        "ms": None if ms is None else round(float(ms), 1),
        "truncado": False,
    }
    linea = json.dumps(e, ensure_ascii=False)
    if len(linea.encode("utf-8")) > MAX_LINEA_B:
        e["truncado"] = True
        e["bytes_originales"] = len(linea.encode("utf-8"))
        for n in (4000, 2000, 1000, 500, 250, 120):
            for k in ("estado", "preguntas", "respuestas"):
                e[k] = _acotar(e[k], n)
            if len(json.dumps(e, ensure_ascii=False).encode("utf-8")) <= MAX_LINEA_B:
                break
        else:
            e["estado"] = "[omitido: demasiado grande]"
    return e


def registrar(estado, preguntas, quien, medio, modelo, respuestas, ms, dominio=None, ahora=None):
    """Anota la llamada. Devuelve el id o None. NUNCA lanza, NUNCA espera (sin red, sin cerrojo)."""
    global _escrituras, _rotado_dia
    try:
        if not activa() or not preguntas or not isinstance(respuestas, dict):
            return None
        e = construir(estado, preguntas, quien, medio, modelo, respuestas, ms, dominio, ahora)
        dia = _dia(ahora)
        if _rotado_dia != dia:
            _rotado_dia = dia
            rotar()
        _escrituras += 1
        if _escrituras % ROTAR_CADA == 0:
            rotar()
        _anexar(json.dumps(e, ensure_ascii=False) + "\n", dia)
        _ctx.ultimo = e["id"]
        return e["id"]
    except BaseException as ex:  # noqa: BLE001 — ni siquiera SystemExit debe salir de aquí
        if isinstance(ex, (KeyboardInterrupt, SystemExit)):
            raise
        _contar_fallo(type(ex).__name__)
        return None


# ── lectura y resumen (solo contadores) ──────────────────────────────────────
def archivos(d=None):
    d = d or directorio()
    try:
        return sorted(f for f in os.listdir(d) if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.jsonl", f))
    except OSError:
        return []


def leer(d=None):
    """Genera (dia, entrada) de todas las capturas; salta líneas rotas y enlaces."""
    d = d or directorio()
    for f in archivos(d):
        try:
            with open(os.path.join(d, f), encoding="utf-8", errors="replace") as fh:
                for linea in fh:
                    linea = linea.strip()
                    if not linea:
                        continue
                    try:
                        e = json.loads(linea)
                    except ValueError:
                        continue
                    if isinstance(e, dict) and e.get("id") and "preguntas" in e:
                        yield f[:10], e
        except OSError:
            continue


def enlaces(d=None):
    """{captura_id: experiencia_id} de las líneas de enlace."""
    d = d or directorio()
    fuera = {}
    for f in archivos(d):
        try:
            with open(os.path.join(d, f), encoding="utf-8", errors="replace") as fh:
                for linea in fh:
                    if '"enlace"' not in linea:
                        continue
                    try:
                        e = json.loads(linea)
                    except ValueError:
                        continue
                    if isinstance(e, dict) and e.get("enlace") and e.get("experiencia"):
                        fuera[e["enlace"]] = e["experiencia"]
        except OSError:
            continue
    return fuera


def _fallos_registrados(d):
    try:
        with open(os.path.join(d, "fallos.log"), encoding="utf-8") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0


def resumen(d=None, objetivo=OBJETIVO_LLAMADAS, estratos_obj=ESTRATOS_OBJETIVO, sombra=SOMBRA_ULTIMO):
    """Contadores de la captura. Ningún texto de ningún prompt."""
    d = d or directorio()
    por_dia, por_tipo, por_estrato, por_quien = {}, {}, {}, {}
    total = truncadas = 0
    for dia, e in leer(d):
        total += 1
        por_dia[dia] = por_dia.get(dia, 0) + 1
        for t in set(e.get("tipos") or []):
            por_tipo[t] = por_tipo.get(t, 0) + 1
        for s in e.get("estratos") or []:
            por_estrato[s] = por_estrato.get(s, 0) + 1
        q = e.get("quien") or "desconocido"
        por_quien[q] = por_quien.get(q, 0) + 1
        if e.get("truncado"):
            truncadas += 1
    presentes = [s for s in estratos_obj if por_estrato.get(s)]
    faltan = [s for s in estratos_obj if not por_estrato.get(s)]
    tam = 0
    for f in archivos(d):
        try:
            tam += os.path.getsize(os.path.join(d, f))
        except OSError:
            pass
    ultima_sombra = None
    try:
        with open(sombra, encoding="utf-8") as fh:
            ultima_sombra = json.load(fh)
    except (OSError, ValueError):
        pass
    return {
        "activa": activa(),
        "llamadas": total,
        "objetivo": objetivo,
        "por_dia": por_dia,
        "por_tipo": por_tipo,
        "por_estrato": por_estrato,
        "por_quien": por_quien,
        "estratos_objetivo": list(estratos_obj),
        "estratos_presentes": len(presentes),
        "estratos_faltan": faltan,
        "objetivo_alcanzado": total >= objetivo and not faltan,
        "truncadas": truncadas,
        "bytes": tam,
        "fallos_registrados": _fallos_registrados(d),
        "sombra": ultima_sombra,
    }


def texto(r):
    """El resumen como texto legible (solo cifras)."""
    L = ["Captura de Jev · %s" % ("encendida" if r["activa"] else "APAGADA (STARSEED_JEV_CAPTURA=0)")]
    L.append(
        "  %d de %d llamadas · estratos %d de %d · %.1f MB · truncadas %d · fallos %d"
        % (r["llamadas"], r["objetivo"], r["estratos_presentes"], len(r["estratos_objetivo"]),
           r["bytes"] / 1e6, r["truncadas"], r["fallos_registrados"])
    )
    L.append("  meta: %s" % ("ALCANZADA" if r["objetivo_alcanzado"] else "aún no"))
    if r["estratos_faltan"]:
        L.append("  faltan estratos: " + ", ".join(r["estratos_faltan"]))
    L.append("  por día: " + (", ".join("%s=%d" % kv for kv in sorted(r["por_dia"].items())) or "—"))
    L.append("  por tipo: " + (", ".join("%s=%d" % kv for kv in sorted(r["por_tipo"].items())) or "—"))
    L.append("  por estrato: " + (", ".join("%s=%d" % kv for kv in sorted(r["por_estrato"].items())) or "—"))
    s = r.get("sombra")
    if isinstance(s, dict) and s.get("veredictos"):
        L.append("  última sombra (%s): " % s.get("fecha", "?") + ", ".join("%s=%s" % kv for kv in s["veredictos"].items()))
    return "\n".join(L)


def main(argv=None):
    import argparse

    p = argparse.ArgumentParser(description="Captura de Jev (solo cifras)")
    sub = p.add_subparsers(dest="orden", required=True)
    r = sub.add_parser("resumen", help="totales por día, tipo y estrato, y si se alcanzó la meta")
    r.add_argument("--json", action="store_true")
    r.add_argument("--dir", default=None)
    a = p.parse_args(argv)
    res = resumen(a.dir)
    print(json.dumps(res, ensure_ascii=False, indent=2) if a.json else texto(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
