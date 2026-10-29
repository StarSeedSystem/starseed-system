#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Opus para los directores: Claude Opus por la CLI de Claude Code, con tope y a la suscripción.

Alex (2026-09-25): «los directores también deben usar opus 5.5 si está disponible en los
límites de créditos y gastos inteligentes del sistema». La Mac tiene la CLI `claude` con
sesión de claude.ai: eso es la suscripción, no créditos de API. Reglas:

- Sin la CLI, sin sesión, sin cupo del día/semana o con Claude avisando de límite → None,
  y el director decide como siempre (reglas + Jev). Nunca bloquea a nadie.
- Se quita ANTHROPIC_API_KEY del entorno del proceso hijo: así nunca se cobra a la API.
- Se pregunta sin herramientas y desde una carpeta vacía: Opus opina, no toca el repo.
- El contexto se limpia de cualquier cosa con forma de clave antes de salir de la Mac.
- Topes: STARSEED_OPUS_DIA (8) y STARSEED_OPUS_SEMANA (40) consultas; un aviso de límite
  pausa 3 h. El uso vive en ~/.starseed/opus-director-uso.json (sin texto de prompts).
- Si la dirección va por Hermes (2026-10-29, DIR1029A), la misma pregunta sale por `hermes`
  y llega como «hermes/auto»: los topes, las pausas por límite/saldo y la limpieza de
  claves valen igual en las dos vías. (2026-10-29: antes el relevo se las saltaba.)
