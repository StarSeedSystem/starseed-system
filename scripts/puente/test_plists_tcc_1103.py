"""SUP0311D (03-11): ningún servicio de launchd del repo lanza un shell sobre un guion de ~/Documents.

macOS protege ~/Documents con TCC y el permiso de disco se concede por binario: lo tiene
/opt/homebrew/bin/python3, no /bin/bash ni /bin/zsh. Un plist con «/bin/bash <guion en ~/Documents>»
falla en cada pasada con «Operation not permitted» (codegraph-sync, desde la 1103 · AA). El remedio
documentado es scripts/puente/lanzador-tcc.py: python3 de programa y el shell de hijo.
Un `-c` con la orden en línea no lee ningún guion: ese caso no cuenta."""
import os
import plistlib
import subprocess
import unittest

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SHELLS = {"bash", "zsh", "sh", "dash", "ksh"}


def guiones_en_documents(args):
    """PURA. Los argumentos que un shell (programa del servicio) leería como guion dentro de ~/Documents."""
    args = [str(a) for a in (args or [])]
    if not args or os.path.basename(args[0]) not in SHELLS:
        return []
    malos = []
    for a in args[1:]:
        if a == "-c":
            break  # orden en línea: el shell no abre ningún archivo como guion
        if a.startswith("-"):
            continue
        if "/Documents/" in a:
            malos.append(a)
        break  # el primer argumento no opción es el guion; lo demás son sus argumentos
    return malos


def plists_del_repo():
    r = subprocess.run(["git", "-C", RAIZ, "ls-files", "*.plist"], capture_output=True, text=True)
    rutas = [l for l in r.stdout.splitlines() if l.strip()] if r.returncode == 0 else []
    return [os.path.join(RAIZ, p) for p in rutas if os.path.exists(os.path.join(RAIZ, p))]


class PruebaGuionesEnDocuments(unittest.TestCase):
    def test_detecta_el_caso_de_codegraph_del_03_11(self):
        viejo = ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh",
                 "/Users/alex/Documents/starseed-os-main"]
        self.assertEqual(guiones_en_documents(viejo), [viejo[1]])
        self.assertEqual(guiones_en_documents(["/bin/zsh", "/Users/alex/Documents/x/arrancar-mando.sh"]),
                         ["/Users/alex/Documents/x/arrancar-mando.sh"])

    def test_no_cuenta_python_ni_orden_en_linea_ni_guiones_fuera(self):
        self.assertEqual(guiones_en_documents(["/opt/homebrew/bin/python3", "/Users/alex/Documents/r/x.py"]), [])
        self.assertEqual(guiones_en_documents(["/bin/zsh", "-c", "exec python3 /Users/alex/Documents/r/x.py"]), [])
        self.assertEqual(guiones_en_documents(["/bin/bash", "/Users/alex/.starseed/x.sh", "/Users/alex/Documents/r"]), [])
        self.assertEqual(guiones_en_documents([]), [])

    def test_ningun_plist_del_repo_lanza_un_shell_sobre_documents(self):
        plists = plists_del_repo()
        self.assertTrue(any(p.endswith("com.starseed.codegraph-sync.plist") for p in plists))
        malos = {}
        for ruta in plists:
            try:
                with open(ruta, "rb") as f:
                    datos = plistlib.load(f)
            except Exception:
                continue  # Info.plist de Tauri u otros que no son de launchd
            args = datos.get("ProgramArguments") if isinstance(datos, dict) else None
            g = guiones_en_documents(args)
            if g:
                malos[os.path.relpath(ruta, RAIZ)] = g
        self.assertEqual(malos, {}, "usa scripts/puente/lanzador-tcc.py: python3 de programa, el shell de hijo")


if __name__ == "__main__":
    unittest.main()
