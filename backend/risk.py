from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel

DUE_SOON_DAYS = 3
# Zero-based positions in the fixed five-column board.
ACTIVE_COLUMN_POSITIONS = {2, 3}  # In Progress, Review
DONE_COLUMN_POSITION = 4

RiskKind = Literal["overdue", "due_soon", "no_due_date"]
_KIND_ORDER: dict[str, int] = {"overdue": 0, "due_soon": 1, "no_due_date": 2}


class RiskFinding(BaseModel):
    kind: RiskKind
    card_id: int
    title: str
    column: str
    due_date: str
    days: int


def find_risks(board: dict[str, Any], today: date) -> list[RiskFinding]:
    """Deterministic risk checks over the canonical board.

    Cards in the Done column are never at risk. A card appears at most once,
    under its most urgent kind. `days` is days overdue for "overdue", days left
    for "due_soon", and 0 for "no_due_date".
    """
    findings: list[RiskFinding] = []
    soon = today + timedelta(days=DUE_SOON_DAYS)

    for column in board["columns"]:
        if column["position"] == DONE_COLUMN_POSITION:
            continue
        for card in column["cards"]:
            base = {
                "card_id": card["id"],
                "title": card["title"],
                "column": column["title"],
                "due_date": card["due_date"],
            }
            if card["due_date"]:
                due = date.fromisoformat(card["due_date"])
                if due < today:
                    findings.append(
                        RiskFinding(kind="overdue", days=(today - due).days, **base)
                    )
                elif due <= soon:
                    findings.append(
                        RiskFinding(kind="due_soon", days=(due - today).days, **base)
                    )
            elif column["position"] in ACTIVE_COLUMN_POSITIONS:
                findings.append(RiskFinding(kind="no_due_date", days=0, **base))

    return sorted(
        findings,
        key=lambda finding: (
            _KIND_ORDER[finding.kind],
            -finding.days if finding.kind == "overdue" else finding.days,
            finding.card_id,
        ),
    )
