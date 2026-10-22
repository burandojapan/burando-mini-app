import pytest
from fastapi import HTTPException
from app import normalize_product, AdminProduct, admin_product_payload
from v7_security import manual_uzs, uzs_amount


def test_independent_admin_prices_and_sale():
    p={'code':'TEST','name':'Test','price':185,'price_uzs':1999000,'sale_price':150,'sale_price_uzs':1777000}
    item=normalize_product(p)
    assert item['price']==150 and item['price_uzs']==1777000
    assert item['original_price_uzs']==1999000
    assert normalize_product({'code':'OLD','price':50})['price_uzs'] is None
    saved=admin_product_payload(AdminProduct(**{**p,'name':'Test'}))
    assert saved['price_uzs'] is None and saved['sale_price_uzs'] is None
    assert admin_product_payload(AdminProduct(name='USD only',price=185))['price']==185
    for bad in [float('nan'),float('inf'),-1,10**15]:
        with pytest.raises(HTTPException):uzs_amount(bad)
    for bad in [dict(price_uzs=200,sale_price=10),dict(price_uzs=200,sale_price=10,sale_price_uzs=201)]:
        with pytest.raises(HTTPException):manual_uzs(bad)
