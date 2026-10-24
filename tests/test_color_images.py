import pytest
from fastapi import HTTPException
from app import AdminProduct, admin_product_payload, normalize_product


def test_color_mapping_is_explicit_and_belongs_to_gallery():
    image='https://example.test/white.jpg'
    row=dict(name='Shoe',price=200,images=[image],colors=['White'],color_images={'White':image})
    assert admin_product_payload(AdminProduct(**row))['color_images']=={'White':image}
    assert normalize_product(row)['color_images']=={'White':image}
    for mapping in [{'Black':image},{'White':'https://example.test/foreign.jpg'}]:
        with pytest.raises(HTTPException):
            admin_product_payload(AdminProduct(**{**row,'color_images':mapping}))
        assert normalize_product({**row,'color_images':mapping})['color_images']=={}


def test_legacy_editor_does_not_erase_existing_mapping():
    assert 'color_images' not in admin_product_payload(AdminProduct(name='Old editor',price=49))
    assert admin_product_payload(AdminProduct(name='Clear explicitly',price=49,color_images={}))['color_images']=={}
    assert normalize_product(dict(name='Legacy',price=49))['color_images']=={}
