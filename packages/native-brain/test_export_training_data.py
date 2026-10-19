import json
import tempfile
import unittest
from pathlib import Path

from export_training_data import format_record, read_verified, split_for


class ExportTrainingDataTests(unittest.TestCase):
    def setUp(self):
        self.good = {
            "schemaVersion": 1, "id": "verified-1", "verified": True,
            "task": "A small platformer", "engine": "canvas2d", "kind": "game",
            "summary": "Movement and pause passed in a real browser.",
            "tags": ["platformer", "controls"],
            "tests": [{"name": "browser movement", "passed": True}],
        }

    def test_only_fully_verified_records_are_exported(self):
        bad = dict(self.good, id="failed", tests=[{"name": "browser", "passed": False}])
        unverified = dict(self.good, id="unverified", verified=False)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "experiences.jsonl"
            path.write_text("\\n".join(json.dumps(row) for row in [self.good, bad, unverified]) + "\\n", encoding="utf-8")
            rows = read_verified(path)
        self.assertEqual([row["id"] for row in rows], ["verified-1"])

    def test_output_is_structured_and_repeatable(self):
        first = format_record(self.good)
        second = format_record(self.good)
        self.assertEqual(first, second)
        self.assertIn("Passing checks: browser movement", first["text"])
        self.assertIn(split_for(self.good, "seed"), {"train", "validation", "evaluation"})
        self.assertEqual(split_for(self.good, "seed"), split_for(self.good, "seed"))


if __name__ == "__main__":
    unittest.main()
