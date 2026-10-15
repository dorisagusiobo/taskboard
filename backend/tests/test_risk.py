from datetime import date

from risk import find_risks

TODAY = date(2026, 10, 15)
COLUMN_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def make_board(cards_by_position: dict[int, list[dict]]) -> dict:
    next_id = iter(range(1, 100))
    return {
        "id": 1,
        "name": "Board",
        "columns": [
            {
                "id": position + 10,
                "title": title,
                "position": position,
                "cards": [
                    {
                        "id": next(next_id),
                        "title": card["title"],
                        "details": "",
                        "due_date": card.get("due_date", ""),
                        "labels": "",
                        "position": index,
                    }
                    for index, card in enumerate(cards_by_position.get(position, []))
                ],
            }
            for position, title in enumerate(COLUMN_TITLES)
        ],
    }


def test_flags_overdue_due_soon_and_undated_active_work_in_priority_order():
    board = make_board(
        {
            0: [
                {"title": "Slightly late", "due_date": "2026-10-14"},
                {"title": "Far future", "due_date": "2026-12-01"},
                {"title": "Undated backlog idea"},
            ],
            1: [{"title": "Very late", "due_date": "2026-10-01"}],
            2: [
                {"title": "Due in three days", "due_date": "2026-10-18"},
                {"title": "Undated work"},
            ],
            3: [{"title": "Due today", "due_date": "2026-10-15"}],
        }
    )

    findings = find_risks(board, TODAY)

    assert [(f.kind, f.title, f.days, f.column) for f in findings] == [
        ("overdue", "Very late", 14, "Discovery"),
        ("overdue", "Slightly late", 1, "Backlog"),
        ("due_soon", "Due today", 0, "Review"),
        ("due_soon", "Due in three days", 3, "In Progress"),
        ("no_due_date", "Undated work", 0, "In Progress"),
    ]


def test_ignores_everything_in_the_done_column():
    board = make_board(
        {4: [{"title": "Shipped late", "due_date": "2026-01-01"}, {"title": "Done"}]}
    )

    assert find_risks(board, TODAY) == []


def test_returns_nothing_for_a_healthy_board():
    board = make_board({2: [{"title": "On track", "due_date": "2026-11-30"}]})

    assert find_risks(board, TODAY) == []
