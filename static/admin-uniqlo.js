/* All actions reuse existing admin authorization; source credentials stay on server. */
(() => {
  const section=document.createElement('section');section.className='card form';section.id='uniqloSync';
  section.innerHTML=`<h2>UNIQLO SYNC · TEST</h2><button id="uqLoad">Holat va tarixni ko‘rish</button><p id="uqMessage" role="status"></p><div id="uqStats"></div>
  <form id="uqSettings"><h3>Narx va ruxsat sozlamalari</h3>
  <label><input type="checkbox" name="paused" checked> Avtomatik sync pauzada</label>
  <label><input type="checkbox" name="approved"> Manba va narx qoidasini tasdiqlayman</label>
  <label>Ma’lumot, rasm va tarjima ruxsati hujjati <input name="permission_reference" maxlength="2000"></label>
  <label>Ustama, % <input name="markup_percent" type="number" min="0" max="500" step="0.01" value="50" required></label>
  <label>Narx o‘zgarishi <select name="price_policy"><option value="review">Admin tekshirsin (mahsulot yashiriladi)</option><option value="automatic">Avtomatik yangilansin</option></select></label>
  <label>1 USD = JPY <input name="usdjpy_rate" type="number" min="1" max="1000" step="0.000001" value="150" required></label>
  <label>Kurs olish usuli <select name="rate_mode"><option value="manual">Admin tasdiqlagan qiymat (26 soat)</option><option value="feed">Tasdiqlangan feed orqali har kuni</option></select></label>
  <label>Kurs manbasi <input name="rate_source" maxlength="300"></label>
  <label>Kurs sanasi, ISO 8601 (vaqt zonasi bilan) <input name="rate_observed_at" placeholder="2026-10-23T09:00:00+09:00"></label>
  <label><input name="rate_approved" type="checkbox"> Kursni tasdiqlayman</label><button>Sozlamalarni saqlash</button></form>
  <button id="uqRun">Hozir sinxronlash</button>
  <form id="uqImport"><label>UNIQLO Japan havolasi <input name="url" type="url" required></label><button type="button" id="uqDraft">Qoralamaga olish</button><button type="button" id="uqInspect">Rasmiy havolani tekshirish</button><button>Ruxsatli feeddan katalogga import</button></form><div id="uqInspection" aria-live="polite"></div>
  <form id="uqMap"><h3>Tasniflanmagan mahsulotlarni tekshirish</h3><label>Manbadagi kategoriya ID <input name="source_category_id" required maxlength="150"></label>
  <label>BURANDO kategoriyasi <select name="target"></select></label><label><input name="verified" type="checkbox" required> Manba metama’lumoti bilan tekshirildi</label><button>Moslikni saqlash</button></form>
  <h3>Mahsulot qoralamalari</h3><p>Qoralamalar xaridorlarga ko‘rinmaydi. Saytdagi rang va razmerlar ro‘yxati qoldiq tasdig‘i emas.</p><div id="uqReviews"></div><h3>Sinxronlash tarixi</h3><pre id="uqHistory" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>`;
  document.getElementById('settingsTab').append(section);
  const $=id=>document.getElementById(id);let loaded=false;
  function card(review){
    const p=review.proposed_price||{},s=p.snapshot||{};
    const box=document.createElement('article');box.className='card';box.style.cssText='margin:12px 0;padding:16px;min-width:0;overflow-wrap:anywhere';
    const line=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;box.append(e);return e;};
    line('h3',s.name_uz||s.source_name||review.external_id||'Mahsulot qoralamasi');
    line('p','QORALAMA · Katalogda chiqarilmagan');
    line('p','Mahsulot kodi: '+(review.external_id||s.product_id||'—'));
    if(s.category_metadata)line('p','Kategoriya: '+[s.category_metadata.gender,s.category_metadata.category].filter(Boolean).join(' / '));
    line('p','Manba narxi: '+(p.regular_jpy??s.regular_jpy??'—')+' JPY'+((p.discounted_jpy??s.discounted_jpy)?' · Chegirmada: '+(p.discounted_jpy??s.discounted_jpy)+' JPY':''));
    line('p','BURANDO USD narxi: '+(p.price!=null?'$'+p.price:'kurs va narx qoidasi tasdiqlanmagan'));
    if(s.colors?.length)line('p','Ranglar: '+s.colors.map(c=>c.name).join(', '));
    if(s.sizes?.length)line('p','Razmerlar: '+s.sizes.map(v=>v.name).join(', '));
    line('p','Mavjudligi: buyurtmadan keyin alohida tekshiriladi. Rang–razmer kombinatsiyalari tasdiqlanmagan.');
    line('p','Rasm: hali biriktirilmagan');
    if(review.reason)line('p',review.reason);
    if(s.observed_at)line('p','Manba tekshirilgan vaqt: '+new Date(s.observed_at).toLocaleString('uz-UZ'));
    if(s.url&&/^https:\/\/www\.uniqlo\.com\/jp\/ja\/products\/E\d{6}-\d{3}\/\d{2}$/.test(s.url)){
      const link=line('a','Manba sahifasini ochish');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';
    }
    return box;
  }
  function reviews(rows){
    $('uqReviews').replaceChildren();
    if(!rows?.length){$('uqReviews').textContent='Hozircha qoralama yo‘q.';return;}
    for(const row of rows)$('uqReviews').append(card(row));
  }
  const request=async(path,method='GET',body)=>{
    const sessionKey=adminKey;
    const r=await fetch('/api/admin/uniqlo'+path,{method,headers:{'X-Admin-Key':adminKey,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const data=await r.json();if(!sessionKey||sessionKey!==adminKey)throw Error('Admin sessiyasi tugadi');if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Sozlamalarni tekshiring');return data;
  };
  async function load(){
    const d=await request('');loaded=true;
    $('uqStats').textContent=`Jami: ${d.total} · Faol: ${d.active} · SALE: ${d.sale} · Mavjud variantlar: ${d.available_variants} · Oxirgi muvaffaqiyat: ${d.last_success||'—'}`;
    for(const [name,value] of Object.entries(d.settings)){const input=$('uqSettings').elements.namedItem(name);if(!input)continue;if(input.type==='checkbox')input.checked=value;else input.value=value??'';}
    $('uqHistory').textContent=JSON.stringify(d.history,null,2);reviews(d.reviews);
  }
  async function action(fn,button,successText="Bajarildi"){
    if(button)button.disabled=true;$('uqMessage').textContent='Bajarilmoqda…';
    try{await fn();$('uqMessage').textContent=successText;}catch(e){$('uqMessage').textContent=e.message;}finally{if(button)button.disabled=false;}
  }
  $('uqLoad').onclick=()=>action(load,$('uqLoad'));
  $('uqSettings').onsubmit=e=>{e.preventDefault();action(async()=>{if(!loaded)throw Error('Avval mavjud sozlamalarni yuklang');const f=e.target.elements;
    const body={};for(const name of ['paused','approved','rate_approved'])body[name]=f[name].checked;
    for(const name of ['permission_reference','price_policy','rate_source','rate_mode'])body[name]=f[name].value;
    for(const name of ['markup_percent','usdjpy_rate'])body[name]=Number(f[name].value);
    body.rate_observed_at=f.rate_observed_at.value||null;
    await request('/settings','PUT',body);await load();},e.submitter);};
  $('uqInspect').onclick=()=>action(async()=>{
    const d=await request('/inspect','POST',{url:$('uqImport').elements.url.value});
    $('uqInspection').replaceChildren(card({external_id:d.product_id,proposed_price:{...d,snapshot:d},reason:d.blockers.join(' ')}));
  },$('uqInspect'),'Havola tekshirildi — katalogga import qilinmadi');
  $('uqDraft').onclick=()=>action(async()=>{
    await request('/draft','POST',{url:$('uqImport').elements.url.value});await load();
  },$('uqDraft'),'Mahsulot qoralamasi saqlandi. Xaridorlar katalogida chiqarilmadi.');
  $('uqRun').onclick=()=>action(async()=>{await request('/sync','POST',{});await load();},$('uqRun'));
  $('uqImport').onsubmit=e=>{e.preventDefault();action(async()=>{await request('/import','POST',{url:e.target.elements.url.value});await load();},e.submitter);};
  $('uqMap').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target.elements;const parts=f.target.value.split('/');await request('/mapping','PUT',{source_category_id:f.source_category_id.value,audience:parts[1],category:parts[2],verified:f.verified.checked});await load();},e.submitter);};
  fetch('/api/uniqlo/categories').then(r=>r.json()).then(rows=>{for(const c of rows.filter(c=>c.slug.split('/').length===3)){const o=document.createElement('option');o.value=c.slug;o.textContent=c.slug+' · '+c.title_uz;$('uqMap').elements.target.append(o);}}).catch(()=>{});
})();
