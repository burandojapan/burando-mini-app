/* Familiar shopping hierarchy, with real catalog data and existing checkout. */
(() => {
  const $=s=>document.querySelector(s);
  const text=(uz,ru)=>document.documentElement.lang==='ru'?ru:uz;
  $('.brand').onclick=e=>{e.preventDefault();$('#bottomNav [data-page="home"]').click();};
  function promotion(){document.body.classList.toggle('has-promotion',!$('#v7Banner').hidden);}
  new MutationObserver(promotion).observe($('#v7Banner'),{attributes:true,attributeFilter:['hidden']});promotion();
  function reset(){
    $('#closeSearchPanel').click();
    for(const id of ['brandFilter','sizeFilter','minPrice','maxPrice'])$('#'+id).value='';
    $('#favoritesFilter').classList.remove('selected');$('#sortProducts').value='new';setCat('All');
  }
  const render=renderProducts;
  renderProducts=function(){
    render();
    const cards=[...document.querySelectorAll('#products .product-card')];
    $('#catalogCount').textContent=text(`${cards.length} ta mahsulot · USD`,`${cards.length} товаров · USD`);
    for(const card of cards){
      const p=products.find(p=>p.id===card.dataset.productId);if(!p)continue;
      const body=card.querySelector('.product-info');
      if(p.brand){const brand=document.createElement('span');brand.className='product-brand';brand.textContent=p.brand;body.prepend(brand);}
      const variants=[];
      if(p.sizes?.length)variants.push(text(`${p.sizes.length} ta razmer`,`${p.sizes.length} размеров`));
      const colors=p['colors_'+document.documentElement.lang]||p.colors_uz||[];
      if(colors.length)variants.push(text(`${colors.length} ta rang`,`${colors.length} цветов`));
      if(variants.length){const line=document.createElement('span');line.className='product-variants';line.textContent=variants.join(' · ');body.append(line);}
      card.querySelector('.add-btn').textContent=text('Ko‘rish','Подробнее')+' →';
      const img=card.querySelector('.product-image-wrap>img');img.decoding='async';
      card.querySelector('.v7-favorite')?.setAttribute('aria-pressed',String(V7.favorites.has(p.id)));
    }
    if(!cards.length){const button=document.createElement('button');button.className='catalog-reset';button.textContent=text('Barcha mahsulotlarni ko‘rish','Показать все товары');button.onclick=reset;$('#products .empty').append(button);}
  };
  const detail=renderProductDetail;
  renderProductDetail=function(){
    detail();if(!detailProduct)return;
    $('.detail-sale-info')?.remove();$('.market-note')?.remove();
    if(detailProduct.is_sale){const sale=document.createElement('div');sale.className='detail-sale-info';const original=document.createElement('del');original.textContent=money(detailProduct.original_price);sale.append(original,document.createTextNode('−'+detailProduct.discount_percent+'%'));$('#detailPrice').after(sale);}
    const note=document.createElement('p');note.className='market-note';note.textContent=text('Narxlar USD da. To‘lov chekini buyurtma ichida yuborishingiz mumkin. To‘lov admin tekshiruvidan keyin tasdiqlanadi.','Цены в USD. Чек можно отправить внутри заказа. Оплата подтверждается после проверки администратором.');$('.detail-content').append(note);
  };
})();
