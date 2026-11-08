"""Avanzar main por fast-forward sin dejarlo a medias (SUP0811B, supervisión del 08-11).

`git merge --ff-only` escribe PRIMERO el árbol de trabajo y el índice y actualiza la referencia AL FINAL.
Si en ese instante otra orden de git tiene el cerrojo de la referencia (`refs/heads/main.lock` o
`HEAD.lock`: el `pack-refs` de un `gc --auto`, un `update-ref`…), git sale con 128 («cannot lock ref
'HEAD'») y deja main con los archivos de la rama escritos y la cabeza donde estaba. Para todos los demás
eso es trabajo ajeno sin commit. El 07-11 a las 18:10 le pasó al orquestador con CTR1107D-d3 y, durante
unas 5 h, el orquestador no arrancó («no arranco»), el reconstructor no compiló («cambiados sin commit
en main») y `traer_nube` no pudo traer la propia tarea («Your local changes … would be overwritten»).

`avanzar_ff` hace el mismo merge y, si falla con la cabeza sin mover:
- devuelve a la cabeza SOLO las rutas que el merge dejó escritas: las que difieren entre la cabeza y el
  destino y cuyo índice o árbol ya tiene el contenido del destino. Si el índice o el árbol de una ruta
  tiene un tercer contenido, es trabajo de otro: no se toca (se dice). Lo que se devuelve es idéntico a
  lo que guarda el destino en git, así que no se pierde nada;
- si el fallo fue un cerrojo, espera y repite el merge (como mucho `reintentos` veces).
Si la cabeza se movió mientras tanto (otro commit entró a la vez), no toca nada y lo dice.
"""
import os
import subprocess
import time

#: Pistas de que el merge murió por un cerrojo de git (de la referencia o del índice).
MARCAS_CERROJO = ("cannot lock ref", "index.lock", "unable to create", "file exists",
                  "another git process")
#: Rutas por llamada a `git restore` (para no pasar el límite de argumentos).
TANDA = 200


def git_simple(raiz, args, timeout=120):
    """`git <args>` en `raiz` → (código, stdout + stderr). Nunca lanza."""
    try:
        r = subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def es_fallo_de_cerrojo(salida):
    """¿La salida de git dice que otro proceso tenía un cerrojo (algo que se arregla esperando)?"""
    s = (salida or "").lower()
    return any(m in s for m in MARCAS_CERROJO)


def _blob_en(git, raiz, ref, ruta):
    """Blob de `ruta` en `ref`, o None si no está ahí."""
    rc, out = git(raiz, ["rev-parse", "-q", "--verify", "%s:%s" % (ref, ruta)])
    out = (out or "").strip()
    return out if rc == 0 and out else None


def _blob_indice(git, raiz, ruta):
    """Blob de `ruta` en el índice (etapa 0), None si no está, "?" si no se puede leer."""
    rc, out = git(raiz, ["ls-files", "-s", "-z", "--", ruta])
    if rc != 0:
        return "?"
    for entrada in (out or "").split("\0"):
        cabeza, _, nombre = entrada.partition("\t")
        partes = cabeza.split()
        if nombre == ruta and len(partes) == 3:
            return partes[1] if partes[2] == "0" else "?"
    return None


def _blob_arbol(git, raiz, ruta):
    """Blob del archivo de `ruta` en el árbol, None si no existe, "?" si no es un archivo normal."""
    completa = os.path.join(raiz, ruta)
    if not os.path.lexists(completa):
        return None
    if os.path.islink(completa) or not os.path.isfile(completa):
        return "?"
    rc, out = git(raiz, ["hash-object", "--", ruta])
    out = (out or "").strip()
    return out if rc == 0 and out else "?"


