#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lo único que hace falta de Alex, en un solo sitio y con el enlace o la orden ya escrita.

Alex (2026-09-20): «para todo lo que requiera de mi acción recuerda enviarme los enlaces
directos y/o los comandos para la terminal… (como lo de github para los contenedores o lo
del check-in diario para la api o verificaciones humanas)».

El sistema YA sabe cuándo hace falta: `pasarelas.py` clasifica cada pasarela y guarda su
enlace, el informe del renovador dice cuál está en `fichaje` o `sin_clave`, y `gh` dice qué
secretos faltan en el repo. Lo que no había era un sitio donde mirarlo TODO junto. Esto lo
arma y lo deja en `starseed_memory_root/mando/acciones-de-alex.json`, que el Mando pinta y
cualquier IDE puede leer.

Regla de este archivo: una acción solo entra si Claude NO puede hacerla. Todo lo que se
pueda resolver desde aquí no se le pide — y lo que se le pide viene con enlace o con la
orden lista para pegar, nunca con una descripción de lo que tendría que hacer.

  python3 scripts/puente/acciones-de-alex.py          # imprime y guarda
  python3 scripts/puente/acciones-de-alex.py --json   # solo el JSON
"""
import importlib.util
import json
import os
import subprocess
import sys

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INFORME = os.path.expanduser("~/.starseed/pasarelas-informe.json")
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "acciones-de-alex.json")

_spec = importlib.util.spec_from_file_location(
    "pasarelas", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pasarelas.py"))
_pas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pas)

#: Los nombres que el workflow de la nube lee. Solo NOMBRES, jamás un valor.
#:
#: (2026-09-21) Esta lista estaba ESCRITA DOS VECES —aquí y en `nube-gh.py`— y las dos
#: se desincronizaron: aquí seguía NVIDIA_SHARED_KEY, que no existe en ninguna máquina,
#: así que el medidor «Te toca a ti» le pedía a Alex, con urgencia alta y para siempre,
#: subir una clave que nadie tiene. Ahora la lista es UNA y vive en `nube-gh.py`, que es
#: quien de verdad las sube. Si la importación falla, se cae a una copia mínima para no
#: dejar el medidor mudo, pero la fuente buena es siempre la otra.
try:
    _spec_nube = importlib.util.spec_from_file_location(
        "nube_gh", os.path.join(os.path.dirname(os.path.abspath(__file__)), "nube-gh.py"))
    _nube = importlib.util.module_from_spec(_spec_nube)
    _spec_nube.loader.exec_module(_nube)
    CLAVES_DEL_ENJAMBRE = set(_nube.SECRETOS)
except Exception:
    CLAVES_DEL_ENJAMBRE = {
        "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
        "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
    }

#: Las que de verdad hacen escribir al enjambre. Si alguna de estas falta, la nube no
#: trabaja y el aviso es urgente. Las demás (AIHUBMIX, TOKENROUTER) son pasarelas de
#: repuesto para cuando las de siempre se quedan sin cupo: útiles, no urgentes.
ESENCIALES_DEL_ENJAMBRE = {
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY",
    "NVIDIA_API_KEY", "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY", "XKIRO_API_KEY",
}

#: Qué estados de pasarela necesitan a un humano, y con qué urgencia. `sin_cupo` NO está:
#: una cuota se repone sola y mandarle a hacer algo por eso es hacerle perder el tiempo.
ESTADOS_HUMANOS = {
    _pas.FICHAJE: ("alta", "exige un fichaje diario en su web; sin él, cada tarea que caiga ahí vuelve sin cambios"),
    _pas.SIN_CLAVE: ("alta", "la clave falta, caducó o fue revocada: hay que renovarla"),
    # (2026-09-21) `caida` faltaba, y Alex lo notó: «aún falta que me envíe lo de las apps
    # que hagan falta de renovarse». Una pasarela que no responde DE NINGUNA FORMA no se
    # arregla sola como un cupo: o cambió su API, o la cuenta necesita algo en su web. Va
    # con urgencia media, no alta: el enjambre sigue escribiendo con las demás.
    _pas.CAIDA: ("media", "no responde de ninguna forma: mira su panel por si la cuenta o la API han cambiado"),
}


def construir_acciones(pasarelas, secretos_repo, catalogo=None):
    """Función PURA: la lista de acciones, ordenada por urgencia. Sin red, sin disco."""
    catalogo = catalogo if catalogo is not None else _pas.CATALOGO
    acciones = []

    faltan = sorted(CLAVES_DEL_ENJAMBRE - set(secretos_repo or []))
    if faltan:
        # (2026-09-21) La urgencia era SIEMPRE «alta» y el porqué decía que sin esas claves
        # la nube «arranca, instala y muere». Eso dejó de ser verdad el día 20, cuando Alex
        # subió las siete que de verdad escriben: el run 35568545557 trabajó 36 minutos con
        # ellas. Seguir pidiéndoselo en rojo por dos pasarelas de repuesto es gastarle la
        # atención, y una lista que pide cosas que no hacen falta deja de leerse.
        criticas = sorted(ESENCIALES_DEL_ENJAMBRE & set(faltan))
        acciones.append({
            "id": "github-secretos",
            "titulo": (
                "Subir las claves de proveedor a los secretos del repo"
                if criticas
                else "Añadir dos pasarelas de repuesto a los secretos del repo"
            ),
            "por_que": (
                ("sin ellas la nube arranca, instala y muere en el paso de claves: "
                 "faltan las que de verdad escriben (%s)" % ", ".join(criticas))
                if criticas
                else ("la nube YA funciona con las que subiste; estas dos solo añaden "
                      "pasarelas de repuesto para cuando las de siempre se queden sin cupo")
            ),
            "urgencia": "alta" if criticas else "baja",
            "comando": "python3 scripts/puente/nube-gh.py secretos",
            "enlace": "https://github.com/StarSeedSystem/starseed-system/settings/secrets/actions",
            "por_que_no_lo_hago_yo": "mueve valores de claves tuyas a un tercero: esa decisión es tuya",
            "detalle": "faltan %d: %s" % (len(faltan), ", ".join(faltan)),
        })

    for p in pasarelas or []:
        estado = str(p.get("estado") or "")
        if estado not in ESTADOS_HUMANOS:
            continue
        clave = str(p.get("clave") or "")
        info = catalogo.get(clave) or {}
        urgencia, porque = ESTADOS_HUMANOS[estado]
        acciones.append({
            "id": "pasarela-%s-%s" % (clave, estado),
            "titulo": "%s: %s" % (info.get("nombre", clave), "fichaje diario" if estado == _pas.FICHAJE else "renovar la clave"),
            "por_que": info.get("nota") or porque,
            "urgencia": urgencia,
            "comando": ("bash scripts/puente/guardar-clave.sh %s --ambos" % p["variable"]
                        if estado == _pas.SIN_CLAVE and p.get("variable") else ""),
            "enlace": info.get("enlace", ""),
            "por_que_no_lo_hago_yo": ("hay que pulsar un botón en su web con tu sesión"
                                      if estado == _pas.FICHAJE
                                      else "Claude no teclea claves de terceros; el guion las pide sin que se vean"),
            "detalle": "http %s · modelo %s" % (p.get("http"), p.get("modelo")),
        })

    orden = {"alta": 0, "media": 1, "baja": 2}
    acciones.sort(key=lambda a: (orden.get(a["urgencia"], 9), a["id"]))
    return acciones


def _pasarelas():
    try:
        return (json.load(open(INFORME, encoding="utf-8")) or {}).get("pasarelas") or []
    except Exception:
        return []


def _secretos():
    try:
        r = subprocess.run(["gh", "secret", "list", "--json", "name", "--jq", ".[].name"],
                           cwd=RAIZ, capture_output=True, text=True, timeout=60)
        return [l.strip() for l in (r.stdout or "").splitlines() if l.strip()]
    except Exception:
        return []


def main():
    acciones = construir_acciones(_pasarelas(), _secretos())
    datos = {"generado": __import__("time").strftime("%Y-%m-%d %H:%M"), "acciones": acciones}
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(datos, open(SALIDA, "w"), ensure_ascii=False, indent=1)
    if "--json" in sys.argv:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    if not acciones:
        print("Nada que necesite a Alex ahora mismo.")
        return 0
    print("ACCIONES QUE SOLO PUEDE HACER ALEX (%d)\n" % len(acciones))
    for a in acciones:
        print("· %s  [%s]" % (a["titulo"], a["urgencia"]))
        print("  por qué: %s" % a["por_que"])
        if a.get("enlace"):
            print("  enlace : %s" % a["enlace"])
        if a.get("comando"):
            print("  orden  : %s" % a["comando"])
        print("  (yo no: %s)\n" % a["por_que_no_lo_hago_yo"])
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
