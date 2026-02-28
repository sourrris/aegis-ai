"""disable paid sources by default

Revision ID: 20260228_0003
Revises: 20260228_0002
Create Date: 2026-02-28 23:40:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260228_0003"
down_revision = "20260228_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE event_sources
        SET enabled = FALSE
        WHERE source_name IN ('opensanctions', 'maxmind_geolite2', 'hibp')
        """
    )
    op.execute(
        """
        UPDATE source_connector_state
        SET enabled = FALSE,
            next_run_at = NULL,
            updated_at = NOW()
        WHERE source_name IN ('opensanctions', 'maxmind_geolite2', 'hibp')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE event_sources
        SET enabled = TRUE
        WHERE source_name IN ('opensanctions', 'maxmind_geolite2', 'hibp')
        """
    )
    op.execute(
        """
        UPDATE source_connector_state
        SET enabled = TRUE,
            next_run_at = NOW(),
            updated_at = NOW()
        WHERE source_name IN ('opensanctions', 'maxmind_geolite2', 'hibp')
        """
    )
