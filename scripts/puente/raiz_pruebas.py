# -*- coding: utf-8 -*-
"""Una raíz temporal por corrida de pruebas, que se borra al acabar (TMP1113B).

POR QUÉ existe: las suites de `scripts/puente` y `scripts/enjambre` (miles de pruebas) corren muchas veces al
día y cada corrida dejaba sus carpetas en `$(getconf DARWIN_USER_TEMP_DIR)`: medido el 13-11 en la Mac,
~72 000 entradas, 34 000 solo del 12-11 (`tmpXXXXXXXX`, `potenciar-pruebas*`, `cupo-codex*`, `memvid-origen*`…),
y macOS solo vacía esa carpeta al reiniciar. Una sesión no puede barrer la carpeta compartida a ojo, así que
se arregla en el origen: cada corrida es DUEÑA de una raíz propia (`<tmp>/sspruebas-<pid>-XXXX`), `tempfile`
y todo lo que lea `TMPDIR` cae dentro, y la raíz se quita al salir (éxito, fallo, Ctrl-C o SIGTERM).

Dos formas de usarlo, que se apilan sin estorbarse:
  · DENTRO del proceso: `abrir()` en el `conftest.py` de cada suite. Cubre un `pytest scripts/...` escrito a mano.
  · FUERA, alrededor de un hijo: `entorno_con_raiz()` / `correr_con_raiz()` / `python3 raiz_pruebas.py -- <orden>`.
    Cubre también unittest y vitest (Node respeta `TMPDIR`), que no tienen un gancho de sesión.

Lo único que se borra es lo que este módulo creó y marcó con su prefijo `sspruebas-`. Las raíces de una corrida
que murió sin poder limpiar (SIGKILL, corte de luz) se reconocen por su pid muerto y se quitan en la corrida
siguiente (`barrer_huerfanas`); nunca se toca una cuyo pid siga vivo ni una de otro prefijo.
Los tests que quieran una ruta fuera de la raíz (`/tmp/…`, `dir=`) siguen funcionando: solo cambia el DEFECTO.
"""
import atexit
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile

PREFIJO = "sspruebas-"
#: Variable que marca «ya estoy dentro de una raíz de pruebas» (el hijo no abre otra: la del padre lo cubre).
VAR_RAIZ = "STARSEED_RAIZ_PRUEBAS"
#: Un pid vivo con raíz de más de este tiempo se respeta igual; solo se barren las de pid muerto.
_ESTADO = {"raiz": None, "origen": None, "cuenta": 0, "senales": {}, "limpiada": False}


def _forzar_borrado(funcion, ruta, _info):
    """`onerror` de rmtree: una prueba pudo dejar una carpeta sin permiso de escritura."""
    try:
        os.chmod(os.path.dirname(ruta) or ".", 0o700)
        os.chmod(ruta, 0o700)
        funcion(ruta)
    except OSError:
        pass


def quitar(raiz):
    """Borra una raíz creada por este módulo. Solo si lleva el prefijo y está dentro del temporal del sistema."""
    if not raiz or not os.path.basename(raiz).startswith(PREFIJO):
        return False
    try:
        if os.path.islink(raiz) or not os.path.isdir(raiz):
            return False
        shutil.rmtree(raiz, onerror=_forzar_borrado)
        return not os.path.exists(raiz)
    except OSError:
        return False


