(() => {
  const $=s=>document.querySelector(s),modal=$('#imageSearchModal');
  const text=(uz,ru)=>document.documentElement.lang==='ru'?ru:uz;
  const panel=$('#searchPanel');
  let file,preview,controller,ids=null,partial=false,overflow,isolated=[];
  const fullHeight=window.visualViewport?.height||window.innerHeight;
  const original=renderProducts;
  renderProducts=function(){
    const all=products;
    if(ids!==null){const order=new Map(ids.map((id,i)=>[id,i]));products=all.filter(p=>order.has(p.id)).sort((a,b)=>order.get(a.id)-order.get(b.id));}
    try{original();}finally{products=all;}
  };
  function translate(){
    $('#closeSearchPanel').textContent=text('Bekor','Отмена');
    const labels={imageSearchTitle:['Rasm orqali qidirish','Поиск по фото'],imageSearchDescription:['Katalogdagi o‘xshash rang va shakldagi mahsulotlarni qidiring. Aniq brend yoki modelni tanib bermaydi.','Найдите в каталоге товары похожего цвета и формы. Бренд и модель не распознаются.'],imageGalleryLabel:['Rasm yuklash','Загрузить фото'],imageCameraLabel:['Kamera','Камера'],imageSearchPrivacy:['JPEG, PNG, WebP · 5 MB gacha. Rasm doimiy saqlanmaydi.','JPEG, PNG, WebP · до 5 МБ. Фото не сохраняется постоянно.'],runImageSearch:['Qidirish','Найти'],clearImageSearch:['Tozalash','Сбросить']};
    for(const[id,values]of Object.entries(labels))$('#'+id).textContent=text(...values);
    if(ids!==null)$('#imageSearchSummary').textContent=text(`Rasmga o‘xshash: ${ids.length} ta.${partial?' Katalogning bir qismi tekshirildi.':''}`,`Похожие по виду: ${ids.length}.${partial?' Проверена часть каталога.':''}`);
  }
  function clear(){ids=null;$('#imageSearchResult').hidden=true;renderProducts();}
  function showSearch(show){
    document.body.classList.toggle('search-mode',show);
    if(!show){$('#search').value='';clear();$('#search').blur();document.body.classList.remove('search-keyboard');}
  }
  $('#search').addEventListener('focus',()=>{showSearch(true);keyboard();});
  $('#search').addEventListener('blur',()=>setTimeout(()=>{
    if(!$('#searchForm').contains(document.activeElement)&&!$('#search').value&&ids===null)document.body.classList.remove('search-mode');
    keyboard();
  },100));
  function keyboard(){
    const viewport=window.visualViewport;
    const editing=document.activeElement===$('#search');
    document.body.classList.toggle('search-keyboard',!!(editing&&viewport&&fullHeight-viewport.height>120));
  }
  window.visualViewport?.addEventListener('resize',keyboard);
  $('#closeSearchPanel').onclick=()=>showSearch(false);
  $('#bottomNav').addEventListener('click',e=>{if(e.target.closest('[data-page="home"]'))showSearch(false);});
  function open(){
    overflow=document.body.style.overflow;modal.classList.add('open');document.body.style.overflow='hidden';
    isolated=[...document.body.children].filter(el=>el!==modal&&!['SCRIPT','STYLE'].includes(el.tagName)).map(el=>[el,el.inert]);isolated.forEach(([el])=>el.inert=true);$('#closeImageSearch').focus();
  }
  function close(){
    controller?.abort();controller=null;modal.classList.remove('open');document.body.style.overflow=overflow||'';
    isolated.forEach(([el,was])=>el.inert=was);isolated=[];$('#openImageSearch').focus();
    file=null;if(preview)URL.revokeObjectURL(preview);preview=null;$('#imageSearchPreview').hidden=true;$('#imageSearchPreview').removeAttribute('src');
    for(const input of modal.querySelectorAll('input')){input.value='';input.disabled=false;}
    $('#runImageSearch').disabled=true;$('#imageSearchFeedback').textContent='';
  }
  $('#openImageSearch').onclick=open;$('#closeImageSearch').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
  for(const input of modal.querySelectorAll('input')) input.onchange=()=>{
    file=input.files?.[0];$('#runImageSearch').disabled=true;$('#imageSearchFeedback').textContent='';
    if(preview)URL.revokeObjectURL(preview);preview=null;$('#imageSearchPreview').hidden=true;
    if(!file)return;
    if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){
      file=null;$('#imageSearchFeedback').textContent=text('JPEG, PNG yoki WebP, 5 MB gacha. HEIC rasmni JPEGga o‘tkazing.','JPEG, PNG или WebP до 5 МБ. Конвертируйте HEIC в JPEG.');return;
    }
    preview=URL.createObjectURL(file);$('#imageSearchPreview').src=preview;$('#imageSearchPreview').hidden=false;$('#runImageSearch').disabled=false;
  };
  $('#runImageSearch').onclick=async()=>{
    if(!file)return;controller=new AbortController();const current=controller;
    $('#runImageSearch').disabled=true;modal.querySelectorAll('input').forEach(x=>x.disabled=true);
    $('#imageSearchFeedback').textContent=text('Rasmlar solishtirilmoqda…','Сравниваем фотографии…');
    const form=new FormData();form.append('file',file);
    const timer=setTimeout(()=>current.abort(),45000);
    try{
      const response=await fetch('/api/search/image',{method:'POST',body:form,signal:current.signal,cache:'no-store'});
      if(!response.ok)throw Error(response.status===429?text('Biroz kutib qayta urinib ko‘ring.','Подождите и повторите.'):text('Rasmni solishtirib bo‘lmadi. Boshqa JPEG/PNG/WebP rasm bilan qayta urinib ko‘ring.','Не удалось сравнить фото. Повторите с другим JPEG/PNG/WebP.'));
      const result=await response.json();if(current.signal.aborted)return;
      ids=result.ids;partial=result.partial;
      document.body.classList.add('search-mode');
      $('#search').value='';for(const id of ['brandFilter','sizeFilter','minPrice','maxPrice'])$('#'+id).value='';
      $('#favoritesFilter').classList.remove('selected');$('#sortProducts').value='new';setCat('All');
      $('#imageSearchResult').hidden=false;translate();close();$('#imageSearchResult').scrollIntoView?.({block:'center',behavior:'auto'});
    }catch(error){if(controller===current)$('#imageSearchFeedback').textContent=error.name==='AbortError'?text('Vaqt tugadi. Qayta urinib ko‘ring.','Время ожидания истекло. Повторите.'):error.message;}
    finally{clearTimeout(timer);if(controller===current){controller=null;$('#runImageSearch').disabled=!file;modal.querySelectorAll('input').forEach(x=>x.disabled=false);}}
  };
  $('#clearImageSearch').onclick=clear;
  $('#search').addEventListener('input',()=>{if(ids!==null)clear();});
  $('#searchForm').onsubmit=e=>{e.preventDefault();renderProducts();$('#search').blur();$('#products').scrollIntoView?.({block:'start',behavior:'auto'});};
  document.addEventListener('keydown',e=>{
    if(!modal.classList.contains('open')){
      if(e.key==='Escape'&&document.body.classList.contains('search-mode')&&!document.querySelector('.modal.open')){e.preventDefault();showSearch(false);}
      return;
    }
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button,input')].filter(el=>!el.disabled),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
})();
