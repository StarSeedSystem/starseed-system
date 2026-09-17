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

Módulo PURO: entra el texto de `git status --porcelain`, salen dos listas.
"""

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


def solo_es_nuestro(porcelain, propias=PROPIAS):
    """¿El árbol está sucio ÚNICAMENTE por archivos del enjambre?

    Con el árbol limpio devuelve False: no hay nada que recoger, y quien llama
    no debe confundir «no hay nada» con «lo recojo yo».
    """
    mias, ajenas = repartir(porcelain, propias)
    return bool(mias) and not ajenas
