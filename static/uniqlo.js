/* Hierarchical categories, keeping the existing catalog and SALE filter. */
(() => {
  let taxonomy=[];
  const previous=buildCategories;
  buildCategories=function() {
    previous();
    if(!activeCategory.startsWith('uniqlo'))return;
    const bar=document.querySelector('#categories');
    const make=(rows,label,value)=>{
      const select=document.createElement('select');select.setAttribute('aria-label',label);
      const all=document.createElement('option');all.value=value;all.textContent=label;select.append(all);
      for(const row of rows){const opt=document.createElement('option');opt.value=row.slug;opt.textContent=row['title_'+lang];select.append(opt);}
      select.value=rows.find(r=>activeCategory===r.slug||activeCategory.startsWith(r.slug+'/'))?.slug||value;
      select.onchange=()=>setCat(select.value);bar.append(select);
    };
    make(taxonomy.filter(c=>c.parent==='uniqlo'),lang==='ru'?'Все UNIQLO':'Barcha UNIQLO','uniqlo');
    const group=activeCategory.split('/').slice(0,2).join('/');
    if(group!=='uniqlo')make(taxonomy.filter(c=>c.parent===group),lang==='ru'?'Все категории':'Barcha turkumlar',group);
  };
  const previousDetail=renderProductDetail;
  renderProductDetail=function(){
    previousDetail();
    if(!detailProduct)return;
    const target=document.querySelector('#detailPrice');
    if(detailProduct.is_sale){const old=document.createElement('del');old.textContent=money(detailProduct.original_price);target.append(' ',old,' −'+detailProduct.discount_percent+'% SALE');}
  };
  fetch('/api/uniqlo/categories').then(r=>{if(!r.ok)throw Error();return r.json();}).then(rows=>{taxonomy=rows;buildCategories();}).catch(()=>{});
})();
