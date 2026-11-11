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
                          r"SyntaxError|cannot find module|unable to find library|error: linking with", re.I)),
    ("reintentar", re.compile(r"timed? ?out|ETIMEDOUT|ECONNRESET|connection reset|rate limit|\b50[234]\b|"
                              r"runner .*(lost|shutdown)|could not resolve host|network is unreachable|"
                              r"failed to download|operation was canceled", re.I)),
    ("sin-firma", re.compile(r"no signing identity|code ?sign(ing)? (is )?(skipped|disabled)", re.I)),
)


def clasificar_fallo(log):
    """(clase, motivo) del log de un job que falló (§3). Lo desconocido se reintenta una vez."""
    texto = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", log or "")  # (1106) cargo pinta el log con colores ANSI
    for clase, patron in _FALLOS:
        m = patron.search(texto)
        if m:
            return clase, m.group(0)[:160]
    return "reintentar", "sin causa reconocible en el log"


_ID_EN_NOTA = re.compile(r"\b([A-Z]{1,7}\d{3,5}[A-Za-z0-9-]*)\b")
_RAIZ_ID = re.compile(r"^([A-Z]{1,7}\d{3,5}[A-Z])")
_SUFIJO_SUCESOR = re.compile(r"^(?:[b-z]|-d\d+)$")


def sucesores(tid, progreso, ids_en_main=()):
    """Las tareas que continúan a `tid` cuando quedó «sustituida»: las que nombra su nota («continúa como
    VER1105Lb», «dividida en VER1105Fb-d1, VER1105Fb-d2») y, si la nota no dice nada, las que llevan su id
    más una letra o un «-dN» (VER1105L → VER1105Lb; VER1105Fb → VER1105Fb-d1)."""
    entrada = (progreso or {}).get(tid) or {}
    raiz = _RAIZ_ID.match(tid or "")
    raiz = raiz.group(1) if raiz else tid
    en_nota = {x for x in _ID_EN_NOTA.findall(str(entrada.get("nota") or ""))
               if x != tid and x.startswith(raiz) and not tid.startswith(x)}
    if en_nota:
        return sorted(en_nota)
    conocidos = set(progreso or {}) | set(ids_en_main or ())
    return sorted(x for x in conocidos if x != tid and x.startswith(tid) and _SUFIJO_SUCESOR.match(x[len(tid):]))


def tarea_hecha(tid, progreso, ids_en_main, _vistos=None):
    """¿`tid` está en main, descartada, o «sustituida» por sucesores que lo están todos? (§2.1)"""
    vistos = set(_vistos or ())
    if tid in vistos:
        return False
    vistos.add(tid)
    est = ((progreso or {}).get(tid) or {}).get("estado")
    if est in ("descartada", "no-aplica", "no_aplica") or tid in ids_en_main:
        return True
    if est != "sustituida":
        return False
    hijos = sucesores(tid, progreso, ids_en_main)
    return bool(hijos) and all(tarea_hecha(h, progreso, ids_en_main, vistos) for h in hijos)


def lista_terminada(tareas, progreso, ids_en_main):
    """¿La lista de tareas está terminada? Cada tarea integrada EN MAIN o descartada (§2.1), siguiendo
    las cadenas «sustituida» hasta sus sucesores. → (terminada, pendientes)."""
    pendientes = [t.get("id") for t in tareas or [] if not tarea_hecha(t.get("id"), progreso, ids_en_main)]
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


#: (1106N) Asuntos y olas que no son novedades para las personas. Fácil de ampliar.
NOTAS_PREFIJOS_INTERNOS = ("salvavidas", "chore", "merge", "lanzamiento", "rescate")
NOTAS_OLAS_INTERNAS = ("Supervisión", "Seguimiento", "Capacidad", "Carril", "Opus", "Contratos pendientes",
                       "Rescate", "Imaginación")


def nombre_de_ola(ola, titulo=""):
    """PURA: «Ola 1105V · Centro de Versiones (panel…)» → «Centro de Versiones». Una ola sin nombre («1020U») toma
    el título de su tarea. Sin paréntesis (ni uno sin cerrar), sin «· lo que faltó: …»."""
    nombre = re.sub(r"^(?:Ola\s+)?[A-Z]{0,4}\d{3,5}[A-Z]?\d?\s*(?:·\s*)?", "", (ola or "").strip()).strip()
    nombre = nombre or (titulo or "")
    nombre = re.sub(r"\s*·\s*lo que faltó:.*$", "", nombre)
    nombre = re.sub(r"\s*\([^)]*\)", "", nombre)
    nombre = re.sub(r"\s*\([^)]*$", "", nombre).strip(" .;·,")
    if len(nombre) > 70 and ":" in nombre:
        nombre = nombre.split(":", 1)[0].strip()
    return nombre