def escritos_a_medias(raiz, base, destino, git=None):
    """Rutas que un merge fallido de `base` a `destino` dejó escritas → (a_devolver, de_otro).

    a_devolver: el índice o el árbol ya tiene el contenido de `destino` y ninguno de los dos tiene otro
    distinto del de `base` o del de `destino`. de_otro: índice o árbol con un tercer contenido."""
    git = git or git_simple
    rc, out = git(raiz, ["diff", "--name-only", "-z", "--no-renames", base, destino])
    if rc != 0:
        return [], []
    devolver, de_otro = [], []
    for ruta in [r for r in (out or "").split("\0") if r.strip()]:
        en_base, en_destino = _blob_en(git, raiz, base, ruta), _blob_en(git, raiz, destino, ruta)
        en_indice, en_arbol = _blob_indice(git, raiz, ruta), _blob_arbol(git, raiz, ruta)
        conocidos = (en_base, en_destino)
        if en_indice not in conocidos or en_arbol not in conocidos:
            de_otro.append(ruta)
        elif en_destino in (en_indice, en_arbol):
            devolver.append(ruta)
    return devolver, de_otro


def devolver_a_la_cabeza(raiz, base, rutas, git=None, reintentos=6, espera_s=2.0, dormir=time.sleep):
    """`git restore --source=<base> --staged --worktree` de esas rutas (también quita las que solo añadió
    el merge). Repite si el índice está ocupado. → (código, salida)."""
    git = git or git_simple
    for i in range(0, len(rutas), TANDA):
        tanda = rutas[i:i + TANDA]
        for intento in range(reintentos + 1):
            rc, out = git(raiz, ["restore", "--source=" + base, "--staged", "--worktree", "--", *tanda])
            if rc == 0:
                break
            if not es_fallo_de_cerrojo(out) or intento == reintentos:
                return rc, out
            dormir(espera_s)
    return 0, ""


def avanzar_ff(raiz, destino, git=None, extra=(), reintentos=2, espera_s=5.0, dormir=time.sleep):
    """`git merge --ff-only [extra] <destino>` en `raiz` que nunca deja main a medias.

    → (código, salida) como el merge; la salida lleva líneas «[ff_seguro] …» cuando devolvió rutas a la
    cabeza, dejó alguna de otro o repitió por un cerrojo."""
    git = git or git_simple
    orden = ["merge", "--ff-only", *extra, destino]
    rc, base = git(raiz, ["rev-parse", "HEAD"])
    base = (base or "").strip()
    if rc != 0 or not base:
        return git(raiz, orden)  # sin cabeza no se puede comprobar nada: el merge de siempre
    notas = []

    def con_notas(rc_, out_):
        return rc_, "\n".join([out_ or ""] + notas) if notas else (out_ or "")

    for intento in range(reintentos + 1):
        rc, out = git(raiz, orden)
        if rc == 0:
            return con_notas(rc, out)
        rc_h, cabeza = git(raiz, ["rev-parse", "HEAD"])
        if rc_h != 0 or (cabeza or "").strip() != base:
            notas.append("[ff_seguro] la cabeza se movió durante el merge: no toco el árbol")
            return con_notas(rc, out)
        devolver, de_otro = escritos_a_medias(raiz, base, destino, git=git)
        if devolver:
            rc_r, out_r = devolver_a_la_cabeza(raiz, base, devolver, git=git, dormir=dormir)
            if rc_r != 0:
                notas.append("[ff_seguro] NO pude devolver a la cabeza %d archivo(s) que el merge dejó "
                             "escritos: %s" % (len(devolver), (out_r or "").strip()[-200:]))
                return con_notas(rc, out)
            notas.append("[ff_seguro] devueltos a la cabeza %d archivo(s) que el merge fallido dejó escritos: %s"
                         % (len(devolver), ", ".join(devolver[:5]) + (" …" if len(devolver) > 5 else "")))
        if de_otro:
            notas.append("[ff_seguro] %d ruta(s) con contenido de otro, sin tocar: %s"
                         % (len(de_otro), ", ".join(de_otro[:5]) + (" …" if len(de_otro) > 5 else "")))
        if not es_fallo_de_cerrojo(out) or intento == reintentos:
            return con_notas(rc, out)
        notas.append("[ff_seguro] cerrojo de git ocupado: repito el merge (%d de %d)" % (intento + 1, reintentos))
        dormir(espera_s)
    return con_notas(rc, out)
