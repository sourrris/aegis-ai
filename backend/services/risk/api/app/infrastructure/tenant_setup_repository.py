import hashlib
import hmac
import re
import secrets
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.monitoring_repository import UserRepository

DOMAIN_HOSTNAME_PATTERN = re.compile(
    r"^(?=.{4,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)
API_KEY_PATTERN = re.compile(r"^aegis_live_([0-9a-fA-F]{32})\.([A-Za-z0-9_-]{16,})$")


class DuplicateResourceError(ValueError):
    pass


class NotFoundError(ValueError):
    pass


def _slugify_tenant_seed(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not normalized:
        raise ValueError("Organization name must include letters or numbers")
    return normalized[:110]


def _normalize_hostname(value: str) -> str:
    hostname = value.strip().lower()
    if hostname.startswith("https://"):
        hostname = hostname[len("https://") :]
    elif hostname.startswith("http://"):
        hostname = hostname[len("http://") :]
    hostname = hostname.strip().strip("/")
    if "/" in hostname or ":" in hostname or " " in hostname:
        raise ValueError("Domain must be a bare hostname like app.example.com")
    if not DOMAIN_HOSTNAME_PATTERN.fullmatch(hostname):
        raise ValueError("Domain must be a valid hostname like app.example.com")
    return hostname


class TenantSetupRepository:
    @staticmethod
    async def _next_available_tenant_id(session: AsyncSession, organization_name: str) -> str:
        seed = _slugify_tenant_seed(organization_name)
        candidate = seed
        suffix = 2
        while True:
            existing = await session.execute(
                text("SELECT tenant_id FROM tenants WHERE tenant_id = :tenant_id LIMIT 1"),
                {"tenant_id": candidate},
            )
            if existing.first() is None:
                return candidate
            candidate = f"{seed}-{suffix}"
            suffix += 1

    @staticmethod
    async def create_account(
        session: AsyncSession,
        *,
        username: str,
        password: str,
        organization_name: str,
    ) -> dict[str, object]:
        existing = await session.execute(
            text("SELECT id FROM users WHERE username = :username LIMIT 1"),
            {"username": username},
        )
        if existing.first() is not None:
            raise DuplicateResourceError("An account with that email already exists")

        tenant_id = await TenantSetupRepository._next_available_tenant_id(session, organization_name)

        try:
            user_row = await session.execute(
                text(
                    """
                    INSERT INTO users (username, password_hash, role)
                    VALUES (:username, :password_hash, 'admin')
                    RETURNING id
                    """
                ),
                {
                    "username": username,
                    "password_hash": UserRepository.hash_password(password),
                },
            )
            user_id = int(user_row.scalar_one())

            await session.execute(
                text(
                    """
                    INSERT INTO tenants (tenant_id, display_name, status, tier, metadata)
                    VALUES (:tenant_id, :display_name, 'active', 'standard', '{}'::jsonb)
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "display_name": organization_name,
                },
            )
            await session.execute(
                text(
                    """
                    INSERT INTO user_tenant_roles (user_id, tenant_id, role_name)
                    VALUES (:user_id, :tenant_id, 'admin')
                    """
                ),
                {
                    "user_id": user_id,
                    "tenant_id": tenant_id,
                },
            )
            await session.execute(
                text(
                    """
                    INSERT INTO tenant_configuration (tenant_id, enabled_connectors)
                    VALUES (:tenant_id, '[]'::jsonb)
                    ON CONFLICT (tenant_id) DO NOTHING
                    """
                ),
                {"tenant_id": tenant_id},
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        return {
            "username": username,
            "tenant_id": tenant_id,
            "roles": ["admin"],
            "scopes": UserRepository.ROLE_DEFAULT_SCOPES["admin"],
        }


class DomainRepository:
    @staticmethod
    async def list_domains(session: AsyncSession, *, tenant_id: str) -> list[dict[str, object]]:
        rows = await session.execute(
            text(
                """
                SELECT domain_id, tenant_id, hostname, created_by, created_at
                FROM tenant_domains
                WHERE tenant_id = :tenant_id
                ORDER BY hostname ASC
                """
            ),
            {"tenant_id": tenant_id},
        )
        return [dict(row._mapping) for row in rows]

    @staticmethod
    async def create_domain(
        session: AsyncSession,
        *,
        tenant_id: str,
        hostname: str,
        created_by: str,
    ) -> dict[str, object]:
        normalized = _normalize_hostname(hostname)
        existing = await session.execute(
            text(
                """
                SELECT tenant_id
                FROM tenant_domains
                WHERE hostname = :hostname
                LIMIT 1
                """
            ),
            {"hostname": normalized},
        )
        existing_row = existing.first()
        if existing_row is not None:
            existing_tenant_id = str(existing_row._mapping["tenant_id"])
            if existing_tenant_id == tenant_id:
                raise DuplicateResourceError("This domain is already configured for your organization")
            raise DuplicateResourceError("This domain is already claimed by another organization")

        try:
            row = await session.execute(
                text(
                    """
                    INSERT INTO tenant_domains (tenant_id, hostname, created_by)
                    VALUES (:tenant_id, :hostname, :created_by)
                    RETURNING domain_id, tenant_id, hostname, created_by, created_at
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "hostname": normalized,
                    "created_by": created_by,
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        return dict(row.mappings().one())


class TenantKeyRepository:
    DEFAULT_SCOPES = ["events:write"]

    @staticmethod
    def _hash_secret(secret: str) -> str:
        return hashlib.sha256(secret.encode("utf-8")).hexdigest()

    @staticmethod
    async def list_keys(session: AsyncSession, *, tenant_id: str) -> list[dict[str, object]]:
        rows = await session.execute(
            text(
                """
                SELECT
                    tk.key_id,
                    tk.tenant_id,
                    tk.name,
                    tk.key_prefix,
                    tk.active,
                    tk.scopes,
                    tk.domain_id,
                    td.hostname AS domain_hostname,
                    tk.created_by,
                    tk.created_at,
                    tk.last_used_at
                FROM tenant_keys tk
                LEFT JOIN tenant_domains td ON td.domain_id = tk.domain_id
                WHERE tk.tenant_id = :tenant_id
                ORDER BY tk.created_at DESC
                """
            ),
            {"tenant_id": tenant_id},
        )
        return [dict(row._mapping) for row in rows]

    @staticmethod
    async def create_key(
        session: AsyncSession,
        *,
        tenant_id: str,
        name: str,
        domain_id: UUID,
        created_by: str,
    ) -> dict[str, object]:
        domain = await session.execute(
            text(
                """
                SELECT domain_id, hostname
                FROM tenant_domains
                WHERE tenant_id = :tenant_id AND domain_id = :domain_id
                LIMIT 1
                """
            ),
            {
                "tenant_id": tenant_id,
                "domain_id": domain_id,
            },
        )
        domain_row = domain.mappings().one_or_none()
        if domain_row is None:
            raise NotFoundError("Select a valid registered domain before creating an API key")

        key_id = uuid4()
        secret = secrets.token_urlsafe(32)
        raw_key = f"aegis_live_{key_id.hex}.{secret}"
        key_prefix = f"aegis_live_{key_id.hex[:10]}"
        cleaned_name = name.strip()
        if len(cleaned_name) < 2:
            raise ValueError("API key name must be at least 2 characters long")

        try:
            row = await session.execute(
                text(
                    """
                    INSERT INTO tenant_keys (
                        key_id,
                        tenant_id,
                        key_type,
                        key_hash,
                        active,
                        name,
                        key_prefix,
                        scopes,
                        domain_id,
                        created_by
                    )
                    VALUES (
                        :key_id,
                        :tenant_id,
                        'ingest',
                        :key_hash,
                        TRUE,
                        :name,
                        :key_prefix,
                        :scopes,
                        :domain_id,
                        :created_by
                    )
                    RETURNING key_id, tenant_id, name, key_prefix, active, scopes, domain_id, created_by, created_at, last_used_at
                    """
                ),
                {
                    "key_id": key_id,
                    "tenant_id": tenant_id,
                    "key_hash": TenantKeyRepository._hash_secret(secret),
                    "name": cleaned_name,
                    "key_prefix": key_prefix,
                    "scopes": TenantKeyRepository.DEFAULT_SCOPES,
                    "domain_id": domain_id,
                    "created_by": created_by,
                },
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        created = dict(row.mappings().one())
        created["domain_hostname"] = str(domain_row["hostname"])
        created["token"] = raw_key
        return created

    @staticmethod
    async def revoke_key(session: AsyncSession, *, tenant_id: str, key_id: UUID) -> bool:
        row = await session.execute(
            text(
                """
                UPDATE tenant_keys
                SET active = FALSE, revoked_at = NOW()
                WHERE tenant_id = :tenant_id AND key_id = :key_id AND active = TRUE
                RETURNING key_id
                """
            ),
            {
                "tenant_id": tenant_id,
                "key_id": key_id,
            },
        )
        revoked = row.first() is not None
        if revoked:
            await session.commit()
        else:
            await session.rollback()
        return revoked

    @staticmethod
    async def authenticate_api_key(session: AsyncSession, raw_key: str) -> dict[str, object] | None:
        match = API_KEY_PATTERN.fullmatch(raw_key.strip())
        if match is None:
            return None

        try:
            key_id = UUID(hex=match.group(1))
        except ValueError:
            return None
        secret = match.group(2)

        row = await session.execute(
            text(
                """
                SELECT
                    tk.key_id,
                    tk.tenant_id,
                    tk.key_hash,
                    tk.key_prefix,
                    tk.active,
                    tk.scopes,
                    tk.domain_id,
                    td.hostname AS domain_hostname
                FROM tenant_keys tk
                LEFT JOIN tenant_domains td ON td.domain_id = tk.domain_id
                WHERE tk.key_id = :key_id
                LIMIT 1
                """
            ),
            {"key_id": key_id},
        )
        mapping = row.mappings().one_or_none()
        if mapping is None or not bool(mapping["active"]):
            return None

        expected_hash = str(mapping["key_hash"] or "")
        if not hmac.compare_digest(expected_hash, TenantKeyRepository._hash_secret(secret)):
            return None

        await session.execute(
            text("UPDATE tenant_keys SET last_used_at = NOW() WHERE key_id = :key_id"),
            {"key_id": key_id},
        )
        await session.commit()

        return {
            "tenant_id": str(mapping["tenant_id"]),
            "scopes": [str(item) for item in (mapping["scopes"] or [])],
            "api_key_id": str(mapping["key_id"]),
            "key_prefix": str(mapping["key_prefix"]),
            "domain_id": str(mapping["domain_id"]) if mapping.get("domain_id") else None,
            "domain_hostname": str(mapping["domain_hostname"]) if mapping.get("domain_hostname") else None,
        }
