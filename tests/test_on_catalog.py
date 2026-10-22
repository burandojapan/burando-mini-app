from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from on_catalog import InvalidCatalog, plan_import, selling_price

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)


def snapshot():
    return {"source": "on-japan", "complete": True, "fetched_at": NOW.isoformat(),
            "expected_records": 1,
            "fx": {"jpy_per_usd": "150", "observed_at": NOW.isoformat(),
                   "source": "https://example.test/synthetic-fx"},
            "products": [{"sku": "3MF10070516", "name": "Cloud 6", "gender": "men",
                          "color": "Navy | Black", "currency": "JPY", "complete": True,
                          "url": "https://www.on.com/en-jp/products/cloud-6-m-3mf1007/mens/navy-black-shoes-3MF10070516",
                          "current_price_jpy": 19800, "original_price_jpy": 22000,
                          "checked_at": NOW.isoformat(), "available_sizes_jp": ["25", "26.5"],
                          "images": ["https://images.ctfassets.net/synthetic/shoe.jpg"]}]}


def test_discount_current_price_and_exact_ten_dollar_threshold():
    assert selling_price(19800, 150) == Decimal("182.00")
    assert selling_price(19800, 150, 191.99) == Decimal("191.99")
    assert selling_price(19800, 150, 192) == Decimal("182.00")
    assert selling_price(19800, 150, 172) == Decimal("182.00")
    assert selling_price(19800, 150, 172.01) == Decimal("172.01")


def test_color_specific_sizes_and_no_duplicate_import():
    data = snapshot()
    second = deepcopy(data["products"][0])
    second.update(sku="3MF10079999", color="White | White", available_sizes_jp=["27"])
    second["url"] = second["url"].replace("3MF10070516", "3MF10079999")
    data["products"].append(second)
    data["expected_records"] = 2
    plan = plan_import(data, [], now=NOW)
    assert [p["values"]["sizes"] for p in plan["changes"]] == [["25", "26.5"], ["27"]]
    existing = [{"code": p["code"], **p["values"]} for p in plan["changes"]]
    assert plan_import(data, existing, now=NOW)["changes"] == []


def test_legacy_mapping_and_unrelated_products_are_preserved():
    old = [{"code": "BD-000333", "name": "Cloud 6", "price": 195},
           {"code": "BD-OTHER", "name": "UNIQLO shirt", "price": 49}]
    before = deepcopy(old)
    plan = plan_import(snapshot(), old, now=NOW)
    assert not plan["changes"]
    assert plan["blocked"][0]["legacy_codes"] == ["BD-000333"]
    assert old == before


def test_confirmed_sold_out_deactivates_only_its_sku_and_absence_never_deletes():
    data = snapshot()
    old = [{"code": "ON-JP-3MF10070516", "name": "On Cloud 6", "price": 182, "active": True},
           {"code": "ON-JP-NOTINFEED", "name": "Other model", "price": 200, "active": True}]
    data["products"][0]["available_sizes_jp"] = []
    plan = plan_import(data, old, now=NOW)
    assert len(plan["changes"]) == 1
    assert plan["changes"][0]["values"] == {"active": False}
    assert not plan_import(data, [], now=NOW)["changes"]


@pytest.mark.parametrize("field,value", [
    ("currency", "USD"), ("complete", False), ("current_price_jpy", "NaN"),
    ("current_price_jpy", -10), ("current_price_jpy", 25000),
    ("available_sizes_jp", None), ("available_sizes_jp", ["25", "25"]),
    ("available_sizes_jp", ["XL"]), ("images", ["https://evil.test/x"]),
    ("url", "https://www.on.com.evil.test/en-jp/products/shoes-3MF10070516"),
    ("url", "https://www.on.com/en-us/products/shoes-3MF10070516"),
    ("checked_at", "2026-10-20T00:00:00Z"), ("gender", "unknown"),
])
def test_invalid_variant_rejects_entire_plan(field, value):
    data = snapshot()
    data["products"][0][field] = value
    with pytest.raises(InvalidCatalog):
        plan_import(data, [], now=NOW)


@pytest.mark.parametrize("field,value", [("complete", False), ("expected_records", 5),
    ("fetched_at", "2026-10-24T00:00:00Z"), ("fetched_at", "2026-10-20T00:00:00Z")])
def test_partial_or_stale_catalog_is_rejected(field, value):
    data = snapshot()
    data[field] = value
    with pytest.raises(InvalidCatalog):
        plan_import(data, [], now=NOW)


def test_duplicate_sku_and_stale_fx_are_rejected():
    data = snapshot()
    data["products"] *= 2
    data["expected_records"] = 2
    with pytest.raises(InvalidCatalog):
        plan_import(data, [], now=NOW)
    data = snapshot()
    data["fx"]["observed_at"] = "2026-10-01T00:00:00Z"
    with pytest.raises(InvalidCatalog):
        plan_import(data, [], now=NOW)
