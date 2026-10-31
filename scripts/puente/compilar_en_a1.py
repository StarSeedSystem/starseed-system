#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compilar Genesis en el A1 de Oracle cuando la Mac ya no cabe (GEN1030A).

El 29-10 Genesis pasó la tarde entera caída: `.next` sin BUILD_ID, la build de la
Mac murió a los 814 s y el freno de swap la dejó bloqueada. Alex autorizó mandar el
código al A1 para compilar y la primera versión vivió en `~/.starseed/genesis-a1/
construir.py` (una copia suelta, sin pruebas): este módulo es esa misma pieza,
pasada al repositorio y con lo indeciso separado en funciones PURAS con pruebas.

Lo que hace (el mismo camino que la Mac, pero compilando fuera):
1. ENVIO   · rsync del repo al A1 sin `.git`, `.next*`, `starseed_memory_root`,
   `.codegraph`, `.transfer` ni ningún `.env*` (y sin `node_modules`, que se queda).
2. ENV     · del `.env.local` SOLO las líneas NEXT_PUBLIC_* van al A1 como
   `.env.production.local` (umask 077): Next las incrusta en el paquete del
   navegador al compilar y sin ellas la pantalla llamaría al proyecto viejo.
3. INSTALAR · `npm ci --ignore-scripts` SOLO si cambió `package-lock.json`.
4. COMPILAR · `next build` en `.next-build` igual que la Mac (`STARSEED_DIST`),
   4096 de heap y `nice`, corriendo como starseed via `--rsync-path`/sudo.
5. TRAER   · el build vuelve a la Mac sin `cache` ni `standalone`; después se
   borra `.env.production.local` del A1 — ahí las claves nunca hacen falta.
6. CAMBIAR · `marcar_listo` con la hora del envío, estado `al-dia` con la huella
   del envío en `reconstruccion.json` y `reiniciar_mando` (de `reconstruir_mando`).
