#!/usr/bin/env python3
"""Test for instalar_trabajador.sh."""

import os
import sys
import unittest
import subprocess

class TestInstalarTrabajador(unittest.TestCase):
    def setUp(self):
        self.script_path = os.path.join(os.path.dirname(__file__), 'instalar_trabajador.sh')
        # Make sure the script is executable
        os.chmod(self.script_path, 0o755)
        self.test_env = os.environ.copy()
        self.test_home = os.path.join(os.path.dirname(__file__), 'test_home')
        os.makedirs(self.test_home, exist_ok=True)
        self.test_env['HOME'] = self.test_home
        # Create a temporary directory for fake bin
        self.fake_bin = os.path.join(os.path.dirname(__file__), 'fake_bin')
        os.makedirs(self.fake_bin, exist_ok=True)
        # Set PATH to only fake bin
        self.test_env['PATH'] = self.fake_bin
        # Fake essential commands: env and bash
        self.fake_command('env', content='#!/bin/bash\n"$@"')
        self.fake_command('bash', content='#!/bin/bash\nexec /bin/bash "$@"')

    def tearDown(self):
        import shutil
        shutil.rmtree(self.test_home, ignore_errors=True)
        shutil.rmtree(self.fake_bin, ignore_errors=True)

    def fake_command(self, name, output="", exit_code=0, content=None):
        """Create a fake executable in fake_bin."""
        path = os.path.join(self.fake_bin, name)
        with open(path, 'w') as f:
            if content is None:
                f.write(f"""#!/bin/bash
echo {output}
exit {exit_code}
""")
            else:
                f.write(content)
        os.chmod(path, 0o755)

    def test_dry_run_with_all_tools(self):
        """Test dry run mode when all tools are present."""
        # Fake the tools to be present.
        self.fake_command('git')
        self.fake_command('node')
        self.fake_command('python3')
        self.fake_command('opencode')
        # Fake the basic commands used in the script.
        self.fake_command('grep')
        self.fake_command('awk')
        self.fake_command('sysctl')
        self.fake_command('df')
        self.fake_command('nproc')
        self.fake_command('brew')
        self.fake_command('npm')
        # We also need to fake the commands used in the installation steps
        self.fake_command('python3', exit_code=0)  # for the key and installation steps
        result = subprocess.run(
            [self.script_path, '--seco'],
            env=self.test_env,
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn('[DRY RUN]', result.stdout)
        self.assertIn('Would clone', result.stdout)
        self.assertIn('Would run: npm ci --include=dev', result.stdout)
        self.assertIn('Would run: python3 scripts/puente/nodo_metagenesis.py llave', result.stdout)
        self.assertIn('Would run: python3 scripts/puente/nodo_metagenesis.py instalar', result.stdout)
        self.assertIn('Would explain container capacity', result.stdout)

if __name__ == '__main__':
    unittest.main()