def notas_de(asuntos, version, maximo=6):
    """PURA (1106N): notas legibles. Agrupa «<ola> · ID: título» por ola, quita lo interno, ordena las olas por
    cuántas tareas tienen (y, a igualdad, la más reciente) y escribe «StarSeed OS X.Y.Z: a, b y c.»."""
    olas = {}  # clave → [nombre, tareas, orden de aparición]
    for a in asuntos or []:
        a = (a or "").strip()
        if a.lower().startswith(NOTAS_PREFIJOS_INTERNOS):
            continue
        m = re.search(r"\s·\s[A-Z]{1,7}\d{3,5}[A-Za-z0-9-]*: (.+)$", a)
        if not m:
            continue
        ola = a[:m.start()].strip()
        if any(p in ola for p in NOTAS_OLAS_INTERNAS):
            continue
        nombre = nombre_de_ola(ola, m.group(1))
        if not nombre:
            continue
        fila = olas.setdefault(nombre.lower(), [nombre, 0, len(olas)])
        fila[1] += 1
    nombres = [x[0] for x in sorted(olas.values(), key=lambda x: (-x[1], x[2]))[:maximo]]
    if not nombres:
        return "StarSeed OS %s: mejoras y correcciones." % version
    cuerpo = nombres[0] if len(nombres) == 1 else ", ".join(nombres[:-1]) + " y " + nombres[-1]
    return "StarSeed OS %s: %s." % (version, cuerpo)


def notas_de_parche(notas_previas, version_previa, version, arreglo=""):
    """PURA (1106): el parche de una versión que se atascó y NUNCA se lanzó lleva sus notas (las personas pasan de la
    última lanzada a esta) y lo arreglado. Sin notas previas → None."""
    if not notas_previas or not version_previa:
        return None
    texto = notas_previas.strip().replace("StarSeed OS %s" % version_previa, "StarSeed OS %s" % version, 1)
    extra = nombre_de_ola("", arreglo)
    if not extra:
        return texto
    if " Además: " in texto:  # parche sobre otro parche sin lanzar: una sola cláusula «Además»
        return texto.rstrip(".") + "; %s." % extra
    return texto.rstrip(".") + ". Además: %s." % extra


def tono_pastilla(estado):
    """Tono de la pastilla «Versiones»: peligro si algo está atascado, aviso si hay lanzamiento en curso."""
    fase = (estado or {}).get("fase")
    if fase == "atascado" or any((m or {}).get("estado") == "atascado"
                                 for m in ((estado or {}).get("medios") or {}).values()):
        return "peligro"
    if fase in FASES and fase not in ("lanzado", "esperando-lista"):
        return "aviso"
    return "normal"


def cuerpo_de_release(version, notas):
    """PURA (1106): el texto de la Release de GitHub. La Biblioteca (/api/os/versiones) enseña ESTE texto como las
    notas de la versión: sin él, la versión sale sin notas."""
    v = str(version)
    apps = (("OS", "os"), ("Nexus", "nexus"), ("Cafe", "cafe"))
    filas = (("macOS (Apple Silicon e Intel)", "`StarSeed.{P}_{v}_universal.dmg`"),
             ("Windows x64", "`StarSeed.{P}_{v}_x64-setup.exe` · `.msi`"),
             ("Linux x64 (Ubuntu 24.04 o más nuevo)", "`.AppImage` · `.deb` · `.rpm`"),
             ("Android", "`StarSeed-{a}-{v}.apk`"),
             ("iPhone / iPad", "la web instalable (PWA)"))
    tabla = ["| Sistema | StarSeed OS | StarSeed Nexus | StarSeed Café |", "|---|---|---|---|"]
    for sistema, plantilla in filas:
        celdas = [plantilla.replace("{P}", p).replace("{a}", a).replace("{v}", v) for p, a in apps]
        tabla.append("| %s | %s |" % (sistema, " | ".join(celdas)))
    return "\n".join(["## StarSeed OS %s · OS, Nexus y Café" % v, "", (notas or "mejoras y correcciones.").strip(), "",
                      "### Descargas", ""] + tabla + [
        "", "### Notas", "",
        "- **Si ya tienes una versión anterior**, la app de escritorio se pone al día sola (o al momento, desde el "
        "aviso «Hay una versión nueva»).",
        "- **Android** avisa desde la app cuando hay un APK nuevo: instalarlo es un toque.",
        "- **Sin firma de pago.** En macOS, la primera vez: clic derecho → Abrir. En Windows: «Más información» → "
        "«Ejecutar de todas formas». Las actualizaciones van firmadas con la clave de StarSeed.", ""])


# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# (VER1111F · 2026-11-11) Aprobar una versión de prueba → lanzar las oficiales desde el commit probado.
# Contrato: architecture/centro-versiones-1105.md §10. Alex aprueba en Genesis (solo la Genesis local); la
# ruta escribe la petición `aprobar-prueba` y el director la toma en su pasada como su visto bueno para ESE
# commit, por los pasos de siempre (§2). La pausa general sigue: una aprobación lanza UNA versión.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
_PRUEBA = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)-prueba\.(\d+)$")
_SHA40 = re.compile(r"^[0-9a-f]{40}$")
#: Fases desde las que una aprobación puede arrancar: nada preparado todavía.
FASES_APROBABLES = ("esperando-lista", "lanzado", "esperando-publicacion")


