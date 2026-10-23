from decimal import Decimal
import pytest
from smart_import import validate_on_url, proposed_usd, stable_usd

def test_price_includes_flat_fifty():
    assert proposed_usd(Decimal("18000"), Decimal("150")) == Decimal("170.00")

def test_stable_price_threshold():
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("205")) == (Decimal("205"), False)
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("200")) == (Decimal("200"), False)
    assert stable_usd(Decimal("24000"), Decimal("150"), Decimal("199")) == (Decimal("210.00"), True)

def test_only_official_japanese_product_urls():
    assert validate_on_url("https://www.on.com/ja-jp/products/cloud-6-m-3mf1007").startswith("https://www.on.com/")
    for url in ("http://www.on.com/ja-jp/products/x", "https://evil.com/ja-jp/products/x", "https://www.on.com.evil.com/ja-jp/products/x", "https://www.on.com/other"):
        with pytest.raises(ValueError): validate_on_url(url)
