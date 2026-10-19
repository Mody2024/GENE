"""Export only fully verified Gene experience records into scratch-training JSONL.

The splitter is deterministic so repeated exports keep records in the same split.
This does not claim the resulting text is high-quality training data; review samples
and evaluate on held-out tasks before using them to train or select a model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def read_verified(path: Path) -> list[dict]:
    records: list[dict] = []
    if not path.exists():
        return records
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_no}: invalid JSONL: {exc}") from exc
        tests = row.get("tests") if isinstance(row, dict) else None
        if not isinstance(row, dict) or row.get("schemaVersion") != 1 or row.get("verified") is not True:
            continue
        if not isinstance(tests, list) or not tests or any(not isinstance(test, dict) or test.get("passed") is not True for test in tests):
            continue
        if not all(isinstance(row.get(key), str) and row[key].strip() for key in ("task", "engine", "summary")):
            continue
        records.append(row)
    return records


def split_for(record: dict, seed: str) -> str:
    digest = hashlib.sha256((seed + ":" + record["id"]).encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") % 100
    return "train" if bucket < 80 else "validation" if bucket < 90 else "evaluation"


def format_record(record: dict) -> dict:
    tags = record.get("tags", [])
    tags = [tag for tag in tags if isinstance(tag, str)][:20] if isinstance(tags, list) else []
    passed = [test.get("name", "") for test in record["tests"] if isinstance(test, dict) and test.get("passed") is True]
    text = (
        "Gene verified game-building experience\n"
        f"Task: {record['task'].strip()}\n"
        f"Kind: {record.get('kind', 'game')}\n"
        f"Engine: {record['engine'].strip()}\n"
        f"Constraints/tags: {', '.join(tags) if tags else 'none recorded'}\n"
        f"Verified outcome: {record['summary'].strip()}\n"
        f"Passing checks: {', '.join(passed)}"
    )
    return {"text": text, "experience_id": record["id"], "engine": record["engine"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Local experiences.jsonl")
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--seed", default="gene-native-v1")
    args = parser.parse_args()
    records = read_verified(args.input)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    buckets: dict[str, list[dict]] = {"train": [], "validation": [], "evaluation": []}
    for record in records:
        buckets[split_for(record, args.seed)].append(format_record(record))
    for name, rows in buckets.items():
        output = args.out_dir / f"{name}.jsonl"
        output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\\n" for row in rows), encoding="utf-8")
    print(json.dumps({"verified_records": len(records), "splits": {name: len(rows) for name, rows in buckets.items()}, "out_dir": str(args.out_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
