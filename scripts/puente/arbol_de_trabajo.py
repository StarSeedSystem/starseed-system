"""arbol_de_trabajo · quién ensucia el árbol: el propio enjambre o alguien de fuera.

Por qué existe (2026-09-16). El orquestador se niega a arrancar si `main` tiene
cambios sin commitear, y hace bien: nadie quiere agentes escribiendo encima de
trabajo a medias. Pero el 16/09 el único archivo sucio era
`memory/aprendizaje-olas.md`, que escribe el DIRECTOR DE APRENDIZAJE del propio
enjambre al cerrar cada ola. Su commit falló una vez (choque con el commit de la
ola) y el archivo se quedó en el índice: el guardia vio «1 archivo sin commit»,
se negó a arrancar, el vigilante vio lo mismo y tampoco relanzó, y el enjambre
estuvo diez horas parado por su propia contabilidad.

La regla que sale de ahí: un guardia que protege el trabajo AJENO no debe
tropezar con lo PROPIO. Este módulo separa una cosa de la otra y no decide nada
más; quien llama elige qué hacer con cada montón (el orquestador commitea lo
propio y sigue, y se planta solo si hay algo ajeno).

Módulo PURO: entra el texto de `git status --porcelain`, salen dos listas. La única lectura de
disco es comprobar que una cola versionada sigue siendo una lista JSON de tareas con `id`.

(2026-11-21, DIR1121C) Nuevo: detectar QUÉ proceso/editor tiene el main abierto
(Antigravity IDE, Codex, agente con directorio equivocado) para incluirlo en el
informe de cuarentena y corregir su configuración a worktree.
"""

import json
import os
import subprocess

# Este módulo vive en <raíz>/scripts/puente/: tres carpetas arriba está el repositorio.
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (2026-10-28, DEC1028E) El revisor de bloqueadas re-apunta `depende` de las colas VERSIONADAS al
# dividir una tarea en partes `-dN` (`revisor_bloqueadas_logica.heredar_dependientes`). Ese
# ` M starseed_memory_root/olas/cola-*.json` es contabilidad del propio enjambre, no trabajo
# ajeno, y el orquestador de la Mac no arrancó del 27-10 22:26 al 28-10 00:40 por tres de ellas.
PREFIJO_COLA = "starseed_memory_root/olas/cola-"

# (2026-11-02, SUP0211J) `higiene_colas` MUEVE (nunca borra) a `colas-fuente/` las colas cerradas, y
# nueve de `olas/` estaban VERSIONADAS (REP1025A las subió a git): el traslado de las 11:57 dejó
# ` D starseed_memory_root/olas/cola-*-1025.json` en `main`. También es contabilidad del propio
# enjambre —la cola sigue entera en `colas-fuente/`—, pero contaba como AJENA: el orquestador no habría
# vuelto a arrancar (ni relanzado a mano ni por el vigilante tras una caída) y el vigía se negaba a
# curarlo («el árbol tiene 12 archivo(s) sin commitear y el enjambre no arranca con eso»).
DESTINO_HIGIENE = "starseed_memory_root/colas-fuente/"

# Rutas (relativas a la raíz del repo) que escribe el propio enjambre como parte
# de su funcionamiento normal. Solo esto se considera «propio»: la lista se
# amplía a mano y con motivo, nunca con comodines, para que un fallo de un agente
# no se cuele por aquí disfrazado de contabilidad.
PROPIAS = (
    "memory/aprendizaje-olas.md",
    # (2026-09-16, otra vez) El relevo del workflow a los IDE regenera estos cuatro al
    # cerrar cada ola. Añadí el relevo por la tarde y volví a dejar el enjambre parado por
    # lo mismo que por la mañana: «no arranco · ajeno: PUENTE-DE-MANDO.md». La lección no
    # era «commitea la memoria de aprendizaje», era **todo lo que el enjambre escribe solo
    # va en esta lista el mismo día que se escribe**.
    "PUENTE-DE-MANDO.md",
    ".github/copilot-instructions.md",
    ".cursor/rules/puente-de-mando.mdc",
    "memory/workflow-actual.md",
)


