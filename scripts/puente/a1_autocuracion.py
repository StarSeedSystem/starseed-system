#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Autocuración del A1 de Oracle (CAP1026J, 2026-10-26).

Alex: «¿Quieres que el A1 se reinicie solo cuando deje de responder? sí, es obvio que si te pido que se repare
automáticamente también considere eso y más».

MEDIDO el 26-10: el A1 llevó ~6,6 h colgado — Oracle lo daba por «RUNNING», el puerto 22 abría pero SSH no llegaba
a dar su saludo («Connection timed out during banner exchange»), snapd fallaba por tiempo y `starseed-medio` acabó
saliendo con error. Nadie lo veía: `oracle_nodo.py estado` solo decía `vivo: false` y sus 3 agentes no contaban.
Se arregló con un reinicio suave por la API de Oracle. Esto lo hace solo, cada pasada de la autocuración:

1. **Sonda** (como mucho cada `SONDA_CADA_S`): SSH con `uptime` y el estado de los servicios del nodo.
2. **SSH responde** → si un servicio del nodo está caído (`failed`/`inactive`), `systemctl restart` (uno por
   servicio cada `ENTRE_SERVICIOS_S`). Si venimos de un reinicio, se le manda trabajo ya (`oracle_nodo.py ciclo`
   sin esperar los 20 min entre lanzamientos: el que se mandó durante el cuelgue no llegó).
3. **SSH no responde** → se pregunta a Oracle por la máquina (si Oracle tampoco contesta, el que no tiene red es la
   Mac: no se toca nada):
   - `STOPPED` → `START` (Always Free: arrancarla no cuesta).
   - `RUNNING` con `FALLOS_PARA_ACTUAR` sondas seguidas fallidas durante al menos `MINIMO_COLGADO_S` →
     `SOFTRESET` (apagado ordenado); si a los `ESPERA_TRAS_SUAVE_S` sigue sin volver → `RESET` (duro).
   - Como mucho `MAX_ACCIONES_DIA` acciones en 24 h; pasado eso, un aviso a Alex y nada más.
