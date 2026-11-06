"""(LZ040A, 06-11) El build nativo de Linux usa el mismo Ubuntu que el «Tauri · cargo check» del CI."""
import os
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8") as f:
        return f.read()


class LinuxNativo(unittest.TestCase):
    def test_escritorio_en_ubuntu_24(self):
        wf = leer(".github/workflows/native-build.yml")
        self.assertIn("platform: [macos-latest, ubuntu-24.04, windows-latest]", wf)
        self.assertIn("if: matrix.platform == 'ubuntu-24.04'", wf)
        self.assertNotIn("- platform: ubuntu-22.04", wf)

    def test_paquetes_de_24(self):
        wf = leer(".github/workflows/native-build.yml")
        self.assertIn("libayatana-appindicator3-dev", wf)
        self.assertNotIn("libappindicator3-dev \\", wf.replace("libayatana-appindicator3-dev", ""))
        # (LZ041A) xcap enlaza libgbm; linuxdeploy (AppImage) necesita FUSE 2 en 24.04.
        for paquete in ("libpipewire-0.3-dev", "libspa-0.2-dev", "libclang-dev", "libxdo-dev", "libgbm-dev",
                        "libfuse2t64"):
            self.assertIn(paquete, wf)

    def test_cafe_en_linux_sin_acento_en_el_paquete(self):
        # (LZ042A) «invalid name "star-seed-café"» en el .rpm de v0.4.2.
        wf = leer(".github/workflows/native-build.yml")
        self.assertIn('d["productName"]="StarSeed Cafe"', wf)
        self.assertIn("flag=-c src-tauri/tauri.cafe-linux.conf.json", wf)
        self.assertIn('[ "${{ runner.os }}" = "Linux" ]', wf)


if __name__ == "__main__":
    unittest.main()