def version_oficial_de_prueba(version):
    """PURA: '0.5.1-prueba.36' → '0.5.1' (la oficial que corona esa prueba). None si no es de prueba."""
    m = _PRUEBA.match((version or "").strip())
    return "%s.%s.%s" % m.groups()[:3] if m else None


def _tupla(v):
    m = _SEMVER.match((v or "").strip())
    return tuple(int(x) for x in m.groups()) if m else None


def validar_peticion_aprobacion(p):
    """PURA: la petición del panel → (ok, motivo, normalizada). Solo la escribe la Genesis local (`quien`)."""
    if not isinstance(p, dict) or p.get("accion") != "aprobar-prueba":
        return False, "no es una petición de aprobación", None
    version = str(p.get("version") or "").strip()
    oficial = version_oficial_de_prueba(version)
    if not oficial:
        return False, "versión de prueba no válida: %r" % version[:40], None
    sha = str(p.get("sha") or "").strip().lower()
    lanzar = str(p.get("lanzar_sha") or sha).strip().lower()
    if not _SHA40.match(sha) or not _SHA40.match(lanzar):
        return False, "commit no válido (hacen falta los 40 caracteres)", None
    if p.get("quien") != "genesis":
        return False, "solo la Genesis local puede aprobar", None
    return True, "", {"version": version, "oficial": oficial, "sha": sha, "lanzar_sha": lanzar,
                      "t": p.get("t"), "prueba": int(_PRUEBA.match(version).group(4))}


def decidir_aprobacion(est, peticion, version_actual, en_main, lanzar_desciende):
    """PURA: ¿el director acepta esta aprobación? → (acepta, motivo, aprobacion).

    `en_main`: el commit probado está en origin/main. `lanzar_desciende`: el commit a lanzar es el probado o
    desciende de él (si Alex aceptó lanzar main tal como estaba). Una segunda petición igual no hace nada nuevo."""
    ok, motivo, a = validar_peticion_aprobacion(peticion)
    if not ok:
        return False, motivo, None
    est = est or {}
    for previa in [est.get("aprobacion")] + list(est.get("aprobaciones") or []):
        if (previa and previa.get("version") == a["version"] and previa.get("sha") == a["sha"]
                and previa.get("estado") in ("en-curso", "lanzada")):
            return False, "repetida: esa aprobación ya está tomada (%s)" % previa.get("estado"), None
    actual = est.get("aprobacion") or {}
    if actual.get("estado") == "en-curso":
        return False, "ya hay otra aprobación en curso (%s)" % actual.get("version"), None
    if est.get("fase") not in FASES_APROBABLES or est.get("preparado_sha"):
        return False, "hay un lanzamiento a medias (%s): termina o se reintenta antes" % est.get("fase"), None
    if not en_main:
        return False, "el commit probado %s aún no está en origin/main" % a["sha"][:10], None
    if not lanzar_desciende:
        return False, "el commit a lanzar no contiene el probado", None
    va, vo = _tupla(version_actual), _tupla(a["oficial"])
    if not va or not vo or vo <= va:
        return False, "la %s no es más nueva que la versión del repo (%s)" % (a["oficial"], version_actual), None
    if vo[0] != va[0]:
        return False, "una versión mayor sigue siendo de Alex a mano", None
    aprobacion = dict(a, estado="en-curso", detalle="aprobada en Genesis: lanzo la %s" % a["oficial"])
    return True, "", aprobacion


def aprobacion_en_curso(est):
    """PURA: ¿hay una aprobación que el director lleva adelante (y que pasa por encima de la pausa)?"""
    return ((est or {}).get("aprobacion") or {}).get("estado") == "en-curso"


def cabeza_para_preparar(aprobacion, cabeza):
    """PURA: antes del commit de versión, la cabeza de main debe ser EXACTAMENTE lo aprobado (el director sube
    la versión encima de HEAD: lo que haya encima entraría sin probar). → (ok, motivo)."""
    if not aprobacion:
        return True, ""
    esperado = aprobacion.get("lanzar_sha") or aprobacion.get("sha")
    if (cabeza or "").strip().lower() == esperado:
        return True, ""
    return False, ("main avanzó desde la aprobación (HEAD %s, aprobado %s): no lanzo commits sin probar; "
                   "vuelve a aprobar" % ((cabeza or "?")[:10], (esperado or "?")[:10]))


def cerrar_aprobacion(est, estado, detalle, ahora):
    """PURA: la aprobación en curso pasa a `estado` y queda en el historial `aprobaciones` (últimas 20)."""
    a = dict((est or {}).get("aprobacion") or {})
    if not a:
        return dict(est or {})
    a.update(estado=estado, detalle=detalle, cerrada=ahora)
    hist = list(est.get("aprobaciones") or []) + [a]
    return dict(est, aprobacion=None, aprobaciones=hist[-20:], version_aprobada=None)