def ruta_de(linea):
    """La ruta que nombra una línea de `git status --porcelain`.

    Formato: dos letras de estado, un espacio, y la ruta. En renombrados y
    copias llegan dos rutas (`R  vieja -> nueva`) y nos quedamos con la nueva,
    que es la que existe ahora. Git entrecomilla las rutas con caracteres raros.
    """
    if not linea or len(linea) < 4:
        return ""
    resto = linea[3:].strip()
    if " -> " in resto:
        resto = resto.split(" -> ", 1)[1].strip()
    if len(resto) >= 2 and resto[0] == '"' and resto[-1] == '"':
        resto = resto[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return resto


def repartir(porcelain, propias=PROPIAS):
    """Reparte las líneas sucias en (propias, ajenas), en el orden que llegaron.

    Devuelve rutas, no líneas: quien llame va a commitear o a nombrar archivos.
    """
    conocidas = set(propias)
    mias, ajenas = [], []
    for linea in (porcelain or "").splitlines():
        if not linea.strip():
            continue
        ruta = ruta_de(linea)
        if not ruta:
            continue
        (mias if ruta in conocidas else ajenas).append(ruta)
    return mias, ajenas


def _cola_versionada(linea, ruta):
    """¿Es una cola versionada MODIFICADA (` M`, `M `, `MM`)? Solo esa contabilidad es propia."""
    if not ruta.startswith(PREFIJO_COLA) or not ruta.endswith(".json"):
        return False
    if "/" in ruta[len(PREFIJO_COLA):]:
        return False
    estado = (linea or "")[:2]
    return "M" in estado and set(estado) <= {" ", "M"}


def _cola_archivada(linea, ruta, raiz):
    """¿Es una cola versionada BORRADA de `olas/` (` D`, `D `) que `higiene_colas` dejó en
    `colas-fuente/`? Solo cuenta si allí sigue siendo una lista JSON de tareas con `id`: un borrado
    sin su copia archivada es trabajo de alguien, y el lado seguro es no recogerlo."""
    if not ruta.startswith(PREFIJO_COLA) or not ruta.endswith(".json"):
        return False
    nombre = ruta[len(PREFIJO_COLA):]
    if "/" in nombre:
        return False
    estado = (linea or "")[:2]
    if "D" not in estado or not set(estado) <= {" ", "D"}:
        return False
    return _lista_de_tareas(raiz, DESTINO_HIGIENE + "cola-" + nombre)


def _lista_de_tareas(raiz, ruta):
    """La cola sigue siendo una lista JSON de tareas con `id`. Si no se puede leer o ya no lo
    es, es AJENA: el lado seguro es no tocar lo que no se entiende."""
    try:
        with open(os.path.join(raiz, ruta), encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        return False
    return (
        isinstance(datos, list)
        and bool(datos)
        and all(isinstance(t, dict) and t.get("id") for t in datos)
    )


def _colas_propias(lineas, raiz):
    """Rutas de colas versionadas que el propio enjambre re-apuntó y siguen siendo válidas, o que
    `higiene_colas` archivó en `colas-fuente/` (SUP0211J)."""
    rutas = []
    for linea in lineas:
        ruta = ruta_de(linea)
        if (_cola_versionada(linea, ruta) and _lista_de_tareas(raiz, ruta)) or _cola_archivada(
                linea, ruta, raiz):
            rutas.append(ruta)
    return rutas


def clasificar(porcelain, propias=PROPIAS, raiz=None):
    """Reparte las líneas sucias en (propias, estorbo, ajenas), en el orden que llegaron.

    (2026-10-25, ENJ1025A) Como `repartir`, pero separa además el ESTORBO: un residuo sin
    seguimiento que no es trabajo de nadie (un `informe_analisis.md` suelto en la raíz, una
    copia `.new`, una cola `.no-lanzada`). Un `informe_analisis.md` paró el enjambre de la Mac
    unas 29 horas porque el guardia lo contaba como «ajeno». La regla de qué es estorbo vive en
    UN solo sitio, `curacion_logica`, y la comparten desatascar, el vigilante y este guardia.

    (2026-10-28, DEC1028E) Una cola VERSIONADA que el propio enjambre re-apuntó al dividir
    tareas también es propia: se lee del disco (`raiz`, por defecto la del repo) y solo cuenta
    si sigue siendo una lista JSON de tareas con `id`. Si no se puede leer, es ajena.

    `ajenas` es solo el trabajo de verdad: lo único que justifica «no arranco». Quien llama
    aparta el estorbo con `curacion_logica.apartar_estorbo` (a `olas/_apartado/AAAAMMDD/`, nunca
    se borra) y sigue. `repartir` se queda como estaba."""
    import curacion_logica  # aquí y no arriba: curacion_logica importa `ruta_de` de este módulo

    lineas = [l for l in (porcelain or "").splitlines() if l.strip()]
    raiz = RAIZ if raiz is None else raiz
    propias = list(propias or ()) + _colas_propias(lineas, raiz)
    estorbo, mias, ajenas = curacion_logica.clasificar_lineas(lineas, propias)
    return mias, estorbo, ajenas


def solo_es_nuestro(porcelain, propias=PROPIAS):
    """¿El árbol está sucio ÚNICAMENTE por archivos del enjambre?

    Con el árbol limpio devuelve False: no hay nada que recoger, y quien llama
    no debe confundir «no hay nada» con «lo recojo yo».
    """
    mias, ajenas = repartir(porcelain, propias)
    return bool(mias) and not ajenas


# ──────────────────────────────────────────────────────────────────────────────
# DETECCIÓN DE QUIÉN EDITA MAIN DIRECTAMENTE (DIR1121C)
# ──────────────────────────────────────────────────────────────────────────────

# Procesos conocidos que pueden editar main directamente (nombre en lsof/ps -> nombre legible)
EDITORES_CONOCIDOS = {
    "Antigravity": "Antigravity IDE",
    "antigravity": "Antigravity IDE",
    "codex": "Codex CLI",
    "Codex": "Codex CLI",
    "opencode": "opencode (agente)",
    "opencode-agent": "opencode (agente)",
    "claude": "Claude Code",
    "cursor": "Cursor",
    "code": "VS Code",
    "vscode": "VS Code",
    "zed": "Zed",
    "sublime_text": "Sublime Text",
    "vim": "Vim/Neovim",
    "nvim": "Neovim",
    "emacs": "Emacs",
}


def _ejecutar_lsof(raiz: str) -> list[dict]:
    """Ejecuta lsof en la raíz del repo y devuelve lista de procesos con archivos abiertos.

    Cada entrada: {"pid": int, "proceso": str, "usuario": str, "archivos": [str]}
    """
    try:
        # lsof +D sigue directorios recursivamente; -F pcn da PID, comando, nombre archivo
        salida = subprocess.run(
            ["lsof", "+D", raiz, "-F", "pcn"],
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return []

    procesos: dict[int, dict] = {}
    pid_actual = None
    for linea in salida.splitlines():
        if not linea:
            continue
        tipo = linea[0]
        valor = linea[1:]
        if tipo == "p":  # PID
            pid_actual = int(valor)
            if pid_actual not in procesos:
                procesos[pid_actual] = {"pid": pid_actual, "proceso": "", "usuario": "", "archivos": []}
        elif tipo == "c" and pid_actual is not None:  # comando
            procesos[pid_actual]["proceso"] = valor
        elif tipo == "n" and pid_actual is not None:  # nombre archivo
            procesos[pid_actual]["archivos"].append(valor)

    return list(procesos.values())


def identificar_editores_main(raiz: str | None = None) -> list[dict]:
    """Detecta qué procesos tienen el main repo abierto e identifica editores conocidos.

    Args:
        raiz: Ruta al repositorio main. Por defecto usa RAIZ del módulo.

    Returns:
        Lista de dicts con: {"pid", "proceso", "editor": str|None, "archivos": [str]}
        "editor" es el nombre legible si el proceso coincide con EDITORES_CONOCIDOS.
    """
    raiz = raiz or RAIZ
    procesos = _ejecutar_lsof(raiz)
    for p in procesos:
        nombre_proceso = p["proceso"].lower()
        p["editor"] = None
        for clave, nombre_legible in EDITORES_CONOCIDOS.items():
            if clave.lower() in nombre_proceso:
                p["editor"] = nombre_legible
                break
    return procesos


def generar_informe_editores(raiz: str | None = None) -> dict:
    """Genera un informe estructurado de quién tiene main abierto.

    Returns:
        {"timestamp": str, "editores_detectados": [...], "otros_procesos": [...]}
    """
    raiz = raiz or RAIZ
    todos = identificar_editores_main(raiz)
    editores = [p for p in todos if p["editor"]]
    otros = [p for p in todos if not p["editor"]]
    return {
        "timestamp": __import__("time").strftime("%Y-%m-%d %H:%M:%S"),
        "editores_detectados": [
            {"pid": p["pid"], "proceso": p["proceso"], "editor": p["editor"], "archivos": p["archivos"][:20]}
            for p in editores
        ],
        "otros_procesos": [
            {"pid": p["pid"], "proceso": p["proceso"], "archivos": p["archivos"][:10]}
            for p in otros
        ],
    }


def corregir_configuracion_editor(editor: str, worktree_ruta: str) -> dict:
    """Genera instrucciones para corregir la configuración de un editor a worktree.

    Args:
        editor: Nombre del editor (ej. "Antigravity IDE", "Codex CLI", "opencode (agente)")
        worktree_ruta: Ruta del worktree que debería usar.

    Returns:
        Dict con instrucciones específicas por editor.
    """
    instrucciones = {
        "Antigravity IDE": {
            "metodo": "abrir worktree directamente",
            "comando": f"open -a 'Antigravity IDE' '{worktree_ruta}'",
            "config": "Antigravity no tiene config persistente; abrir la carpeta del worktree.",
        },
        "Codex CLI": {
            "metodo": "variable de entorno STARSEED_WT",
            "comando": f"STARSEED_WT={os.path.dirname(worktree_ruta)} codex",
            "config": "Codex usa STARSEED_WT para saber la base de worktrees. Asegúrate de que el agente reciba el worktree correcto vía --worktree.",
        },
        "opencode (agente)": {
            "metodo": "lanzar en worktree",
            "comando": f"opencode -C {worktree_ruta}",
            "config": "El orquestador ya lanza opencode con -C <worktree>. Si un agente edita main, es que se lanzó sin -C o con directorio equivocado. Revisar el lanzador.",
        },
        "VS Code": {
            "metodo": "abrir worktree",
            "comando": f"code '{worktree_ruta}'",
            "config": "VS Code recuerda la última carpeta. Cerrar main y abrir worktree explícitamente.",
        },
        "Cursor": {
            "metodo": "abrir worktree",
            "comando": f"cursor '{worktree_ruta}'",
            "config": "Igual que VS Code.",
        },
        "Claude Code": {
            "metodo": "cd al worktree",
            "comando": f"cd '{worktree_ruta}' && claude",
            "config": "Claude Code usa el cwd actual. Lanzar desde el worktree.",
        },
    }
    return instrucciones.get(editor, {
        "metodo": "desconocido",
        "comando": "",
        "config": f"No hay instrucción automática para '{editor}'. Revisar manualmente.",
    })