"""

import json, os, re, shutil, subprocess, tempfile, time

USO = os.path.expanduser("~/.starseed/opus-director-uso.json")
MODELO = os.environ.get("STARSEED_OPUS_MODELO", "opus")  # alias: el Opus más nuevo del plan
TOPE_DIA = int(os.environ.get("STARSEED_OPUS_DIA", "8"))
TOPE_SEMANA = int(os.environ.get("STARSEED_OPUS_SEMANA", "40"))
PAUSA_LIMITE_S = 3 * 3600
PAUSA_SIN_SALDO_S = 6 * 3600
SIN_HERRAMIENTAS = "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task,Read,Glob,Grep"
_CLAVES = re.compile(
    r"(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{16,}"
    r"|gsk_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._-]{16,}"
    r"|https?://[a-z0-9-]+\.trycloudflare\.com\S*)"
)


def limpiar(texto):
    """Quita todo lo que parezca una clave, un token o la URL del túnel."""
    return _CLAVES.sub("[oculto]", str(texto or ""))


def ejecutable():
    return shutil.which("claude") or next(
        (r for r in (os.path.expanduser("~/.local/bin/claude"),) if os.path.exists(r)), None)


def _leer():
    try:
        with open(USO, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _escribir(u):
    try:
        os.makedirs(os.path.dirname(USO), exist_ok=True)
        tmp = USO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(u, f, ensure_ascii=False, indent=1)
        os.replace(tmp, USO)
    except Exception:
        pass


def _entorno():
    env = dict(os.environ)
    env.pop("ANTHROPIC_API_KEY", None)  # a la suscripción, nunca a créditos de API
    return env


def _correr_real(args, segundos):
    vacia = os.path.join(tempfile.gettempdir(), "opus-director-vacia")  # sin repo ni archivos
    os.makedirs(vacia, exist_ok=True)
    r = subprocess.run(args, capture_output=True, text=True, timeout=segundos, cwd=vacia, env=_entorno(),
                       stdin=subprocess.DEVNULL)
    return r.returncode, r.stdout


def usadas(u, ahora):
    dia = time.strftime("%Y-%m-%d", time.localtime(ahora))
    por_dia = u.get("por_dia") or {}
    semana = sum(n for d, n in por_dia.items()
                 if 0 <= ahora - time.mktime(time.strptime(d, "%Y-%m-%d")) < 7 * 86400)
    return por_dia.get(dia, 0), semana


def _rebasado(u, ahora):
    """Topes y pausa: valen por cualquier motor (claude o hermes). Motivo o None."""
    if u.get("pausado_hasta", 0) > ahora:
        return "%s: en pausa %d min" % (u.get("pausa_motivo") or "Claude avisó de límite",
                                        (u["pausado_hasta"] - ahora) // 60)
    hoy, semana = usadas(u, ahora)
    if hoy >= TOPE_DIA or semana >= TOPE_SEMANA:
        return "tope alcanzado (%d/%d hoy · %d/%d semana)" % (hoy, TOPE_DIA, semana, TOPE_SEMANA)
    return None


def _anotar_pausa(u, texto, ahora):
    """Si la respuesta parece aviso de límite o de saldo, pausa la dirección.

    (2026-09-25) «Credit balance is too low»: la cuenta no tiene saldo ahora mismo.
    No cuesta nada, pero tampoco sirve reintentar cada pasada.
    """
    if re.search(r"credit|balance|billing", texto or "", re.I):
        u["pausado_hasta"], u["pausa_motivo"] = ahora + PAUSA_SIN_SALDO_S, "la cuenta de Claude Code no tiene saldo"
    elif re.search(r"limit|rate|429|quota", texto or "", re.I):
        u["pausado_hasta"], u["pausa_motivo"] = ahora + PAUSA_LIMITE_S, "Claude avisó de límite"


def disponible(ahora=None, correr=None):
    """(bool, motivo). Barato: la sesión se comprueba como mucho una vez por hora."""
    ahora = ahora or time.time()
    if os.environ.get("STARSEED_OPUS_DIRECTOR", "1") == "0":
        return False, "apagado (STARSEED_OPUS_DIRECTOR=0)"
    cli = ejecutable()
    if not cli:
        return False, "no está la CLI de Claude Code en esta máquina"
    u = _leer()
    tope = _rebasado(u, ahora)
    if tope:
        return False, tope
    ses = u.get("sesion") or {}
    if ahora - ses.get("t", 0) > 3600:
        try:
            rc, salida = (correr or _correr_real)([cli, "auth", "status"], 30)
            ok = rc == 0 and bool(json.loads(salida or "{}").get("loggedIn"))
        except Exception:
            ok = False
        u["sesion"] = ses = {"t": ahora, "ok": ok}
        _escribir(u)
    return (True, "listo") if ses.get("ok") else (False, "la CLI de Claude no tiene sesión iniciada")


def _por_hermes():
    try:
        import motores_director
        return motores_director.direccion_motor()
    except Exception:
        return {"motor": "claude"}


def _orden(via, prompt):
    """La orden del director según por dónde vaya la dirección (2026-10-29, DIR1029A)."""
    if (via or {}).get("motor") == "hermes":
        import motores_director
        return motores_director.orden_hermes(prompt, None, None, (via or {}).get("sesion"))
    return [ejecutable(), "-p", prompt, "--model", MODELO, "--output-format", "json",
            "--max-turns", "1", "--disallowedTools", SIN_HERRAMIENTAS]


def _json_si_dict(texto):
    """El JSON de `claude` (o el que devuelva el relevo) si es un objeto; si no, {}."""
    try:
        d = json.loads(texto)
        return d if isinstance(d, dict) else {}
    except ValueError:
        return {}


def consultar(pregunta, contexto="", segundos=240, ahora=None, correr=None):
    """{'texto','modelo','segundos','tokens'} o None. Una sola vuelta, sin herramientas."""
    ahora = ahora or time.time()
    via = _por_hermes()
    if _rebasado(_leer(), ahora):
        return None
    prompt = limpiar("%s\n\n---\n%s" % (pregunta, contexto))[:24000]
    if (via or {}).get("motor") != "hermes":
        ok, _ = disponible(ahora, correr)
        if not ok:
            return None
    t0 = time.time()
    try:
        rc, salida = (correr or _correr_real)(_orden(via, prompt), segundos)
    except Exception:
        rc, salida = 1, ""
    texto = (salida or "").strip()
    datos = _json_si_dict(texto)
    respuesta = str(datos.get("result") or "") if datos else texto
    uso = datos.get("usage") or {}
    tokens = int(uso.get("input_tokens") or 0) + int(uso.get("output_tokens") or 0)
    hermes = (via or {}).get("motor") == "hermes"
    modelo = next(iter(datos.get("modelUsage") or {}), "hermes/auto" if hermes else MODELO)
    u = _leer()
    if rc != 0 or (datos and datos.get("is_error")) or not respuesta:
        u["ultimo"] = {"t": ahora, "ok": False}
        _anotar_pausa(u, respuesta or texto, ahora)
        _escribir(u)
        return None
    dia = time.strftime("%Y-%m-%d", time.localtime(ahora))
    por_dia = u.setdefault("por_dia", {})
    por_dia[dia] = por_dia.get(dia, 0) + 1
    u["llamadas"] = u.get("llamadas", 0) + 1
    u["tokens"] = u.get("tokens", 0) + tokens
    u["ultimo"] = {"t": ahora, "ok": True, "modelo": modelo, "segundos": round(time.time() - t0, 1)}
    _escribir(u)
    return {"texto": limpiar(respuesta), "modelo": modelo, "segundos": u["ultimo"]["segundos"], "tokens": tokens}


def resumen_uso(ahora=None):
    ahora = ahora or time.time()
    u = _leer()
    hoy, semana = usadas(u, ahora)
    return "Opus (directores, suscripción): %d consultas · %d tokens · hoy %d de %d · semana %d de %d" % (
        u.get("llamadas", 0), u.get("tokens", 0), hoy, TOPE_DIA, semana, TOPE_SEMANA)


if __name__ == "__main__":
    ok, motivo = disponible()
    print("disponible" if ok else "no disponible: %s" % motivo)
    print(resumen_uso())
