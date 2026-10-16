"""Fail closed for explicitly configured staging; preserve legacy live startup."""
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Environment:
    name: str
    notifications_enabled: bool


def validate_environment(env):
    name = env.get('APP_ENV', 'production').strip().lower()
    if name not in {'production', 'staging', 'test'}:
        raise RuntimeError('APP_ENV must be production, staging or test')
    enabled = env.get('NOTIFICATIONS_ENABLED', 'false').lower() == 'true'
    if name != 'staging':
        return Environment(name, enabled)
    if env.get('DEV_MODE', 'false').lower() == 'true':
        raise RuntimeError('Staging must not bypass Telegram authentication')
    url = env.get('SUPABASE_URL', '').rstrip('/')
    project = env.get('STAGING_SUPABASE_PROJECT_REF', '').strip()
    if not project or urlparse(url).scheme != 'https' or urlparse(url).netloc != f'{project}.supabase.co':
        raise RuntimeError('Staging requires its explicitly confirmed Supabase project')
    if env.get('STAGING_ISOLATION_CONFIRMED') != 'true':
        raise RuntimeError('Confirm a new empty database, private storage and separate bot before staging startup')
    admin = env.get('ADMIN_API_KEY') or env.get('ADMIN_KEY', '')
    if len(admin) < 32:
        raise RuntimeError('Staging requires a unique admin key of at least 32 characters')
    if not (env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_KEY')):
        raise RuntimeError('Staging requires a server-only service role key')
    if enabled:
        raise RuntimeError('Staging notifications are disabled until a test-only notification transport is implemented')
    return Environment(name, False)
