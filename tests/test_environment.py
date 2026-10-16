import unittest
from environment import validate_environment

class EnvironmentTests(unittest.TestCase):
    def staging(self):
        return dict(APP_ENV='staging', SUPABASE_URL='https://test-only.supabase.co',
                    STAGING_SUPABASE_PROJECT_REF='test-only', STAGING_ISOLATION_CONFIRMED='true',
                    ADMIN_API_KEY='x' * 40, SUPABASE_SERVICE_ROLE_KEY='test-placeholder')

    def test_legacy_startup_preserved(self):
        self.assertEqual(validate_environment({}).name, 'production')

    def test_staging_isolated(self):
        self.assertFalse(validate_environment(self.staging()).notifications_enabled)

    def test_unsafe_staging_rejected(self):
        for key, value in [('DEV_MODE', 'true'), ('NOTIFICATIONS_ENABLED', 'true'),
                           ('SUPABASE_URL', 'https://other.supabase.co'),
                           ('STAGING_ISOLATION_CONFIRMED', ''), ('ADMIN_API_KEY', 'weak'),
                           ('SUPABASE_SERVICE_ROLE_KEY', '')]:
            with self.subTest(key=key):
                env = self.staging(); env[key] = value
                with self.assertRaises(RuntimeError): validate_environment(env)

    def test_unknown_environment_rejected(self):
        with self.assertRaises(RuntimeError): validate_environment({'APP_ENV': 'stagng'})

if __name__ == '__main__': unittest.main()
