#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica PURA del director de lanzamientos (contrato architecture/centro-versiones-1105.md).

Nada de red, git ni disco: el director (`director_lanzamientos.py`) reúne los hechos y estas funciones
deciden. Así cada regla tiene su prueba (`test_lanzamientos_logica.py`).
"""
import json
import re

SISTEMAS = ("os", "nexus", "cafe")
PREFIJOS = {"os": ("StarSeed.OS", "StarSeed-os"), "nexus": ("StarSeed.Nexus", "StarSeed-nexus"),
            "cafe": ("StarSeed.Cafe", "StarSeed-cafe")}
WEB = "https://starseed-os.vercel.app"
REPO = "StarSeedSystem/starseed-system"

#: Los medios del panel, en su orden (§1).
MEDIOS = (
    ("web", "Sitio web oficial"), ("pwa", "App web instalable (PWA)"), ("macos", "macOS"),
    ("windows", "Windows"), ("linux", "Linux"), ("android", "Android"), ("ios", "iOS"),
    ("canales", "Canales del actualizador"), ("libreria", "Librería de StarSeed OS"),
)
#: Plataformas de `native-build.yml` (input `plataformas`) que regenera cada medio.
PLATAFORMA_DE_MEDIO = {"macos": "escritorio", "windows": "escritorio", "linux": "escritorio",
                       "canales": "escritorio", "android": "android", "ios": "ios"}
#: Tamaño mínimo (bytes) para dar un archivo por bueno: un .ipa de 348 bytes ya se publicó una vez.
MINIMOS = {".dmg": 2_000_000, ".app.tar.gz": 2_000_000, ".msi": 1_000_000, "-setup.exe": 1_000_000,
           ".AppImage": 20_000_000, ".deb": 1_000_000, ".rpm": 1_000_000, ".apk": 10_000_000,
           ".ipa": 1_000_000, ".sig": 100, ".json": 300}
PLATAFORMAS_CANAL = ("darwin-aarch64", "darwin-x86_64", "linux-x86_64", "windows-x86_64")
FASES = ("esperando-lista", "esperando-publicacion", "preparando", "etiquetando", "compilando",
         "verificando-archivos", "publicando", "verificando-medios", "lanzado")
_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def siguiente_version(actual, tipo="menor"):
    """'0.3.0' → '0.4.0' (menor) o '0.3.1' (parche). Una versión mayor nunca la sube el director."""
    m = _SEMVER.match((actual or "").strip())
    if not m:
        raise ValueError("versión no semver: %r" % actual)
    a, b, c = (int(x) for x in m.groups())
    if a >= 1000:  # «2026.10.09» es la versión-fecha del OS web, no la nativa
        raise ValueError("versión-fecha, no nativa: %r" % actual)
    if tipo == "parche":
        return "%d.%d.%d" % (a, b, c + 1)
    if tipo == "menor":
        return "%d.%d.0" % (a, b + 1)
    raise ValueError("tipo no permitido al director: %r" % tipo)


def _minimo(nombre):
    for fin in (".app.tar.gz", "-setup.exe"):
        if nombre.endswith(fin):
            return MINIMOS[fin]
    for fin, n in MINIMOS.items():
        if nombre.endswith(fin):
            return n
    return 1


def archivos_esperados(version, sistemas=SISTEMAS):
    """{medio: [nombre, …]} de los archivos que debe tener la release `v<version>` (§1)."""
    v = version
    fuera = {"macos": [], "windows": [], "linux": [], "android": [], "ios": [], "canales": []}
    for s in sistemas:
        p, a = PREFIJOS[s]
        fuera["macos"] += ["%s_%s_universal.dmg" % (p, v), "%s_universal.app.tar.gz" % p,
                           "%s_universal.app.tar.gz.sig" % p]
        for n in ("%s_%s_x64_en-US.msi" % (p, v), "%s_%s_x64-setup.exe" % (p, v)):
            fuera["windows"] += [n, n + ".sig"]
        for n in ("%s_%s_amd64.AppImage" % (p, v), "%s_%s_amd64.deb" % (p, v), "%s-%s-1.x86_64.rpm" % (p, v)):
            fuera["linux"] += [n, n + ".sig"]
        fuera["android"].append("%s-%s.apk" % (a, v))
        fuera["ios"].append("StarSeed-%s-%s-unsigned.ipa" % (s, v))
        fuera["canales"].append("latest.json" if s == "os" else "latest-%s.json" % s)
    return fuera


def verificar_archivos(esperados, publicados):
    """`publicados` = {nombre: bytes}. → {medio: {estado, faltan, pequenos}}. iOS sin archivo útil es
    `no-disponible` (no bloquea): hasta que haya cuenta de Apple el .ipa sale vacío."""
    fuera = {}
    for medio, nombres in esperados.items():
        faltan = [n for n in nombres if n not in publicados]
        pequenos = [n for n in nombres if n in publicados and (publicados[n] or 0) < _minimo(n)]
        if not faltan and not pequenos:
            estado = "al-dia"
        elif medio == "ios":
            estado = "no-disponible"
        else:
            estado = "atascado"
        fuera[medio] = {"estado": estado, "faltan": faltan, "pequenos": pequenos}
    return fuera


def bloquean_publicacion(verificacion):
    """Los medios que impiden publicar la release (todo menos iOS, que es *best-effort*)."""
    return sorted(m for m, r in verificacion.items() if r["estado"] == "atascado")


def verificar_canal(texto, version, publicados):
    """Un `latest*.json` → lista de problemas (vacía = bueno)."""
    try:
        datos = json.loads(texto) if isinstance(texto, str) else texto
    except ValueError:
        return ["no es JSON"]
    if not isinstance(datos, dict):
        return ["no es un objeto"]
    problemas = []
    if str(datos.get("version", "")).lstrip("v") != version:
        problemas.append("versión %r, se esperaba %s" % (datos.get("version"), version))
    plataformas = datos.get("platforms") or {}
    for clave in PLATAFORMAS_CANAL:
        p = plataformas.get(clave)
        if not isinstance(p, dict):
            problemas.append("falta %s" % clave)
            continue
        if not str(p.get("signature") or "").strip():
            problemas.append("%s sin firma" % clave)
        nombre = str(p.get("url") or "").rsplit("/", 1)[-1]
        if nombre not in publicados:
            problemas.append("%s apunta a %r, que no está en la release" % (clave, nombre or None))
    return problemas


def medio_de_job(nombre):
    """Nombre de job de native-build.yml → medio del panel (None si no es de un medio)."""
    n = (nombre or "").lower()
    if "canales" in n:
        return "canales"
    for clave, medio in (("macos", "macos"), ("windows", "windows"), ("ubuntu", "linux"),
                         ("android", "android"), ("ios", "ios")):
        if clave in n:
            return medio
    return None


def pasos_de_jobs(jobs):
    """`gh run view --json jobs` → pasos del panel: [{medio, job, estado, url, inicio, fin}]."""
    pasos = []
    for j in jobs or []:
        concl, st = j.get("conclusion") or "", j.get("status") or ""
        if st != "completed":
            estado = "en-curso" if st == "in_progress" else "en-cola"
        else:
            estado = {"success": "ok", "skipped": "omitido", "cancelled": "cancelado"}.get(concl, "fallo")
        pasos.append({"medio": medio_de_job(j.get("name")), "job": j.get("name"), "estado": estado,
                      "id": j.get("databaseId"), "url": j.get("url"),
                      "inicio": j.get("startedAt"), "fin": j.get("completedAt")})
    return pasos


#: En este orden: lo más específico primero. Una credencial rota no se arregla reintentando, y un error de
#: compilación tampoco; la red sí. «Sin firma» es lo último: el workflow omite la firma sin fallar.
_FALLOS = (
    ("credencial", re.compile(r"keystore was tampered|incorrect key password|TAURI_SIGNING_PRIVATE_KEY.*"
                              r"(invalid|incorrect)|resource not accessible by integration|bad credentials", re.I)),
    ("codigo", re.compile(r"error\[E\d+\]|error: could not compile|TS\d{4}:|failed to bundle|"
                          r"SyntaxError|cannot find module", re.I)),
    ("reintentar", re.compile(r"timed? ?out|ETIMEDOUT|ECONNRESET|connection reset|rate limit|\b50[234]\b|"
                              r"runner .*(lost|shutdown)|could not resolve host|network is unreachable|"
                              r"failed to download|operation was canceled", re.I)),
    ("sin-firma", re.compile(r"no signing identity|code ?sign(ing)? (is )?(skipped|disabled)", re.I)),
)


def clasificar_fallo(log):
    """(clase, motivo) del log de un job que falló (§3). Lo desconocido se reintenta una vez."""
    texto = log or ""
    for clase, patron in _FALLOS:
        m = patron.search(texto)
        if m:
            return clase, m.group(0)[:160]
    return "reintentar", "sin causa reconocible en el log"


def lista_terminada(tareas, progreso, ids_en_main):
    """¿La lista de tareas está terminada? Cada tarea integrada EN MAIN o descartada (§2.1).
    → (terminada, pendientes)."""
    pendientes = []
    for t in tareas or []:
        tid = t.get("id")
        est = ((progreso or {}).get(tid) or {}).get("estado")
        if est in ("descartada", "no-aplica", "no_aplica"):
            continue
        if tid in ids_en_main:
            continue
        pendientes.append(tid)
    return (not pendientes and bool(tareas)), pendientes


def ultimo_publicado(autopub):
    """El último sha que la autopublicación PUBLICÓ Y VERIFICÓ (pruebas, CI, Vercel y humo), o None.
    Con el enjambre vivo `main` local casi nunca es igual a `origin/main`: lo que cuenta es lo verificado."""
    a = autopub or {}
    if a.get("fase") == "publicado" and a.get("sha"):
        return a["sha"]
    for h in reversed(a.get("historial") or []):
        if h.get("resultado") == "publicado" and h.get("sha"):
            return h["sha"]
    return None


def publicado_y_verificado(autopub, objetivo=None, contiene=None):
    """§2.2: ¿`objetivo` (un sha) está dentro de lo último publicado y verificado? `contiene` lo calcula
    el director con `git merge-base --is-ancestor objetivo <último publicado>`."""
    ultimo = ultimo_publicado(autopub)
    if not ultimo:
        return False, "la autopublicación aún no ha publicado y verificado nada"
    if objetivo and not contiene:
        return False, "%s aún no está publicado y verificado (último: %s)" % (objetivo[:9], ultimo[:9])
    return True, "publicado y verificado (%s)" % ultimo[:9]


def puede_lanzar_hoy(historial, ahora, tope=1):
    """Tope de lanzamientos nativos por día (§2)."""
    dia = int(ahora // 86400)
    hoy = [h for h in historial or [] if int((h.get("t") or 0) // 86400) == dia and h.get("tipo") == "lanzado"]
    return len(hoy) < tope


def aplicar_version(textos, nueva, fecha, notas):
    """Nuevos contenidos de los tres archivos de versión (§2.3). `textos` = {ruta: contenido}.
    Lanza ValueError si un ancla no está exactamente una vez (no se adivina)."""
    fecha_os = fecha.replace("-", ".")
    reglas = {
        "native/src-tauri/tauri.conf.json": [(r'("version":\s*")\d+\.\d+\.\d+(")', r"\g<1>%s\g<2>" % nueva)],
        "native/src-tauri/Cargo.toml": [(r'(?m)^(version\s*=\s*")\d+\.\d+\.\d+(")', r"\g<1>%s\g<2>" % nueva)],
        "src/lib/version/os-release.ts": [
            (r'(export const NATIVE_VERSION = ")[^"]+(";)', r"\g<1>%s\g<2>" % nueva),
            (r'(export const OS_VERSION = ")[^"]+(";)', r"\g<1>%s\g<2>" % fecha_os),
            (r'(export const OS_FECHA = ")[^"]+(";)', r"\g<1>%s\g<2>" % fecha),
            (r'(export const OS_NOTAS =\s*\n\s*")(?:[^"\\]|\\.)*(";)',
             lambda m: m.group(1) + notas.replace("\\", "\\\\").replace('"', '\\"') + m.group(2)),
        ],
    }
    fuera = {}
    for ruta, cambios in reglas.items():
        s = textos[ruta]
        for patron, por in cambios:
            s, n = re.subn(patron, por, s, count=1)
            if n != 1:
                raise ValueError("%s: el ancla %r no está" % (ruta, patron[:40]))
        fuera[ruta] = s
    return fuera


def notas_de(asuntos, version, maximo=12):
    """Notas de la versión a partir de los asuntos de las tareas integradas («· ID: título»)."""
    titulos = []
    for a in asuntos or []:
        if (a or "").lower().startswith(("salvavidas", "chore(memoria)", "merge")):
            continue  # el trabajo a medias del agente y la memoria no son novedades
        m = re.search(r"· [A-Z]{1,7}\d{3,5}[A-Za-z0-9-]*: (.+)$", a or "")
        t = re.sub(r"^Rescate de pruebas · ", "", (m.group(1) if m else "").strip())
        if t and t not in titulos:
            titulos.append(t)
    cuerpo = "; ".join(titulos[:maximo]) or "mejoras y correcciones"
    mas = " (y %d más)" % (len(titulos) - maximo) if len(titulos) > maximo else ""
    return "StarSeed OS %s: %s%s." % (version, cuerpo, mas)


def tono_pastilla(estado):
    """Tono de la pastilla «Versiones»: peligro si algo está atascado, aviso si hay lanzamiento en curso."""
    fase = (estado or {}).get("fase")
    if fase == "atascado" or any((m or {}).get("estado") == "atascado"
                                 for m in ((estado or {}).get("medios") or {}).values()):
        return "peligro"
    if fase in FASES and fase not in ("lanzado", "esperando-lista"):
        return "aviso"
    return "normal"
