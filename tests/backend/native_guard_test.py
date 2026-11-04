"""Verify that the native harness cannot mutate an unintended database."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SCRIPT = Path(__file__).with_name('native.py')
LOCAL = 'postgresql://postgres:test-only@127.0.0.1:5432/kys_test_backend'


class NativeHarnessSafety(unittest.TestCase):
    def test_invalid_targets_never_open_a_database_connection(self):
        targets = ['', 'postgresql://example.com/kys_test_backend',
                   'postgresql://127.0.0.1/important_database',
                   LOCAL+'?hostaddr=203.0.113.1', 'https://127.0.0.1/kys_test_backend']
        for target in targets:
            with self.subTest(target=target), patch.dict(os.environ, {'KYS_TEST_DATABASE_URL':target}), patch('subprocess.Popen') as connect:
                with self.assertRaises(SystemExit):
                    runpy.run_path(str(SCRIPT),run_name='__main__')
                connect.assert_not_called()

    def test_existing_schema_stops_before_any_mutation_and_ignores_pg_overrides(self):
        process=MagicMock()
        process.communicate.return_value=('KYS_RESULT:false\n','')
        process.returncode=0
        with tempfile.TemporaryDirectory() as directory:
            env={'KYS_TEST_DATABASE_URL':LOCAL,'KYS_POSTGIS_SCHEMA':'extensions',
                 'PGHOSTADDR':'203.0.113.1','PGSERVICE':'production',
                 'KYS_NATIVE_REPORT':str(Path(directory)/'report.json')}
            with patch.dict(os.environ,env),patch('subprocess.Popen',return_value=process) as connect:
                with self.assertRaisesRegex(RuntimeError,'fresh disposable'):
                    runpy.run_path(str(SCRIPT),run_name='__main__')
                connect.assert_called_once()
                sql=process.communicate.call_args.args[0]
                self.assertNotIn('DROP',sql.upper())
                self.assertNotIn('CREATE',sql.upper())
                self.assertNotIn('PGHOSTADDR',connect.call_args.kwargs['env'])
                self.assertNotIn('PGSERVICE',connect.call_args.kwargs['env'])

    def test_optimized_python_is_refused_before_connecting(self):
        env=dict(os.environ,KYS_TEST_DATABASE_URL=LOCAL)
        completed=subprocess.run([sys.executable,'-O',str(SCRIPT)],env=env,capture_output=True,text=True,timeout=10)
        self.assertNotEqual(completed.returncode,0)
        self.assertIn('without Python optimization',completed.stderr)


if __name__=='__main__':
    unittest.main()
