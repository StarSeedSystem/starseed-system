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
8. RED     · (SUP0111A, 01-11) con la red Mac↔A1 cortándose, el build del A1 se hizo bien
   (19:32) pero el `rsync` de vuelta murió a los 9 MB de 466, y cada intento borraba lo
   traído y RECOMPILABA: la pantalla se quedó 9 h vieja. Ahora: TRAER reanuda (no se
   borra `.next-build` antes; `--partial --inplace` + `--delete` lo deja idéntico al
   del A1), reintenta dentro de la misma pasada y corta un rsync parado (`--timeout`);
   la build deja en el A1 la marca `.envio-a1` («t_envio huella», solo si `next build`
   salió bien), y la siguiente pasada TRAE ese build sin recompilar si es más nuevo
   que el de la Mac (`build_previo`), aunque el nodo del A1 no lata.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
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

#: (1103 · Q) 1 h, no 6: con el enjambre siempre vivo en la Mac, solo esta urgencia compila, y en el A1 (no en la Mac).
VIEJA_URGENTE_S = float(os.environ.get("STARSEED_A1_URGENTE_H", "1") or 1) * 3600
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
#: (SUP0111A) Marca que la build del A1 deja DENTRO de su dist al acabar bien: «t_envio huella».
#: Vive y muere con el build (`guion_compilar` empieza con `rm -rf dist`): nunca habla de otro.
MARCA_A1 = ".envio-a1"
INTENTOS_TRAER = int(os.environ.get("STARSEED_A1_INTENTOS_TRAER", "4"))
PAUSA_TRAER_S = int(os.environ.get("STARSEED_A1_PAUSA_TRAER_S", "20"))
#: Un rsync sin un byte en este tiempo se corta (antes podía colgarse hasta la hora del subprocess).
RSYNC_TIMEOUT_S = int(os.environ.get("STARSEED_A1_RSYNC_TIMEOUT_S", "120"))
#: Lo lleva el detalle cuando se trajo un build ya hecho: el reconstructor NO lo apunta como
#: construido con la huella de ahora (sus fuentes son las del envío de entonces).
REAPROVECHADO = "ya compilado en el A1"
#: (SUP0111E) La build corre DESACOPLADA en el A1 (`setsid nohup`): un corte del ssh no la mata. La Mac
#: la sondea con ssh cortos; el propio guion deja `estado.json` {pid, inicio, rc} (rc null mientras corre).
DIR_GUION = HOME_A1 + "/.starseed/compilar-a1"
GUION_A1 = DIR_GUION + "/guion.sh"
ESTADO_GUION = DIR_GUION + "/estado.json"
LOG_GUION = DIR_GUION + "/build.log"
SONDEO_S = int(os.environ.get("STARSEED_A1_SONDEO_S", "30"))
GRACIA_ESTADO_S = 120  # tiempo que se le da al guion para escribir su primer estado


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
    """PURA: sha256 de `package-lock.json` (o su texto), cortado a 16 chars.
    
    El formato unificado: primeras 16 posiciones del hash hex. Este mismo formato
    usa `sha256sum package-lock.json | cut -c1-16` en shell y hashlib.sha256(...).hexdigest()[:16]
    en Python. Se usa para comparar si el A1 necesita `npm ci`.
    """
    return hashlib.sha256(str(texto or "").encode("utf-8")).hexdigest()[:16]


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


