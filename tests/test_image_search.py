from io import BytesIO
from types import SimpleNamespace
import httpx
import pytest
from PIL import Image, ImageDraw
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from image_search import descriptor, resemblance, safe_catalog_url, install


def picture(color):
    im=Image.new('RGB',(80,60),'white')
    ImageDraw.Draw(im).rectangle((10,15,70,45),fill=color)
    out=BytesIO();im.save(out,'PNG');return out.getvalue()


def test_visual_descriptor_and_content_validation():
    red=descriptor(picture('red'),'image/png')
    blue=descriptor(picture('blue'),'image/png')
    assert resemblance(red,red)==1
    assert resemblance(red,blue)<.82
    for content,kind in [(b'bad','image/png'),(picture('red'),'image/jpeg'),(b'x'*(5*1024*1024+1),'image/png')]:
        with pytest.raises(HTTPException): descriptor(content,kind)


def test_image_hosts_are_restricted():
    base='https://test.supabase.co'
    assert safe_catalog_url('https://images.unsplash.com/photo-123',base)
    assert safe_catalog_url('https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/488187/item/jpgoods_15_488187_3x4.jpg',base)
    assert safe_catalog_url(base+'/storage/v1/object/public/product-images/x.jpg',base)
    for url in ['http://127.0.0.1/x','https://127.0.0.1/x','https://evil.example/photo-x','https://images.unsplash.com@evil.example/photo-x','https://images.unsplash.com:444/photo-x',base+'/storage/v1/object/private/payment-receipts/x.jpg']:
        assert not safe_catalog_url(url,base)
    for url in ['https://image.uniqlo.com.evil.example/UQ/ST3/a.jpg',
                'https://image.uniqlo.com:444/UQ/ST3/a.jpg',
                'https://image.uniqlo.com@evil.example/UQ/ST3/a.jpg',
                'https://image.uniqlo.com/not-a-catalog-image']:
        assert not safe_catalog_url(url,base)


def test_search_real_comparison_cache_partial_and_limits(monkeypatch):
    calls=[]
    async def send(self,request,**kwargs):
        calls.append(str(request.url))
        color='red' if request.url.path.endswith('red') else 'blue'
        return httpx.Response(200,content=picture(color),headers={'content-type':'image/png'},request=request)
    monkeypatch.setattr(httpx.AsyncClient,'send',send)
    async def catalog():
        return [dict(id='red',image='https://images.unsplash.com/photo-red'),dict(id='blue',image='https://images.unsplash.com/photo-blue'),dict(id='unsafe',image='https://127.0.0.1/x')]
    app=FastAPI();install(app,SimpleNamespace(load_products=catalog,SUPABASE_URL='https://test.supabase.co'))
    c=TestClient(app)
    assert c.post('/api/search/image',files={'file':('bad.png',b'bad','image/png')}).status_code==400
    for _ in range(4):
        r=c.post('/api/search/image',files={'file':('red.png',picture('red'),'image/png')})
        assert r.status_code==200,r.text
        data=r.json();assert data['ids']==['red'];assert data['mode']=='visual_resemblance'
        assert data['partial'] and data['indexed_products']==2
        assert 'confidence' not in data
    assert len(calls)==2,'only catalog URLs fetched once; uploaded photo is never sent to a third party'
    assert c.post('/api/search/image',files={'file':('red.png',picture('red'),'image/png')}).status_code==429
