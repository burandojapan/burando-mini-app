"""BURANDO AI Manager: safe, deterministic pricing foundation.

No scraping, publishing or live database mutations happen in this module.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

SHOE_MARKUP_USD = Decimal("50")
ON_RUNNING_PRICE_CHANGE_THRESHOLD_USD = Decimal("10")


@dataclass(frozen=True)
class PriceDecision:
    status: str
    price_usd: Optional[Decimal]
    reason: str


def calculate_price(
    *,
    category: str,
    source_price_jpy: Decimal,
    usd_jpy: Decimal,
    sale_price_jpy: Optional[Decimal] = None,
    brand: str = "",
    previous_price_usd: Optional[Decimal] = None,
) -> PriceDecision:
    """Return a quote only when a category pricing rule exists.

    usd_jpy is the number of JPY per 1 USD.
    """
    if category.strip().lower() not in {"shoes", "footwear", "oyoq kiyim", "poyabzal"}:
        return PriceDecision("needs_pricing_rule", None, "Category markup not configured")
    if usd_jpy <= 0 or source_price_jpy <= 0:
        return PriceDecision("invalid_source", None, "Invalid FX rate or source price")
    if sale_price_jpy is not None and (sale_price_jpy <= 0 or sale_price_jpy > source_price_jpy):
        return PriceDecision("invalid_source", None, "Invalid sale price")
    effective_jpy = sale_price_jpy if sale_price_jpy is not None else source_price_jpy
    calculated = (effective_jpy / usd_jpy + SHOE_MARKUP_USD).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if brand.strip().lower() in {"on", "on running", "on cloud", "oncloud"} and previous_price_usd is not None:
        if abs(calculated - previous_price_usd) <= ON_RUNNING_PRICE_CHANGE_THRESHOLD_USD:
            return PriceDecision("unchanged", previous_price_usd, "On Running change <= $10")
    return PriceDecision("priced", calculated, "Shoe markup +$50")