def marca_envio(t_envio, huella):
    """PURA: el texto de `.envio-a1`: «segundos huella» (solo dígitos, hex y un espacio: viaja
    dentro de un `sh -c '…'` sin comillas). Una huella que no sea hex no se marca (None)."""
    huella = str(huella or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{16,64}", huella):
        return None
    return "%d %s" % (int(t_envio), huella)


def guion_compilar(raiz=RAIZ_A1, dist=DIST_BUILD, heap=4096, marca=None):
    """PURA: la build como la Mac: dist aparte, 4096 de heap, nice 10 y STARSEED_BUILD_LIGERO=1 (30-10: OOM).
    (SUP0111A) Con `marca`, al acabar BIEN deja `dist/.envio-a1`: la próxima pasada puede traerlo sin recompilar."""
    guion = ("cd %s && rm -rf %s && STARSEED_BUILD_LIGERO=1 STARSEED_DIST=%s "
             "NODE_OPTIONS=--max-old-space-size=%d nice -n 10 npx next build"
             % (shlex.quote(raiz), shlex.quote(dist), shlex.quote(dist), heap))
    if marca and re.fullmatch(r"\d+ [0-9a-f]{16,64}", str(marca)):
        guion += " && echo %s > %s/%s" % (marca, shlex.quote(dist), MARCA_A1)
    return guion


def orden_compilar(raiz=RAIZ_A1, dist=DIST_BUILD, heap=4096, marca=None):
    """PURA: build con `nice` y 4096 de heap, en dist aparte, igual que la Mac."""
    return "sudo -u starseed -H sh -c '%s'" % guion_compilar(raiz, dist, heap, marca=marca)


def _frag_vivo(estado=ESTADO_GUION):
    """PURA: trozo de `sh` que imprime `vivo=1` si el guion de estado.json sigue en marcha (rc null y su
    pid vive: `kill -0`), y `vivo=0` si no (un pid reutilizado tras acabar no cuenta)."""
    f = shlex.quote(estado)
    return ("p=$(sed -n 's/.*\"pid\": *\\([0-9][0-9]*\\).*/\\1/p' %s 2>/dev/null); "
            "if grep -qs '\"rc\": *null' %s && [ -n \"$p\" ] && kill -0 \"$p\" 2>/dev/null; "
            "then echo vivo=1; else echo vivo=0; fi" % (f, f))


def orden_build_previo(raiz=RAIZ_A1, dist=DIST_BUILD, estado=ESTADO_GUION):
    """PURA: (SUP0111A) lee del A1 la marca y el BUILD_ID de su último build, con etiquetas.
    (SUP0111E) y si hay un guion de build vivo (`vivo=1`): entonces se espera a ese."""
    d = shlex.quote("%s/%s" % (raiz.rstrip("/"), dist))
    guion = ('echo "marca=$(cat %s/%s 2>/dev/null)"; echo "build=$(cat %s/BUILD_ID 2>/dev/null)"; %s'
             % (d, MARCA_A1, d, _frag_vivo(estado)))
    return "sudo -u starseed -H sh -c %s" % shlex.quote(guion)


def guion_vivo(salida):
    """PURA: ¿la salida de `orden_build_previo` dice que hay un guion de build vivo?"""
    return "vivo=1" in [l.strip() for l in str(salida or "").splitlines()]


def build_previo(salida, mtime_build_ns):
    """PURA: (t_envio, huella, build_id) del build TERMINADO que espera en el A1, si sus fuentes
    son más nuevas que el mejor build de la Mac (`RM.mtime_del_build`, en ns); si no, None.
    Sin marca no hay nada que traer: o no acabó, o lo hizo un código sin marcas."""
    datos = {}
    for linea in str(salida or "").splitlines():
        clave, _, valor = linea.strip().partition("=")
        if clave in ("marca", "build"):
            datos[clave] = valor.strip()
    partes = datos.get("marca", "").split()
    build_id = datos.get("build", "")
    if len(partes) != 2 or not partes[0].isdigit() or not re.fullmatch(r"[0-9a-f]{16,64}", partes[1]):
        return None
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", build_id):
        return None
    t_envio = int(partes[0])
    if mtime_build_ns is not None and t_envio * 1_000_000_000 <= int(mtime_build_ns):
        return None
    return t_envio, partes[1], build_id


def guion_desacoplado(cuerpo, estado=ESTADO_GUION):
    """PURA: el guion que corre DESACOPLADO en el A1: anota {pid, inicio, rc: null} al empezar, ejecuta
    `cuerpo` (`guion_turno` o `guion_compilar`) con la entrada cerrada y anota su rc al acabar."""
    return "\n".join((
        'E=%s; ini=$(date +%%s)' % shlex.quote(estado),
        'anotar() { printf \'{"pid": %d, "inicio": %d, "rc": %s}\\n\' "$$" "$ini" "$1" > "$E.tmp" && mv -f "$E.tmp" "$E"; }',
        "anotar null",
        "cat > \"$E.cuerpo.sh\" <<'FIN_CUERPO_A1'",
        cuerpo.rstrip("\n"),
        "FIN_CUERPO_A1",
        'sh "$E.cuerpo.sh" < /dev/null',
        'rc=$?; anotar "$rc"; exit "$rc"',
    )) + "\n"


def orden_lanzar(guion=GUION_A1, estado=ESTADO_GUION, log=LOG_GUION):
    """PURA: sube el guion (por la entrada), borra el estado viejo y lo arranca como starseed, en una sesión
    propia y sin terminal: `setsid nohup sh guion.sh > build.log 2>&1 < /dev/null &`."""
    q, d = shlex.quote, os.path.dirname(guion)
    interno = "mkdir -p %s && cat > %s && rm -f %s && cd %s && { setsid nohup sh %s > %s 2>&1 < /dev/null & }" % (
        q(d), q(guion), q(estado), q(d), q(os.path.basename(guion)), q(os.path.basename(log)))
    return "sudo -u starseed -H sh -c %s" % q(interno)


def orden_sondeo(estado=ESTADO_GUION):
    """PURA: ssh corto: el estado.json del guion (si hay) y `vivo=1|0`."""
    return "sudo -u starseed -H sh -c %s" % shlex.quote('cat %s 2>/dev/null; %s' % (shlex.quote(estado), _frag_vivo(estado)))


def orden_cola_log(log=LOG_GUION):
    """PURA: el final del registro de la build del A1 (para el detalle de un fallo)."""
    return "sudo -u starseed -H tail -c 2000 %s 2>/dev/null; true" % shlex.quote(log)


def leer_sondeo(salida):
    """PURA: (estado dict|None, vivo) de la salida de `orden_sondeo`."""
    estado, vivo = None, False
    for linea in str(salida or "").splitlines():
        linea = linea.strip()
        if linea == "vivo=1":
            vivo = True
        elif linea.startswith("{"):
            try:
                datos = json.loads(linea)
            except ValueError:
                continue
            estado = datos if isinstance(datos, dict) else estado
    return estado, vivo


def decision_sondeo(rc_ssh, salida, transcurrido_s, tope_s, gracia_s=GRACIA_ESTADO_S):
    """PURA: (accion, rc_build). acciones: «acabado» (rc entero en estado.json), «muerto» (el guion ya no
    vive y no dejó rc, o no escribió estado en `gracia_s`), «tope», «medio» (el ssh falló: la red NO es la
    build, se sigue sondeando) y «seguir». Acabar gana al tope."""
    if rc_ssh == 0:
        estado, vivo = leer_sondeo(salida)
        rc = (estado or {}).get("rc")
        if isinstance(rc, int) and not isinstance(rc, bool):
            return "acabado", rc
        if (estado is not None and not vivo) or (estado is None and transcurrido_s > gracia_s):
            return "muerto", None
    if transcurrido_s >= tope_s:
        return "tope", None
    return ("seguir" if rc_ssh == 0 else "medio"), None


def args_envio(raiz, ip, destino=None, transporte=None):
    """PURA: los argumentos de `rsync` que ENVIAR el código al A1 (los excluidos
    de `exclusiones()` quedan también protegidos frente al `--delete`)."""
    transporte = shlex.join(oracle_nodo._ssh_base()) if transporte is None else transporte
    destino_remoto = destino or RAIZ_A1
    return _rsync_args(exclusiones(), transporte, os.path.join(raiz, ""),
                       "%s@%s:%s" % (USUARIO, ip, destino_remoto))


def _rsync_args(excl, transporte, origen, destino):
    """PURA: los argumentos comunes de rsync (y no llega nunca `--delete-excluded`).
    (SUP0111A) `--timeout`: un rsync parado por la red se corta y se reintenta (reanudando)."""
    return ["rsync", "-a", "--partial", "--inplace", "--timeout=%d" % RSYNC_TIMEOUT_S,
            "--rsync-path", "sudo -u starseed rsync", "-e", transporte, "--delete", *excl, origen, destino]


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


def esperar_guion(tope_s, sondeo_s=None):
    """(SUP0111E) Sondea el guion del A1 con ssh cortos hasta que acabe. (rc_build, detalle): rc None si se
    agotó el tope (el guion sigue allí; la próxima pasada espera a ese), -1 si murió sin rc."""
    sondeo_s = SONDEO_S if sondeo_s is None else sondeo_s
    t0 = time.time()
    while True:
        rc, salida = oracle_nodo.ssh(orden_sondeo(), timeout=60)
        accion, rc_build = decision_sondeo(rc, salida, time.time() - t0, tope_s)
        if accion == "acabado":
            return rc_build, ""
        if accion == "muerto":
            return -1, "el guion del A1 murió sin dejar rc"
        if accion == "tope":
            return None, "tope de %d s sondeando el A1: el guion sigue allí" % tope_s
        time.sleep(sondeo_s)


def _veredicto(rc_build, detalle, aviso, sin_turno=False):
    """(None, «lo que se vio») si la build del A1 no acabó bien; (0, '') si sí."""
    if rc_build == 0:
        return 0, ""
    if rc_build is None:
        return None, detalle
    cola_log = cola(oracle_nodo.ssh(orden_cola_log(), timeout=60)[1])
    if rc_build == SIN_TURNO and sin_turno:
        return None, "sin turno en el A1: %s" % cola_log
    return None, "%s: %s" % (detalle or aviso, cola_log)


def traer_previo(raiz=RAIZ, visto=None):
    """(SUP0111A) Solo «traer lo ya hecho»: (ok, detalle) si el A1 tiene un build TERMINADO más nuevo
    que el de la Mac; None si no hay nada que traer (o no hay A1). Nunca compila ni envía código:
    el reconstructor lo usa también con la Mac frenada (enjambre vivo o swap)."""
    ip = oracle_nodo._ip()
    if not ip:
        return None
    rc, salida = visto or oracle_nodo.ssh(orden_build_previo(), timeout=60)
    previo = build_previo(salida, RM.mtime_del_build(raiz=raiz)) if rc == 0 else None
    if not previo:
        return None
    t_envio, huella, build_id = previo
    ok, detalle = traer_y_cambiar(ip, huella, t_envio, raiz)
    return ok, "%s (%s, build %s del envío de las %s: sin recompilar)" % (
        detalle, REAPROVECHADO, build_id[:12], time.strftime("%H:%M", time.localtime(t_envio)))


def compilar(raiz=RAIZ, tope=7200, urgente=None):
    """Envía, instala si toca, compila en el A1, trae y cambia. (ok, detalle).

    Un fallo de maquinaria remota NO toca `reconstruccion.json`: la Mac espera a la
    próxima pasada y este camino puede volver a intentarse. Con `urgente`, turno (freno SIEMPRE fuera)."""
    ip = oracle_nodo._ip()
    if not ip:
        return False, "sin A1 en ~/.starseed/oracle.json"
    # (SUP0111A) Un build que ya acabó bien en el A1 y es más nuevo que el de la Mac se TRAE
    # sin recompilar (ni turno ni latido: solo hace falta ssh). Si traerlo falla, se queda lo
    # traído para reanudar y la próxima pasada vuelve aquí, no a otra build de 10 minutos.
    visto = oracle_nodo.ssh(orden_build_previo(), timeout=60)
    if visto[0] == 0 and guion_vivo(visto[1]):  # (SUP0111E) ya hay un guion vivo: ni envía ni lanza otro
        rc_build, detalle = esperar_guion(tope + ESPERA_TURNO_S)
        rc_build, detalle = _veredicto(rc_build, detalle, "next build en el A1 (guion ya en marcha)")
        if rc_build is None:
            return False, detalle
        return traer_previo(raiz) or (False, "el guion del A1 acabó sin dejar un build traíble")
    hecho = traer_previo(raiz, visto)
    if hecho:
        return hecho
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
    marca = marca_envio(t_envio, huella)  # (SUP0111A) solo se escribe si `next build` acaba bien
    cuerpo = guion_compilar(raiz_a1, marca=marca)
    if espera_turno is not None:
        cuerpo = guion_turno(cuerpo, espera_turno)
    rc, salida = oracle_nodo._ssh_bytes(orden_lanzar(), guion_desacoplado(cuerpo).encode("utf-8"), timeout=120)
    if rc != 0:
        return False, "lanzar la build en el A1: %s" % cola(salida)
    rc_build, detalle = esperar_guion(tope + (espera_turno or 0))
    rc_build, detalle = _veredicto(rc_build, detalle, "next build en el A1", sin_turno=espera_turno is not None)
    if rc_build is None:
        return False, detalle
    return traer_y_cambiar(ip, huella, t_envio, raiz, raiz_a1)


def traer_y_cambiar(ip, huella, t_envio, raiz=RAIZ, raiz_a1=RAIZ_A1, intentos=None, pausa_s=None):
    """Trae el build del A1 (sin cache ni standalone, vía tachar), borra el .env
    prestado y cambia: `marcar_listo` + estado al-dia + reinicio de Genesis.

    (SUP0111A) Ya NO se vacía `.next-build` antes: con la red cortándose, empezar de cero en
    cada intento no acababa nunca (466 MB; morían a los 9). `--partial --inplace` reanuda y
    `--delete` deja la carpeta idéntica al build del A1 (lo de otro build se va; `cache` y
    `standalone` quedan fuera). Hasta `intentos` rsync seguidos en la misma pasada."""
    destino = os.path.join(raiz, DIST_BUILD)
    intentos = max(1, INTENTOS_TRAER if intentos is None else int(intentos))
    pausa_s = PAUSA_TRAER_S if pausa_s is None else pausa_s
    args = args_traer("%s/%s" % (raiz_a1, DIST_BUILD), ip, destino)
    try:  # la marca de «entero» se quita ANTES: a medio traer, nadie puede tomarlo por terminado
        os.remove(os.path.join(destino, RM.MARCA_LISTO))
    except OSError:
        pass
    rc, salida = 1, ""
    for n in range(intentos):
        if n:
            time.sleep(pausa_s)
        rc, salida = _rsync(args, 3600, ip)
        if rc == 0:
            break
    oracle_nodo.ssh(orden_limpiar_env(os.path.join(raiz_a1, ENV_PRODUCCION)), timeout=60)
    if rc != 0:
        return False, "traer del A1 (%d intento%s; lo traído se queda para reanudar): %s" % (
            intentos, "" if intentos == 1 else "s", cola(salida))
    if not os.path.exists(os.path.join(destino, "BUILD_ID")):
        return False, "el build traído no tiene BUILD_ID"
    RM.marcar_listo(raiz=raiz, dist=DIST_BUILD, inicio=t_envio)
    RM._guardar(dict(RM._leer_estado(), estado="al-dia", ok=True, t=time.time(),
                     visto=time.strftime("%Y-%m-%d %H:%M:%S"),
                     huella_intentada=huella, huella_construida=huella, error=None))
    build_id = RM.id_del_build(raiz=raiz, dist=DIST_BUILD) or ""  # antes del cambio: después ya no está ahí
    RM.reiniciar_mando()
    return True, "compiló en el A1, muerte del medio evitada: build %s" % build_id[:12]


if __name__ == "__main__":
    print(compilar())
