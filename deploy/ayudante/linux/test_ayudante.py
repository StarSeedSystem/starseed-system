import unittest
import subprocess
import os

class TestAyudanteLinux(unittest.TestCase):
    def test_script_exists(self):
        self.assertTrue(os.path.exists("deploy/ayudante/linux/starseed-ayudante"))
        self.assertTrue(os.path.exists("deploy/ayudante/linux/instalar.sh"))

    def test_bash_syntax(self):
        res1 = subprocess.run(["bash", "-n", "deploy/ayudante/linux/starseed-ayudante"])
        self.assertEqual(res1.returncode, 0)
        res2 = subprocess.run(["bash", "-n", "deploy/ayudante/linux/instalar.sh"])
        self.assertEqual(res2.returncode, 0)

    def test_ayudante_estado(self):
        res = subprocess.run(["bash", "deploy/ayudante/linux/starseed-ayudante", "estado"], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0)
        self.assertIn("StarSeed OS", res.stdout)

if __name__ == '__main__':
    unittest.main()