7. TURNO   · (GEN1031A) con `urgente` el A1 da turno aunque esté en cola o guardián.
"""
from __future__ import annotations

import hashlib
import json
import os
import shlex
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import oracle_nodo  # noqa: E402
import reconstruir_mando as RM  # noqa: E402

RAIZ = RM.RAIZ
#: (GEN1031A) La MISMA ruta que la Mac (`.next` guarda rutas absolutas); nunca el checkout del medio.
RAIZ_A1 = os.environ.get("STARSEED_ROOT_A1") or RM.RAIZ
DIST_BUILD = RM.DIST_BUILD
ENV_PRODUCCION = ".env.production.local"
USUARIO = oracle_nodo.USUARIO_SSH
#: Lo que NUNCA viaja al A1. `node_modules` se instala allí (`npm ci`), `.env*`
#: por completo — solo las NEXT_PUBLIC_* pasan, por el paso 2.
EXCLUIDOS = (".git", ".next*", "starseed_memory_root", ".codegraph", ".transfer",
             ".env*", "node_modules")

VIEJA_URGENTE_S = float(os.environ.get("STARSEED_A1_URGENTE_H", "6")) * 3600
ESPERA_TURNO_S = int(os.environ.get("STARSEED_A1_ESPERA_TURNO_S", "3600"))
HOME_A1 = os.path.dirname(oracle_nodo.REPO_A1)
#: El freno que YA lee el orquestador del A1 (`tope_gobernador`) y su turno pesado (tsc/vitest).
GOBERNADOR_A1 = HOME_A1 + "/.starseed/gobernador.json"
PESADO_A1 = HOME_A1 + "/.starseed/cerrojos/pesado.lock"
FASE_A1 = oracle_nodo.ESTADO_A1 + "/estado.json"
MARCA_TURNO = "turno-build-genesis"
SIN_TURNO = 75  # EX_TEMPFAIL, como `tsc-turno.sh`: ni verde ni rojo
ORDEN_GUION = "sudo -u starseed -H sh -s"
TSC_VIVO = "pgrep -u starseed -f 'bin/ts[c]' >/dev/null 2>&1"  # [c]: no se encuentra a sí mismo


def exclusiones(extra=()):
    """PURA: lista `--exclude=…` de rsync, con lo prohibido y lo añadido al llamar."""
    return [x for x in ("--exclude=" + e for e in tuple(EXCLUIDOS) + tuple(extra) if e)]


def filas_publicas(texto):
    """PURA: SOLO las líneas NEXT_PUBLIC_* que viajan del `.env.local`."""
    return [l for l in str(texto or "").splitlines() if l.strip().startswith("NEXT_PUBLIC_")]


def huella_envio(cabeza, porcelana=""):
    """PURA: la huella de lo que se envió (HEAD + trabajo sin compromiso)."""
    return hashlib.sha256(("%s|%s" % (cabeza, porcelana)).encode("utf-8")).hexdigest()


def huella_lock(texto):
    """PURA: sha256 de `package-lock.json`, para saber si hay que instalar."""
    return hashlib.sha256(str(texto or "").encode("utf-8")).hexdigest()


def pide_instalacion(instalada, actual, existe=True):
    """PURA: ¿el A1 necesita `npm ci`? Solo si cambia el lock (o nunca se marcó)."""
    if not existe:
        return True
    return bool(instalada) != bool(actual) or instalada != actual


def orden_env(path):
    """PURA: orden remota que escribe SOLO el .env con NEXT_PUBLIC (umask 077)."""
    return "sudo -u starseed -H sh -c 'umask 077 && mkdir -p %s && cat > %s && chmod 600 %s'" % (
        shlex.quote(os.path.dirname(path)), shlex.quote(path), shlex.quote(path))


def orden_limpiar_env(path):
    """PURA: la clave prestada se borra del A1 en cuanto el build está aquí."""
    return "sudo -u starseed -H sh -c 'rm -f %s'" % shlex.quote(path)


def orden_preparar_arbol(raiz=RAIZ_A1):
    """PURA: el árbol existe y es de starseed (el del 30-10 era de ubuntu). Idempotente: chown una vez."""
    q = shlex.quote(raiz)
    return 'sudo mkdir -p %s && { [ "$(stat -c %%U %s)" = starseed ] || sudo chown -R starseed:starseed %s; }' % (q, q, q)


def orden_instalar(raiz=RAIZ_A1):
    return "sudo -u starseed -H sh -c 'cd %s && npm ci --ignore-scripts'" % shlex.quote(raiz)


def orden_huella_lock_instalada(raiz=RAIZ_A1):
    """PURA: ¿el lock del A1 es el que la Mac tiene? (0 si coincide el texto)."""
    return ("sudo -u starseed -H sh -c 'cat %s/node_modules/.huella-lock 2>/dev/null || true'"
            % shlex.quote(raiz))


def orden_marcar_lock(huella, raiz=RAIZ_A1):
    """PURA: deja en el A1 la huella del lock instalado, para no repetir `npm ci`."""
    return "sudo -u starseed -H sh -c 'echo %s > %s/node_modules/.huella-lock'" % (
        shlex.quote(huella), shlex.quote(raiz))


def guion_compilar(raiz=RAIZ_A1, dist=DIST_BUILD, heap=4096):
    """PURA: la build como la Mac: dist aparte, 4096 de heap, nice 10 y STARSEED_BUILD_LIGERO=1 (30-10: OOM)."""
    return ("cd %s && rm -rf %s && STARSEED_BUILD_LIGERO=1 STARSEED_DIST=%s "
            "NODE_OPTIONS=--max-old-space-size=%d nice -n 10 npx next build"
            % (shlex.quote(raiz), shlex.quote(dist), shlex.quote(dist), heap))


def orden_compilar(raiz=RAIZ_A1, dist=DIST_BUILD, heap=4096):
    """PURA: build con `nice` y 4096 de heap, en dist aparte, igual que la Mac."""
    return "sudo -u starseed -H sh -c '%s'" % guion_compilar(raiz, dist, heap)


def args_envio(raiz, ip, destino=None, transporte=None):
    """PURA: los argumentos de `rsync` que ENVIAR el código al A1 (los excluidos
    de `exclusiones()` quedan también protegidos frente al `--delete`)."""
    transporte = shlex.join(oracle_nodo._ssh_base()) if transporte is None else transporte
    destino_remoto = destino or RAIZ_A1
    return _rsync_args(exclusiones(), transporte, os.path.join(raiz, ""),
                       "%s@%s:%s" % (USUARIO, ip, destino_remoto))


def _rsync_args(excl, transporte, origen, destino):
    """PURA: los argumentos comunes de rsync (y no llega nunca `--delete-excluded`)."""
    return ["rsync", "-a", "--partial", "--inplace", "--rsync-path", "sudo -u starseed rsync",
            "-e", transporte, "--delete", *excl, origen, destino]


def args_traer(origen, ip, destino, transporte=None):
    """PURA: los argumentos para TRAER el build (sin `cache` ni `standalone`)."""
    transporte = shlex.join(oracle_nodo._ssh_base()) if transporte is None else transporte
    return _rsync_args(exclusiones(("cache", "standalone")), transporte,
                       "%s@%s:%s" % (USUARIO, ip, origen.rstrip("/") + "/"), destino)


def _rsync(args, timeout, ip):
    """(rc, salida tachada). Al A1 nunca le sale la IP por la pantalla."""
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.returncode, oracle_nodo.tachar((r.stdout or "") + (r.stderr or ""), ip)
    except Exception as e:  # noqa: BLE001
        return 1, oracle_nodo.tachar("%s: %s" % (type(e).__name__, e), ip)


def se_puede_compilar(estado_a1, ahora, vivo=None, urgente=None):
    """PURA: (ok, motivo). El A1 tiene que latir y estar libre: si su guardián está
    pasando las puertas o hay una cola, el build del Genesis espera (la máquina no
    se arrebata). (GEN1031A) Salvo con `urgente`: entonces el A1 le da turno."""
    vivo = oracle_nodo.nodo_vivo(estado_a1, ahora) if vivo is None else vivo
    if not vivo:
        return False, "el nodo del A1 no late"
    fase = str((estado_a1 or {}).get("fase") or "")
    if fase in ("guardian", "cola"):
        if urgente:
            return True, "el A1 está en fase %s, pero %s: me da turno" % (fase, urgente)
        return False, "el A1 está en fase %s" % (fase or "?")
    return True, "A1 libre"


def urgencia(caido, mtime_build_ns, entradas, ahora, umbral_s=VIEJA_URGENTE_S):
    """PURA: por qué la build del A1 no espera a su enjambre (o None): Genesis caído o sin build, o la
    fuente más vieja fuera del build servido lleva más de `umbral_s`. `entradas`: (ruta, mtime_ns, tam)."""
    if caido:
        return "Genesis está caído"
    if mtime_build_ns is None:
        return "no hay build servido"
    nuevas = [e[1] for e in entradas or () if e[0] not in RM.GENERADOS_TRAS_BUILD and e[1] > mtime_build_ns]
    vieja_s = ahora - min(nuevas) / 1e9 if nuevas else 0
    return "la pantalla lleva %.1f h vieja" % (vieja_s / 3600) if vieja_s > umbral_s else None


def orden_pedir_turno(hasta, ruta=GOBERNADOR_A1):
    """PURA: el freno del orquestador a 1 trabajador (no corta nada); mtime `hasta`: caduca solo."""
    datos = json.dumps({"trabajadores": 1, "motivo": MARCA_TURNO})
    guion = "mkdir -p %s && printf '%%s\\n' %s > %s && touch -d @%d %s" % (
        shlex.quote(os.path.dirname(ruta)), shlex.quote(datos), shlex.quote(ruta), int(hasta), shlex.quote(ruta))
    return "sudo -u starseed -H sh -c %s" % shlex.quote(guion)


def orden_quitar_turno(ruta=GOBERNADOR_A1):
    """PURA: quita el freno SOLO si es el de esta build (lleva MARCA_TURNO). Nunca falla."""
    guion = "grep -qs %s %s && rm -f %s; true" % (MARCA_TURNO, shlex.quote(ruta), shlex.quote(ruta))
    return "sudo -u starseed -H sh -c %s" % shlex.quote(guion)


def guion_turno(compilar, espera_s=ESPERA_TURNO_S, fase=FASE_A1, cerrojo=PESADO_A1, tsc_vivo=TSC_VIVO,
                pausa_s=15):
    """PURA: `sh -s` como starseed: espera a que no haya guardián, tsc ni turno pesado, TOMA el turno
    (`dueno`, como `tsc-turno.sh`; un dueño muerto se aparta, uno vivo nunca) y compila. Si no: SIN_TURNO."""
    q = shlex.quote
    return "\n".join((
        "L=%s; F=%s; fin=$(( $(date +%%s) + %d ))" % (q(cerrojo), q(fase), int(espera_s)),
        'soltar() { [ "$(cut -d" " -f1 "$L/dueno" 2>/dev/null)" = "$$" ] && rm -rf "$L"; }',
        "trap soltar EXIT; trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM",
        'mkdir -p "$(dirname "$L")"',
        "while :; do",
        '  p=$(cut -d" " -f1 "$L/dueno" 2>/dev/null); [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null && rm -rf "$L"',
        "  if ! grep -qs '\"fase\": *\"guardian\"' \"$F\" && ! %s && mkdir \"$L\" 2>/dev/null; then" % tsc_vivo,
        '    echo "$$ $(date +%s)" > "$L/dueno"; break',
        "  fi",
        '  [ "$(date +%%s)" -lt "$fin" ] || { echo "sin turno en %d min: guardián o tsc en curso"; exit %d; }'
        % (int(espera_s) // 60, SIN_TURNO),
        "  sleep %d" % int(pausa_s),
        "done",
        compilar,
        "rc=$?; soltar; exit $rc",
    )) + "\n"


def _git_local(args, raiz=RAIZ, timeout=120):
    try:
        r = subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def cola(texto, n=400):
    """PURA: el final de una salida tachada, para detalle y registro."""
    return (str(texto or "")).strip()[-n:]


def compilar(raiz=RAIZ, tope=7200, urgente=None):
    """Envía, instala si toca, compila en el A1, trae y cambia. (ok, detalle).

    Un fallo de maquinaria remota NO toca `reconstruccion.json`: la Mac espera a la
    próxima pasada y este camino puede volver a intentarse. Con `urgente`, turno (freno SIEMPRE fuera)."""
    ip = oracle_nodo._ip()
    if not ip:
        return False, "sin A1 en ~/.starseed/oracle.json"
    try:
        estado_a1, _, _ = oracle_nodo.estado(guardar=False)
    except Exception as e:  # noqa: BLE001
        return False, "A1 no responde: %s" % oracle_nodo.tachar(str(e), ip)
    ok, motivo = se_puede_compilar(estado_a1, time.time(), urgente=urgente)
    if not ok:
        return False, "A1: %s" % motivo
    if not urgente:
        return _enviar_y_compilar(ip, raiz, tope)
    rc, salida = oracle_nodo.ssh(orden_pedir_turno(time.time() + ESPERA_TURNO_S + tope), timeout=60)
    try:
        if rc != 0:
            return False, "freno del A1: %s" % cola(salida)
        ok, detalle = _enviar_y_compilar(ip, raiz, tope, espera_turno=ESPERA_TURNO_S)
        return ok, "%s (urgente: %s; el A1 dio turno)" % (detalle, urgente)
    finally:
        oracle_nodo.ssh(orden_quitar_turno(), timeout=60)


def _enviar_y_compilar(ip, raiz, tope, raiz_a1=RAIZ_A1, espera_turno=None):
    """El camino de siempre en `raiz_a1`; con `espera_turno`, la build va dentro de `guion_turno`."""
    rc, cabeza = _git_local(["rev-parse", "HEAD"], raiz)
    if rc != 0:
        return False, "sin git de la Mac: %s" % cola(cabeza)
    huella = huella_envio(cabeza.strip(), _git_local(["status", "--porcelain"], raiz)[1])
    t_envio = time.time()
    rc, salida = oracle_nodo.ssh(orden_preparar_arbol(raiz_a1), timeout=600)
    if rc != 0:
        return False, "árbol del A1: %s" % cola(salida)
    rc, salida = _rsync(args_envio(raiz, ip, raiz_a1), 3600, ip)
    if rc != 0:
        return False, "envío al A1: %s" % cola(salida)
    texto = ""
    try:
        with open(os.path.join(raiz, ".env.local"), encoding="utf-8") as f:
            texto = "\n".join(filas_publicas(f.read())) + "\n"
    except OSError:
        pass
    rc, salida = oracle_nodo._ssh_bytes(orden_env(os.path.join(raiz_a1, ENV_PRODUCCION)),
                                        texto.encode("utf-8"), timeout=60)
    if rc != 0:
        return False, "env del A1: %s" % cola(salida)
    try:
        with open(os.path.join(raiz, "package-lock.json"), encoding="utf-8") as f:
            actual = huella_lock(f.read())
    except OSError:
        return False, "sin package-lock.json"
    rc, instal = oracle_nodo.ssh(orden_huella_lock_instalada(raiz_a1), timeout=60)
    if rc != 0:
        return False, "huella del A1: %s" % cola(instal)
    instalada = instal.strip()
    if pide_instalacion(instalada, actual, existe=True):
        rc, salida = oracle_nodo.ssh(orden_instalar(raiz_a1), timeout=3600)
        if rc != 0:
            return False, "npm ci en el A1: %s" % cola(salida)
        oracle_nodo.ssh(orden_marcar_lock(actual, raiz_a1), timeout=60)
    if espera_turno is None:
        rc, salida = oracle_nodo.ssh(orden_compilar(raiz_a1), timeout=tope)
    else:
        rc, salida = oracle_nodo.ssh(ORDEN_GUION, entrada=guion_turno(guion_compilar(raiz_a1), espera_turno),
                                     timeout=tope + espera_turno)
        if rc == SIN_TURNO:
            return False, "sin turno en el A1: %s" % cola(salida)
    if rc != 0:
        return False, "next build en el A1: %s" % cola(salida)
    return traer_y_cambiar(ip, huella, t_envio, raiz, raiz_a1)


def traer_y_cambiar(ip, huella, t_envio, raiz=RAIZ, raiz_a1=RAIZ_A1):
    """Trae el build del A1 (sin cache ni standalone, vía tachar), borra el .env
    prestado y cambia: `marcar_listo` + estado al-dia + reinicio de Genesis."""
    destino = os.path.join(raiz, DIST_BUILD)
    try:
        subprocess.run(["rm", "-rf", destino], check=False)
    except OSError:
        pass
    rc, salida = _rsync(args_traer("%s/%s" % (raiz_a1, DIST_BUILD), ip, destino), 3600, ip)
    oracle_nodo.ssh(orden_limpiar_env(os.path.join(raiz_a1, ENV_PRODUCCION)), timeout=60)
    if rc != 0:
        return False, "traer del A1: %s" % cola(salida)
    if not os.path.exists(os.path.join(destino, "BUILD_ID")):
        return False, "el build traído no tiene BUILD_ID"
    RM.marcar_listo(raiz=raiz, dist=DIST_BUILD, inicio=t_envio)
    RM._guardar(dict(RM._leer_estado(), estado="al-dia", ok=True, t=time.time(),
                     visto=time.strftime("%Y-%m-%d %H:%M:%S"),
                     huella_intentada=huella, huella_construida=huella, error=None))
    RM.reiniciar_mando()
    build_id = RM.id_del_build(raiz=raiz, dist=DIST_BUILD) or ""
    return True, "compiló en el A1, muerte del medio evitada: build %s" % build_id[:12]


if __name__ == "__main__":
    print(compilar())
