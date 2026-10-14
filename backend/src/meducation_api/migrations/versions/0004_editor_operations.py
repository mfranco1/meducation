"""Guarded editor operations and durable paired history."""

from pathlib import Path

from alembic import op

revision = "0004_editor_operations"
down_revision = "0003_admin_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    resources = Path(__file__).resolve().parents[1]
    # Reuse the preserved transaction bodies without their operator ledger wrappers.
    # The editor dispatcher claims/finalizes one operation with the complete HTTP intent.
    sources = {
        "save_reviewed_draft": "0002_authored_publish.sql",
        "publish_draft": "0002_authored_publish.sql",
        "activate_release": "0001_operations.sql",
        "reserve_ids": "0001_operations.sql",
    }
    for name, file in sources.items():
        source = (resources / file).read_text()
        start = source.index("CREATE FUNCTION content." + name + "(")
        end = source.index("END $$;", start) + len("END $$;")
        body = source[start:end]
        body = body.replace("content." + name + "(", "content.editor_internal_" + name + "(", 1)
        # Each original claim consists of one assignment and one early return.
        lines = body.splitlines()
        lines = [
            line
            for line in lines
            if not (
                "outcome := content.claim_operation" in line
                or "outcome:=content.claim_operation" in line
                or "IF outcome IS NOT NULL THEN RETURN outcome; END IF;" in line
            )
        ]
        body = "\n".join(lines)
        if name == "save_reviewed_draft":
            body = body.replace(
                "RETURN content.finish_operation(op_id,jsonb_build_object('draft_revision',captured.revision+1),NULL,captured.revision+1);",
                "RETURN jsonb_build_object('draft_revision',captured.revision+1);",
            )
        elif name == "publish_draft":
            body = body.replace(
                "RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence,'draft_revision',captured.revision+1)||revisions,target,captured.revision+1);",
                "RETURN jsonb_build_object('release_id',target,'publication_sequence',new_sequence,'draft_revision',captured.revision+1)||revisions;",
            )
        elif name == "activate_release":
            body = body.replace(
                "RETURN content.finish_operation(op_id,jsonb_build_object('release_id',target,'publication_sequence',new_sequence),target);",
                "RETURN jsonb_build_object('release_id',target,'publication_sequence',new_sequence);",
            )
        else:
            body = body.replace(
                "RETURN content.finish_operation(op_id,allocated);", "RETURN allocated;"
            )
        if "content.claim_operation(" in body or "content.finish_operation(" in body:
            raise RuntimeError(
                "Preserved transaction extraction changed; inspect editor migration."
            )
        op.get_bind().exec_driver_sql(body)
    op.get_bind().exec_driver_sql((resources / "0004_editor_operations.sql").read_text())


def downgrade() -> None:
    raise RuntimeError(
        "Editor history downgrade is destructive and unsupported; restore a separate database."
    )
