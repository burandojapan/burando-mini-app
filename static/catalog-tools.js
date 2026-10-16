/* Compact catalog tools, preserving existing filter IDs and server-priced cart. */
(() => {
  const $ = s => document.querySelector(s);
  const modal=$('#filtersModal'), fields=['brandFilter','sizeFilter','minPrice','maxPrice'];
  const text=(uz,ru)=>document.documentElement.lang==='ru'?ru:uz;
  let snapshot, savedOverflow, isolated=[];
  function summary() {
    const brand=$('#brandFilter').value, size=$('#sizeFilter').value;
    const min=$('#minPrice').value,max=$('#maxPrice').value;
    const count=Number(!!brand)+Number(!!size)+Number(!!(min||max));
    $('#filterCount').hidden=!count;$('#filterCount').textContent=count;
    $('#openFilters').classList.toggle('selected',!!count);
    const parts=[brand,size?text('Razmer: ','Размер: ')+size:'',min||max?`$${min||'0'}–${max?'$'+max:'∞'}`:''].filter(Boolean);
    $('#activeFilterSummary').textContent=parts.join(' · ');$('#activeFilterSummary').hidden=!parts.length;
    const favorites=$('#favoritesFilter');favorites.setAttribute('aria-pressed',String(favorites.classList.contains('selected')));
    const sort=$('#sortProducts');
    sort.setAttribute('aria-label',text('Saralash: ','Сортировка: ')+sort.options[sort.selectedIndex].text);
    sort.parentElement.classList.toggle('selected',sort.value!=='new');
    const n=document.querySelectorAll('#products .product-card').length;
    $('#applyFilters').textContent=text(`Ko‘rsatish (${n})`,`Показать (${n})`);
  }
  function translate() {
    const labels={filterButtonLabel:['Filtrlar','Фильтры'],sortButtonLabel:['Saralash','Сортировка'],filtersTitle:['Filtrlar','Фильтры'],filterBrandLabel:['Brend','Бренд'],filterSizeLabel:['Razmer','Размер'],filterPriceLabel:['Narx, USD','Цена, USD'],filterMinLabel:['Dan','От'],filterMaxLabel:['Gacha','До'],resetFilters:['Tozalash','Сбросить']};
    for(const [id,values] of Object.entries(labels))$('#'+id).textContent=text(...values);
    summary();
  }
  function open() {
    snapshot=fields.map(id=>$('#'+id).value);savedOverflow=document.body.style.overflow;
    $('#filterError').textContent='';modal.classList.add('open');document.body.style.overflow='hidden';
    isolated=[...document.body.children].filter(el=>el!==modal&&!['SCRIPT','STYLE'].includes(el.tagName)).map(el=>[el,el.inert]);
    isolated.forEach(([el])=>el.inert=true);summary();$('#closeFilters').focus();
  }
  function close(apply=false) {
    if(!modal.classList.contains('open'))return;
    if(!apply)fields.forEach((id,i)=>$('#'+id).value=snapshot[i]);
    modal.classList.remove('open');isolated.forEach(([el,was])=>el.inert=was);isolated=[];
    document.body.style.overflow=savedOverflow||'';renderProducts();summary();$('#openFilters').focus();
  }
  $('#openFilters').onclick=open;$('#closeFilters').onclick=()=>close();
  modal.onclick=e=>{if(e.target===modal)close();};
  $('#resetFilters').onclick=()=>{fields.forEach(id=>$('#'+id).value='');$('#filterError').textContent='';renderProducts();summary();};
  $('#applyFilters').onclick=()=>{
    const min=$('#minPrice'),max=$('#maxPrice');
    if(!min.checkValidity()||!max.checkValidity()||(min.value&&max.value&&Number(min.value)>Number(max.value))){
      $('#filterError').textContent=text('Narx oralig‘ini tekshiring: eng kam narx eng ko‘p narxdan oshmasin.','Проверьте диапазон: минимальная цена не должна превышать максимальную.');return;
    }
    close(true);
  };
  document.addEventListener('keydown',e=>{
    if(!modal.classList.contains('open'))return;
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,select,input')],first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  // Existing handlers render the preview; these listeners update the compact summary.
  modal.addEventListener('input',()=>{ $('#filterError').textContent='';summary(); });
  modal.addEventListener('change',summary);
  $('#sortProducts').addEventListener('change',summary);
  new MutationObserver(summary).observe($('#products'),{childList:true});
  new MutationObserver(summary).observe($('#favoritesFilter'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  translate();
})();