def _pid_vivo(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def barrer_huerfanas(base=None, vivo=_pid_vivo):
    """Quita las raíces `sspruebas-<pid>-*` de `base` cuyo pid ya no existe. Devuelve cuántas quitó."""
    base = base or tempfile.gettempdir()
    quitadas = 0
    try:
        nombres = os.listdir(base)
    except OSError:
        return 0
    for nombre in nombres:
        m = re.fullmatch(re.escape(PREFIJO) + r"(\d+)-[A-Za-z0-9_]+", nombre)
        if not m or vivo(int(m.group(1))):
            continue
        if quitar(os.path.join(base, nombre)):
            quitadas += 1
    return quitadas


def crear(base=None):
    """Crea una raíz nueva (sin tocar el entorno ni `tempfile`). Barre antes las huérfanas de corridas muertas."""
    base = base or tempfile.gettempdir()
    barrer_huerfanas(base)
    raiz = tempfile.mkdtemp(prefix="%s%d-" % (PREFIJO, os.getpid()), dir=base)
    # 0711: otro usuario (p. ej. `runuser -u postgres` en las pruebas del nodo) debe poder ATRAVESARLA hasta la
    # subcarpeta que su prueba abrió con permisos propios; listarla, no. Con 0700 esas pruebas dejaban de llegar.
    os.chmod(raiz, 0o711)
    return raiz


def _senal(numero, _marco):
    # Primero se limpia, luego se sale con el código de costumbre (128 + señal). SystemExit deja correr atexit.
    cerrar()
    raise SystemExit(128 + numero)


def abrir():
    """Dentro del proceso: pone `TMPDIR` y `tempfile.tempdir` en una raíz propia y la quita al salir.

    Idempotente: varias llamadas (dos conftest en la misma corrida) comparten la misma raíz. Si el proceso padre
    ya abrió una (`STARSEED_RAIZ_PRUEBAS`), no abre otra: la del padre la borrará. Devuelve la raíz en uso."""
    _ESTADO["cuenta"] += 1
    if _ESTADO["raiz"]:
        return _ESTADO["raiz"]
    heredada = os.environ.get(VAR_RAIZ)
    if heredada and os.path.isdir(heredada):
        _ESTADO["origen"] = "heredada"
        return heredada
    origen = tempfile.gettempdir()
    raiz = crear(origen)
    _ESTADO.update(raiz=raiz, origen=origen, limpiada=False)
    os.environ[VAR_RAIZ] = raiz
    for var in ("TMPDIR", "TEMP", "TMP"):
        os.environ[var] = raiz
    tempfile.tempdir = raiz
    atexit.register(cerrar)
    for sig in (signal.SIGTERM, signal.SIGHUP):
        try:
            previo = signal.signal(sig, _senal)
            _ESTADO["senales"][sig] = previo
        except (ValueError, OSError):  # fuera del hilo principal no se pueden instalar manejadores
            pass
    return raiz


def cerrar():
    """Quita la raíz abierta por `abrir()` (si hay) y devuelve el entorno a como estaba. Segura de llamar varias veces."""
    raiz = _ESTADO["raiz"]
    if not raiz or _ESTADO["limpiada"]:
        return False
    _ESTADO["limpiada"] = True
    tempfile.tempdir = None
    os.environ.pop(VAR_RAIZ, None)
    for var in ("TMPDIR", "TEMP", "TMP"):
        os.environ.pop(var, None)
    for sig, previo in list(_ESTADO["senales"].items()):
        try:
            signal.signal(sig, previo if previo is not None else signal.SIG_DFL)
        except (ValueError, OSError):
            pass
    _ESTADO["senales"] = {}
    ok = quitar(raiz)
    _ESTADO["raiz"] = None
    return ok


def entorno_con_raiz(env, raiz):
    """Copia de `env` con el temporal apuntando a `raiz` (para un hijo: unittest, pytest o vitest)."""
    e = dict(env if env is not None else os.environ)
    for var in ("TMPDIR", "TEMP", "TMP"):
        e[var] = raiz
    e[VAR_RAIZ] = raiz
    return e


def correr_con_raiz(orden, env=None, correr=None, **kw):
    """Corre `orden` con una raíz temporal propia y la quita pase lo que pase (también KeyboardInterrupt/timeout).

    Misma firma que `subprocess.run`; si `env` ya trae una raíz (`STARSEED_RAIZ_PRUEBAS` válida) la respeta."""
    correr = correr or subprocess.run  # se resuelve AQUÍ: una prueba que sustituya subprocess.run lo ve
    base_env = dict(env if env is not None else os.environ)
    heredada = base_env.get(VAR_RAIZ)
    if heredada and os.path.isdir(heredada):
        return correr(orden, env=base_env, **kw)
    # La raíz se crea bajo el temporal «de verdad» (el del entorno que se va a pasar), no bajo una ya redirigida.
    base = base_env.get("TMPDIR") or tempfile.gettempdir()
    if not os.path.isdir(base):
        base = tempfile.gettempdir()
    raiz = crear(base)
    try:
        return correr(orden, env=entorno_con_raiz(base_env, raiz), **kw)
    finally:
        quitar(raiz)


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] == "--":
        args = args[1:]
    if not args:
        print(__doc__)
        return 2
    base = tempfile.gettempdir()
    raiz = crear(base)
    proc = None

    def reenviar(numero, _marco):
        if proc and proc.poll() is None:
            try:
                proc.send_signal(numero)
            except OSError:
                pass

    try:
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, reenviar)
        proc = subprocess.Popen(args, env=entorno_con_raiz(os.environ, raiz))
        return proc.wait()
    finally:
        quitar(raiz)


if __name__ == "__main__":
    sys.exit(main())
