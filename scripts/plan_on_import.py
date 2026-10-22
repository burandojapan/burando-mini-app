"""Build a review plan from a permitted On Japan export; does not publish products."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from on_catalog import InvalidCatalog, plan_import


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("existing_products", type=Path, help="Product-only export; no customer data")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        plan = plan_import(json.loads(args.snapshot.read_text()), json.loads(args.existing_products.read_text()))
    except (InvalidCatalog, ValueError, KeyError, TypeError, OSError) as exc:
        parser.exit(1, f"Import plan rejected: {exc}\n")
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    print(f"Review plan: {len(plan['changes'])} changes, {len(plan['blocked'])} legacy mapping conflicts. No database writes.")


if __name__ == "__main__":
    main()