Cada acción se dice una vez en el Chat Director. Nunca se imprimen la IP ni los OCID.
"""
from __future__ import annotations

import configparser
import fcntl
import json
import os
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

HOME = os.path.expanduser("~")
ESTADO = os.path.join(HOME, ".starseed", "a1-autocuracion.json")
CERROJO = os.path.join(HOME, ".starseed", "cerrojos", "a1-autocuracion.lock")
NOMBRE_INSTANCIA = "starseed-a1"
SERVICIOS = ("starseed-medio", "starseed-metagenesis", "starseed-puerta-datos", "starseed-freellmapi",
             "starseed-bitnet")

SONDA_CADA_S = 5 * 60
FALLOS_PARA_ACTUAR = 3
MINIMO_COLGADO_S = 10 * 60
ESPERA_TRAS_SUAVE_S = 15 * 60
ESPERA_TRAS_DURO_S = 20 * 60
MAX_ACCIONES_DIA = 4
ENTRE_SERVICIOS_S = 30 * 60
#: (CAP1026M) El repo del A1 y lo que se considera un cerrojo de git abandonado.
REPO_A1 = "/home/starseed/starseed-system"
CERROJO_VIEJO_S = 30 * 60
#: Lo que Oracle dice mientras la máquina cambia de estado: se espera, no se actúa encima.
TRANSITORIOS = ("STARTING", "STOPPING", "PROVISIONING", "CREATING_IMAGE", "MOVING")


# ── decisión (pura) ──

#: Fallos de SSH que dicen «la máquina no contesta». Un «Permission denied» o una llave que falta dicen lo
#: contrario (la máquina contesta y el fallo es nuestro): por eso nunca reinician nada.
HUELLAS_DE_CUELGUE = ("timed out", "banner exchange", "connection refused", "connection reset",
                      "no route to host", "timeoutexpired", "connection closed", "network is unreachable")


def fallo_de_maquina(detalle):
    """PURA: ¿este fallo de SSH es de la máquina (colgada, apagada, sin red) y no de nuestra configuración?"""
    texto = str(detalle or "").lower()
    return any(h in texto for h in HUELLAS_DE_CUELGUE)


def acciones_recientes(estado, ahora, ventana_s=24 * 3600):
    return [a for a in (estado or {}).get("acciones") or []
            if isinstance(a, dict) and ahora - float(a.get("t") or 0) < ventana_s]


def decidir(estado, sonda, oci, ahora):
    """PURA. (accion, motivo).

    `estado`: lo guardado ({fallos, primer_fallo, acciones:[{t, accion}], avisado_tope}).
    `sonda`: {"ssh": bool, "caidos": [servicios]} de esta pasada. `oci`: estado de la máquina según Oracle
    («RUNNING», «STOPPED»…) o None si Oracle no contestó / no se preguntó.
    Acciones: nada · esperar · servicios · start · softreset · reset · avisar_tope."""
    estado = estado or {}
    if sonda.get("ssh"):
        if sonda.get("caidos"):
            return "servicios", "servicios del nodo caídos: %s" % ", ".join(sonda["caidos"])
        return "nada", "el A1 responde"
    if not fallo_de_maquina(sonda.get("detalle")):
        return "esperar", "SSH falla por otra causa (%s): no es la máquina, no se reinicia" % (
            str(sonda.get("detalle") or "?")[:80])
    fallos = int(estado.get("fallos") or 0) + 1
    primero = float(estado.get("primer_fallo") or ahora)
    if oci is None:
        return "esperar", "el A1 no responde y Oracle tampoco: puede ser la red de la Mac, no se toca nada"
    if oci in TRANSITORIOS:
        return "esperar", "Oracle dice %s: se espera a que termine" % oci
    recientes = acciones_recientes(estado, ahora)
    ultima = recientes[-1] if recientes else None
    if oci == "STOPPED":
        if ultima and ultima.get("accion") == "start" and ahora - float(ultima["t"]) < ESPERA_TRAS_SUAVE_S:
            return "esperar", "arrancado hace %d min" % ((ahora - float(ultima["t"])) // 60)
        if len(recientes) >= MAX_ACCIONES_DIA:
            return "avisar_tope", "parado y ya van %d acciones en 24 h" % len(recientes)
        return "start", "Oracle lo tiene parado"
    if oci != "RUNNING":
        return "esperar", "Oracle dice %s" % oci
    if fallos < FALLOS_PARA_ACTUAR or ahora - primero < MINIMO_COLGADO_S:
        return "esperar", "sin SSH (%d sonda(s) seguidas, %d min): aún no se reinicia" % (
            fallos, (ahora - primero) // 60)
    if ultima:
        edad = ahora - float(ultima["t"])
        if ultima.get("accion") in ("softreset", "start") and edad < ESPERA_TRAS_SUAVE_S:
            return "esperar", "reiniciado en suave hace %d min: se le deja volver" % (edad // 60)
        if ultima.get("accion") == "reset" and edad < ESPERA_TRAS_DURO_S:
            return "esperar", "reiniciado en duro hace %d min: se le deja volver" % (edad // 60)
    if len(recientes) >= MAX_ACCIONES_DIA:
        return "avisar_tope", "colgado y ya van %d reinicios en 24 h" % len(recientes)
    if ultima and ultima.get("accion") in ("softreset", "start") and ahora - float(ultima["t"]) < 3 * 3600:
        return "reset", "no volvió tras el reinicio suave: reinicio duro"
    return "softreset", "Oracle lo da por encendido pero no responde por SSH desde hace %d min" % (
        (ahora - primero) // 60)


def cerrojo_abandonado(sonda, minimo_s=CERROJO_VIEJO_S):
    """PURA (CAP1026M). ¿El `.git/index.lock` del repo del A1 es un resto de un git muerto?

    MEDIDO el 26-10: el reinicio del A1 dejó `.git/index.lock` de un git que murió a media pasada; cada cola que
    llegó después acabó en «rc: checkout» en un segundo y quedó «procesada» sin hacer nada (cinco colas en dos
    horas, el A1 en «espera»). Solo se aparta si es viejo y NO hay ningún git vivo en la máquina."""
    edad = sonda.get("cerrojo_s")
    return bool(sonda.get("ssh") and edad is not None and edad >= minimo_s and not sonda.get("git_vivos"))


def anotar_sonda(estado, sonda, ahora):
    """PURA. El estado tras la sonda: cuenta los fallos seguidos o los pone a cero."""
    e = dict(estado or {})
    if sonda.get("ssh"):
        e["fallos"], e["primer_fallo"] = 0, None
    else:
        e["fallos"] = int(e.get("fallos") or 0) + 1
        e["primer_fallo"] = e.get("primer_fallo") or ahora
    e["ultima_sonda"] = ahora
    return e


def volvio_de_un_reinicio(estado, sonda, ahora, ventana_s=3 * 3600):
    """PURA. ¿El A1 responde y la última acción fue un reinicio que aún no se aprovechó para mandarle trabajo?"""
    if not sonda.get("ssh"):
        return False
    rec = acciones_recientes(estado, ahora, ventana_s)
    return bool(rec and rec[-1].get("accion") in ("softreset", "reset", "start") and not rec[-1].get("relanzado"))


def servicios_a_reiniciar(estado, caidos, ahora):
    """PURA. Los caídos que no se reiniciaron hace menos de ENTRE_SERVICIOS_S."""
    hechos = (estado or {}).get("servicios") or {}
    return [s for s in caidos or [] if ahora - float(hechos.get(s) or 0) >= ENTRE_SERVICIOS_S]


# ── máquina ──

def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guardar(datos):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO)


def sondear():
    import oracle_nodo as O

    orden = ("uptime >/dev/null && for s in %s; do echo \"$s $(systemctl is-active $s)\"; done; "
             "L=%s/.git/index.lock; if sudo test -f $L; then echo \"cerrojo $(( $(date +%%s) - $(sudo stat -c %%Y $L) )) "
             "$(pgrep -c -x git || true)\"; fi") % (" ".join(SERVICIOS), REPO_A1)
    rc, salida = O.ssh(orden, timeout=60)
    if rc != 0:
        return {"ssh": False, "detalle": salida.strip()[-160:]}
    caidos, cerrojo_s, git_vivos = [], None, 0
    for linea in salida.splitlines():
        partes = linea.split()
        if len(partes) == 2 and partes[0] in SERVICIOS and partes[1] in ("failed", "inactive"):
            caidos.append(partes[0])
        if len(partes) == 3 and partes[0] == "cerrojo":
            try:
                cerrojo_s, git_vivos = int(partes[1]), int(partes[2])
            except ValueError:
                pass
    return {"ssh": True, "caidos": caidos, "cerrojo_s": cerrojo_s, "git_vivos": git_vivos}


def _oci(args, timeout=90):
    r = subprocess.run(["oci", *args], capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError("oci %s: rc %d" % (args[:3], r.returncode))
    return r.stdout


def instancia_oci():
    """(id, estado) de la instancia del A1 según Oracle; (None, None) si Oracle no contesta. El id nunca se imprime."""
    try:
        cfg = configparser.RawConfigParser()
        cfg.read(os.path.join(HOME, ".oci", "config"))
        tenencia = cfg[os.environ.get("OCI_CLI_PROFILE", "DEFAULT")]["tenancy"]
        datos = json.loads(_oci(["compute", "instance", "list", "--compartment-id", tenencia, "--all",
                                 "--output", "json"]))
        vivas = [i for i in datos.get("data") or []
                 if i.get("display-name") == NOMBRE_INSTANCIA and i.get("lifecycle-state") != "TERMINATED"]
        if len(vivas) != 1:
            return None, None
        return vivas[0]["id"], vivas[0].get("lifecycle-state")
    except Exception:  # noqa: BLE001 — sin Oracle no se decide nada
        return None, None


def accion_oci(iid, accion):
    _oci(["compute", "instance", "action", "--action", accion.upper(), "--instance-id", iid,
          "--query", 'data."lifecycle-state"', "--raw-output"], timeout=120)


def _avisar(texto):
    try:
        import oracle_nodo as O

        O._avisar("Autocuración del A1: " + texto)
    except Exception:  # noqa: BLE001
        pass


def _relanzar_trabajo():
    """Tras un reinicio: el lanzamiento que se hizo durante el cuelgue no llegó; se borra su marca de tiempo y se
    lanza un ciclo para que el A1 reciba cola ya."""
    import oracle_nodo as O

    datos = O._leer(O.ESTADO, {}) or {}
    if datos.get("ultimo_lanzamiento"):
        datos["ultimo_lanzamiento"] = None
        O._escribir(O.ESTADO, datos)
    with open("/tmp/starseed-traer-nube.log", "a", encoding="utf-8") as log:
        subprocess.Popen([sys.executable, os.path.join(DIRECTORIO, "oracle_nodo.py"), "ciclo"], cwd=O.RAIZ,
                         stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)


def pasada(forzar=False, ahora=None):
    ahora = time.time() if ahora is None else ahora
    estado = _leer(ESTADO, {}) or {}
    if not forzar and ahora - float(estado.get("ultima_sonda") or 0) < SONDA_CADA_S:
        return {"hecho": "nada", "motivo": "sondeado hace menos de %d min" % (SONDA_CADA_S // 60)}
    import oracle_nodo as O

    if not O._ip():
        return {"hecho": "nada", "motivo": "sin A1 en ~/.starseed/oracle.json"}
    sonda = sondear()
    iid, oci = (None, None) if sonda.get("ssh") or not fallo_de_maquina(sonda.get("detalle")) else instancia_oci()
    accion, motivo = decidir(estado, sonda, oci, ahora)
    estado = anotar_sonda(estado, sonda, ahora)
    hecho = accion
    if accion == "servicios":
        a_reiniciar = servicios_a_reiniciar(estado, sonda.get("caidos"), ahora)
        if a_reiniciar:
            import oracle_nodo as O

            rc, _ = O.ssh("sudo systemctl restart %s" % " ".join(a_reiniciar), timeout=120)
            for s in a_reiniciar:
                estado.setdefault("servicios", {})[s] = ahora
            _avisar("%s → reiniciados %s (rc %d)." % (motivo, ", ".join(a_reiniciar), rc))
        else:
            hecho = "esperar"
            motivo += " (reiniciados hace poco)"
    elif accion in ("start", "softreset", "reset") and iid:
        try:
            accion_oci(iid, accion)
            estado.setdefault("acciones", []).append({"t": ahora, "accion": accion, "motivo": motivo})
            estado["acciones"] = acciones_recientes(estado, ahora, 7 * 24 * 3600)
            _avisar("%s → %s por la API de Oracle. Lo guardado en disco se conserva; vuelvo a mirar en %d min."
                    % (motivo, {"start": "arrancado", "softreset": "reinicio suave", "reset": "reinicio duro"}[accion],
                       SONDA_CADA_S // 60))
        except Exception as e:  # noqa: BLE001
            hecho, motivo = "fallo", "%s: no pude pedírselo a Oracle (%s)" % (motivo, type(e).__name__)
    elif accion == "avisar_tope":
        if ahora - float(estado.get("avisado_tope") or 0) >= 12 * 3600:
            estado["avisado_tope"] = ahora
            _avisar("%s: no hago más reinicios hoy. Mira la consola de Oracle (Instancias → starseed-a1)." % motivo)
    if cerrojo_abandonado(sonda):
        import oracle_nodo as O

        rc, _ = O.ssh("L=%s/.git/index.lock; sudo mv $L $L.viejo-$(date +%%s)" % REPO_A1, timeout=60)
        if rc == 0:
            _avisar("el repo del A1 tenía un cerrojo de git abandonado desde hace %d min (las colas acababan en "
                    "«checkout» sin hacer nada): apartado; la próxima cola ya corre." % (sonda["cerrojo_s"] // 60))
            try:
                datos = O._leer(O.ESTADO, {}) or {}
                datos["ultimo_lanzamiento"] = None
                O._escribir(O.ESTADO, datos)
            except Exception:  # noqa: BLE001
                pass
    if volvio_de_un_reinicio(estado, sonda, ahora):
        estado["acciones"][-1]["relanzado"] = ahora
        try:
            _relanzar_trabajo()
            _avisar("vuelve a responder tras el %s: le mando trabajo ya." % estado["acciones"][-1]["accion"])
        except Exception:  # noqa: BLE001
            pass
    estado.update({"visto": time.strftime("%Y-%m-%d %H:%M:%S"), "ultimo": {"accion": hecho, "motivo": motivo,
                                                                         "oci": oci, "ssh": bool(sonda.get("ssh"))}})
    _guardar(estado)
    return {"hecho": hecho, "motivo": motivo, "oci": oci, "ssh": bool(sonda.get("ssh"))}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    with open(CERROJO, "a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({"hecho": "nada", "motivo": "otra pasada en marcha"}, ensure_ascii=False))
            return 0
        print(json.dumps(pasada(forzar="--forzar" in argv), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
