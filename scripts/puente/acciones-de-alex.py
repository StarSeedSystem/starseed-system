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

#: (2026-09-21) Los comandos de esta lista eran RELATIVOS —«python3 scripts/puente/…»— y Alex
#: los pega en la terminal desde su carpeta personal, donde no existe esa ruta:
#:
#:     can't open file '/Users/alex/scripts/puente/nube-gh.py': No such file or directory
#:
#: Una orden que solo funciona si ya estabas en el sitio correcto no es una orden, es un acertijo.
#: Desde aqui todas llevan el `cd` delante, de una pieza, para pegar y ejecutar donde sea.
PREFIJO = "cd %s && " % RAIZ


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


def _entorno_con_env():
    """El entorno del proceso MÁS `~/.starseed/env`, que es donde viven de verdad las
    variables del enjambre: el director corre desde launchd y no las hereda."""
    datos = dict(os.environ)
    # Los MISMOS sitios de los que tiran los servicios. El de Telegram arranca con
    # `source ~/.hermes/.env` (ver com.starseed.telegram.plist), así que mirar solo
    # `~/.starseed/env` daba una falsa alarma: decía que no había canal habiéndolo.
    for archivo in ("~/.starseed/env", "~/.hermes/.env"):
        try:
            with open(os.path.expanduser(archivo), encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if linea.startswith("export "):
                        linea = linea[7:]
                    if "=" in linea and not linea.startswith("#"):
                        k, _, v = linea.partition("=")
                        datos.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue
    return datos


def accion_sin_canal(entorno):
    """PURA: la acción que aparece cuando NO hay forma de avisar a Alex. O None.

    (2026-09-22) Alex: «el "te toca a ti" no me ha avisado del fichaje de la api ni de
    nada». Y era cierto, pero no porque no lo detectara: el canal quedó medido así:

        canal.jsonl       → «nueva: NVIDIA Build (NIM): renovar la clave» (10:04 y 10:10)
                            «nueva: apinex: renovar la clave»             (10:54)
        ~/.starseed/env   → sin TELEGRAM_BOT_TOKEN ni TELEGRAM_CHAT_ID
        /tmp/starseed-telegram.log → 0 bytes desde el 20 de septiembre

    O sea: el aviso se escribía en un archivo del disco que nadie lee, el puente de
    Telegram llevaba dos días vivo sin poder mandar nada, y el director marcaba la acción
    como «avisada» —así que no la repetía nunca más—. Avisar a un archivo no es avisar.

    Esto no lo puedo arreglar yo: el token y el chat son credenciales suyas y no las toco.
    Lo que sí puedo es dejar de fingir que le avisé y ponerle el comando delante.
    """
    e = entorno or {}
    faltan = [v for v in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID") if not str(e.get(v) or "").strip()]
    if not faltan:
        return None
    return {
        "id": "canal-de-avisos-sin-configurar",
        "titulo": "No hay forma de avisarte: falta el canal de Telegram",
        "por_que": ("los avisos («renovar la clave», «fichaje diario») se escriben en "
                    "canal.jsonl y ahí se quedan: falta %s, así que el puente de Telegram "
                    "no puede mandarte nada" % " y ".join(faltan)),
        "urgencia": "alta",
        "comando": PREFIJO + "bash scripts/puente/telegram-alta.sh",
        "enlace": "https://t.me/BotFather",
        "por_que_no_lo_hago_yo": "son credenciales tuyas: yo no escribo tokens de terceros",
        "detalle": "sin esto, todo lo de esta lista te lo tienes que encontrar tú mirando el Puente",
        "variable": None,
    }


def construir_acciones(pasarelas, secretos_repo, catalogo=None, entorno=None):
    """Función PURA: la lista de acciones, ordenada por urgencia. Sin red, sin disco."""
    catalogo = catalogo if catalogo is not None else _pas.CATALOGO
    acciones = []

    # El canal de avisos es una preocupación aparte de la lista de tareas: solo se mira
    # cuando quien llama pasa un entorno. Así esta función sigue siendo pura y quien solo
    # quiere saber «qué pasarelas piden mano de Alex» no se lleva nada de propina.
    sin_canal = accion_sin_canal(entorno) if entorno is not None else None
    if sin_canal:
        acciones.append(sin_canal)

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
            "comando": PREFIJO + "python3 scripts/puente/nube-gh.py secretos",
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
            # (2026-09-22) Alex: «aparecen enlaces para renovar apis pero no viene el botón
            # para añadir las apis». Tenía razón: el comando solo salía para `sin_clave`.
            # Una pasarela CAÍDA acaba casi siempre en lo mismo —la clave cambió o la
            # revocaron— así que llevaba enlace a su web y ningún modo de guardar la nueva.
            # Ahora, si sabemos el nombre de la variable, va SIEMPRE el guion que la pide
            # sin que se vea al teclearla. Para el fichaje diario no: ahí no hay clave que
            # guardar, hay un botón que pulsar en su web.
            "comando": (PREFIJO + "bash scripts/puente/guardar-clave.sh %s --ambos" % p["variable"]
                        if estado != _pas.FICHAJE and p.get("variable") else ""),
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


def clave_de_accion(id_accion):
    """PURA: «pasarela-apinex-fichaje» → «apinex». None si la acción no es de una pasarela.
    El estado va al final y puede llevar guion bajo (`sin_clave`), nunca guion."""
    texto = str(id_accion or "")
    if not texto.startswith("pasarela-"):
        return None
    resto = texto[len("pasarela-"):]
    clave, _, estado = resto.rpartition("-")
    return clave or None


def actualizar_pasarela(pasarelas, clave, medida):
    """PURA: la lista de pasarelas con la entrada de `clave` sustituida por la medida nueva
    (http, estado, segundos, comprobado). Si no estaba, se añade."""
    fuera, vista = [], False
    for p in pasarelas or []:
        if isinstance(p, dict) and p.get("clave") == clave:
            nueva = dict(p)
            nueva.update(medida)
            fuera.append(nueva)
            vista = True
        else:
            fuera.append(p)
    if not vista:
        fuera.append(dict(medida, clave=clave))
    return fuera


def resondear(clave, segundos=20):
    """Mide AHORA una pasarela con la misma sonda del renovador (ocho tokens) y deja el
    resultado en el informe, para que el Mando y el enjambre vean lo mismo que el botón.

    (2026-09-23) Alex: «no funciona la comprobación del check-in de apinex: responde error
    cuando compruebo que ya lo hice». Medido: el informe era de las 15:51, él fichó y pulsó
    «Ya lo hice» a las 15:53, y `verificar` —que decía «vuelve a MEDIR»— leía ese informe
    viejo: contestaba «http 402 · modelo free/glm-5.3-flash» con apinex escribiendo ya
    (HTTP 200 al sondearla a mano). Un botón de comprobar que no comprueba.

    Devuelve la medida {http, estado, segundos, comprobado} o None si no hay sonda para esa
    clave. Nunca imprime ni guarda el valor de ninguna clave."""
    import time as _t

    try:
        spec = importlib.util.spec_from_file_location(
            "renovador", os.path.join(os.path.dirname(os.path.abspath(__file__)), "renovador-pasarelas.py"))
        renovador = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(renovador)
    except Exception:
        return None
    sonda = next((s for s in renovador.SONDAS if s[0] == clave), None)
    if sonda is None:
        return None
    _nombre, url, variable, modelo = sonda
    entorno = renovador.entorno_con_claves()
    t0 = _t.time()
    http, cuerpo, tokens = renovador.sondear(url, entorno.get(variable) if variable else None, modelo, segundos)
    medida = {
        "modelo": modelo,
        "variable": variable,
        "tiene_clave": bool(entorno.get(variable)) if variable else True,
        "http": http,
        "estado": _pas.clasificar(http, cuerpo, tokens),
        "segundos": round(_t.time() - t0, 1),
        "comprobado": _t.strftime("%Y-%m-%d %H:%M:%S"),
    }
    try:
        informe = json.load(open(INFORME, encoding="utf-8")) or {}
    except Exception:
        informe = {}
    informe["pasarelas"] = actualizar_pasarela(informe.get("pasarelas") or [], clave, medida)
    try:
        tmp = INFORME + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(informe, f, ensure_ascii=False, indent=1)
        os.replace(tmp, INFORME)
    except OSError:
        pass
    return medida


def verificar(id_accion=None, pasarelas=None, secretos_repo=None, entorno=None, medir=None):
    """¿Sigue haciendo falta esa accion? Vuelve a MEDIR, no consulta un archivo viejo.

    (2026-09-21, pedido por Alex) «en el puente de mando en su ventana debe haber un boton
    de verificar para cuando sea realizada la tarea». El boton llama aqui.

    La gracia esta en que NO se cree nada de lo guardado: recoge los hechos otra vez
    —pasarelas vivas y secretos que hay hoy en el repo— y reconstruye la lista. Si la
    accion ya no sale, es que esta hecha, y se dice con lo que se comprobo. Un boton que
    solo marcara una casilla no serviria de nada: es justo la forma de mentir que nos ha
    costado el dia entero.

    Devuelve {id, hecha, titulo, detalle, comprobado, quedan}. Sin `id_accion`, informa de
    todas.
    """
    # Solo en una comprobación de verdad (sin datos inyectados) se reescribe la lista que pinta
    # el Mando: si no, «Ya lo hice» decía «hecho» y la tarjeta seguía ahí hasta la siguiente
    # vuelta del director (hasta 3 min), que es otra forma de no creerse el botón.
    real = pasarelas is None and secretos_repo is None
    # Si la acción es de una pasarela, se MIDE de nuevo esa pasarela antes de nada.
    # `medir` se inyecta en las pruebas; por defecto es la sonda real.
    medida = None
    clave = clave_de_accion(id_accion)
    if clave and pasarelas is None:
        medida = (medir or resondear)(clave)
    pasarelas = pasarelas if pasarelas is not None else _pasarelas()
    if medida:
        pasarelas = actualizar_pasarela(pasarelas, clave, medida)
    secretos_repo = secretos_repo if secretos_repo is not None else _secretos()
    # (2026-09-22) Sin el entorno, `canal-de-avisos-sin-configurar` no se reconstruía y el
    # botón «Ya lo hice» contestaba «ya no hace falta» para algo que seguía sin arreglar.
    # Un botón que dice que algo está hecho porque él mismo no sabe mirarlo es justo la
    # forma de mentir que llevamos toda la sesión quitando.
    vivas = construir_acciones(
        pasarelas, secretos_repo,
        entorno=entorno if entorno is not None else _entorno_con_env(),
    )
    por_id = {a["id"]: a for a in vivas}
    momento = __import__("time").strftime("%Y-%m-%d %H:%M:%S")
    if real:
        guardar_lista(vivas)
    if id_accion is None:
        return {
            "comprobado": momento,
            "quedan": len(vivas),
            "acciones": [
                {"id": a["id"], "hecha": False, "titulo": a["titulo"], "detalle": a.get("detalle", "")}
                for a in vivas
            ],
        }
    viva = por_id.get(id_accion)
    medido = ""
    if medida:
        medido = "medido ahora: http %s con %s → %s" % (
            medida.get("http"), medida.get("modelo"), str(medida.get("estado")).replace("_", " "))
    if viva is None:
        return {
            "id": id_accion,
            "hecha": True,
            "titulo": "",
            "detalle": ("hecho: %s" % medido) if medido else "comprobado de nuevo: ya no hace falta",
            "comprobado": momento,
            "quedan": len(vivas),
        }
    return {
        "id": id_accion,
        "hecha": False,
        "titulo": viva["titulo"],
        "detalle": ("sigue pendiente · %s" % medido) if medido else (viva.get("detalle", "") or viva.get("por_que", "")),
        "comprobado": momento,
        "quedan": len(vivas),
    }


def guardar_lista(acciones):
    """Deja la lista donde la lee el Mando (`/api/mando/acciones`). Nunca lanza."""
    try:
        datos = {"generado": __import__("time").strftime("%Y-%m-%d %H:%M"), "acciones": acciones}
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        tmp = SALIDA + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, SALIDA)
    except OSError:
        pass


def main():
    if "--verificar" in sys.argv:
        i = sys.argv.index("--verificar")
        cual = sys.argv[i + 1] if len(sys.argv) > i + 1 else None
        print(json.dumps(verificar(cual), ensure_ascii=False, indent=1))
        return 0
    acciones = construir_acciones(_pasarelas(), _secretos(), entorno=_entorno_con_env())
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
