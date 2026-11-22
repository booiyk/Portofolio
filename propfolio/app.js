/* UI controller. No network services, account logins, or trading integrations. */
(() => {
  'use strict';
  const V = JournalView, $ = id => document.getElementById(id), esc = V.esc;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const state = { data: Ledger.emptyData(), revision: 0, savedAt: null, lastBackup: null, demo: false, page: 'overview', scope: '', monthCount: 6, chartMonth: today().slice(0,7), filters: {search:'',firm:'',status:'',from:'',to:''}, activity: {account:'',type:'',from:'',to:''} };
  let editing = null, confirmationAction = null, busy = false, loaded = false;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('propfolio-updates') : null;
  function render() { V.render(state); }
  function notify(text, error = false) {
    const node = document.createElement('div'); node.className=`toast ${error?'error':'success'}`; node.textContent=text;
    $('toasts').append(node); setTimeout(()=>node.remove(),6000);
  }
  function ensureEditable() {
    if (!loaded) throw new Error('Penyimpanan belum siap.');
    if(state.demo) throw new Error('Mode contoh hanya untuk pratinjau. Kembali ke data saya untuk mencatat transaksi.');
  }
  async function commit(next) {
    ensureEditable();
    const result=await JournalStore.save(next,state.revision);
    const stored=await JournalStore.read();
    if(stored.revision < result.revision) throw new Error('Penyimpanan belum dapat diverifikasi. Muat ulang halaman.');
    Object.assign(state,stored);
    if(!state.data.accounts.some(a=>a.id===state.scope)) state.scope='';
    render(); channel?.postMessage({revision:stored.revision});
  }
  async function refresh() {
    if(!loaded || state.demo || $('editor').open || $('confirmation').open || busy) return;
    const snapshot=await JournalStore.read();
    if(snapshot.revision!==state.revision){Object.assign(state,snapshot);render();notify('Journal diperbarui dari tab lain.');}
  }
  function nav(page) { if(!['overview','accounts','activity','analytics','settings'].includes(page))return;state.page=page;render();window.scrollTo({top:0,behavior:'auto'}); }
  function field(name,label,value='',opts={}) {
    const {type='text',required=true,full=false,help='',max=100,min='0',step='0.01'}=opts;
    const attrs=type==='number'?`min="${min}" max="999999999.99" step="${step}" inputmode="decimal"`:type==='date'?`max="${today()}"`:`maxlength="${max}"`;
    return `<div class="form-field ${full?'full':''}"><label for="f-${name}">${label}${required?' <span class="required">*</span>':''}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${attrs}>${help?`<span class="form-help">${help}</span>`:''}</div>`;
  }
  function select(name,label,choices,current,full=false) {
    return `<div class="form-field ${full?'full':''}"><label for="f-${name}">${label} <span class="required">*</span></label><select id="f-${name}" name="${name}" required>${choices.map(([value,text])=>V.option(value,text,current)).join('')}</select></div>`;
  }
  function modal(title,description,body,readOnly=false) {
    $('modal-title').textContent=title; $('modal-description').textContent=description; $('form-fields').innerHTML=body; $('form-error').hidden=true;
    $('save-record').hidden=readOnly; $('save-record').disabled=false; $('record-form').reset();
    if(!$('editor').open) $('editor').showModal();
  }
  function closeModal() { if(busy)return; $('editor').close(); editing=null; }
  function getRecord(type,id) {return state.data[type==='account'?'accounts':type==='cost'?'costs':'payouts'].find(r=>r.id===id);}
  function openForm(type,id='',accountId='') {
    ensureEditable();
    if(type!=='account'&&!state.data.accounts.length){notify('Tambahkan akun terlebih dahulu.');return openForm('account');}
    const existing=id?getRecord(type,id):null;
    if(id&&!existing)throw new Error('Catatan tidak ditemukan.');
    const row=existing || {};
    editing={type,id,receipt:row.receipt||null};
    let fields='';
    if(type==='account') {
      fields=field('firm','Nama prop firm',row.firm||'')+field('name','Nama akun / paket',row.name||'')+
        field('size','Besaran akun ($)',row.sizeCents===undefined?'':(row.sizeCents/100).toFixed(2),{type:'number',help:'Nilai akun challenge, bukan biaya yang dibayar.'})+
        field('price','Harga pembelian ($)',row.priceCents===undefined?'':(row.priceCents/100).toFixed(2),{type:'number',help:'Nominal yang benar-benar dibayar setelah diskon.'})+
        field('date','Tanggal pembelian',row.date||today(),{type:'date'})+
        select('status','Status akun',[['challenge','Challenge'],['funded','Funded'],['failed','Gagal'],['closed','Ditutup']],row.status||'challenge')+
        field('order','Nomor pesanan',row.order||'',{required:false,max:200,full:true});
    } else {
      fields=select('accountId','Akun prop firm',state.data.accounts.map(a=>[a.id,`${a.firm} · ${a.name}`]),row.accountId||accountId||state.data.accounts[0].id,true)+
        field('amount',type==='payout'?'Payout bersih ($)':'Biaya tambahan ($)',row.amountCents===undefined?'':(row.amountCents/100).toFixed(2),{type:'number',min:'0.01',help:type==='payout'?'Sesudah profit split dan potongan pembayaran.':'Nilai biaya reset, aktivasi, atau biaya lain.'})+
        field('date',type==='payout'?'Tanggal diterima / diajukan':'Tanggal pembayaran',row.date||today(),{type:'date'});
      fields+=type==='payout'?select('status','Status payout',[['received','Sudah diterima'],['pending','Masih menunggu']],row.status||'received',true):field('label','Jenis biaya',row.label||'',{max:120,full:true,help:'Misalnya: Reset challenge atau Aktivasi.'});
      if(type==='payout')fields+='<p class="form-help full">Pilih “Sudah diterima” hanya ketika uang sudah masuk. Saat mengubah payout menunggu menjadi diterima, perbarui tanggalnya.</p>';
    }
    fields+=`<div class="form-field full"><label for="f-note">Catatan (opsional)</label><textarea id="f-note" name="note" maxlength="10000" placeholder="Detail yang ingin kamu ingat…">${esc(row.note||'')}</textarea></div><div class="form-field full"><label for="f-receipt">Bukti pembayaran (opsional)</label><input id="f-receipt" name="receipt" type="file" class="file-input" accept="image/png,image/jpeg,image/webp,application/pdf"><span class="form-help">PNG, JPG, WebP, atau PDF · maksimal 5 MB. Ikut disertakan dalam backup.</span>${row.receipt?`<div class="receipt-current"><span>${esc(row.receipt.name)}</span><label><input type="checkbox" name="removeReceipt"> Hapus bukti lama</label></div>`:''}</div>`;
    modal(`${id?'Edit':'Tambah'} ${type==='account'?'akun prop firm':type==='cost'?'biaya tambahan':'payout'}`,'Semua nominal dalam dolar AS (USD). Isian bertanda * wajib diisi.',fields);
  }
  async function readReceipt(file) {
    if(!file||!file.size)return null;
    if(file.size>Ledger.RECEIPT_LIMIT)throw new Error('Bukti pembayaran melebihi 5 MB.');
    if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))throw new Error('Pilih bukti PNG, JPG, WebP, atau PDF.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Bukti tidak dapat dibaca.'));reader.readAsDataURL(file);});
    return {name:file.name.slice(0,200),type:file.type,data};
  }
  async function saveForm(event) {
    event.preventDefault(); if(busy||!editing)return;
    busy=true; $('save-record').disabled=true; $('form-error').hidden=true;
    try {
      ensureEditable(); const f=new FormData(event.target), previous=editing.id?getRecord(editing.type,editing.id):null;
      const row={id:editing.id||crypto.randomUUID(),date:String(f.get('date')),note:String(f.get('note')||'').trim()};
      if(!Ledger.validDate(row.date)||row.date>today())throw new Error('Tanggal harus valid dan tidak boleh melewati hari ini.');
      if(editing.type==='account')Object.assign(row,{firm:String(f.get('firm')).trim(),name:String(f.get('name')).trim(),sizeCents:Ledger.moneyToCents(f.get('size')),priceCents:Ledger.moneyToCents(f.get('price')),status:String(f.get('status')),order:String(f.get('order')||'').trim()});
      else {
        Object.assign(row,{accountId:String(f.get('accountId')),amountCents:Ledger.moneyToCents(f.get('amount'))});
        if(row.amountCents<=0)throw new Error('Nominal harus lebih besar dari nol.');
        if(editing.type==='cost')row.label=String(f.get('label')||'').trim(); else row.status=String(f.get('status'));
      }
      row.receipt=f.get('removeReceipt')?null:(previous?.receipt||null);
      const file=$('f-receipt').files[0]; if(file)row.receipt=await readReceipt(file);
      const next=structuredClone(state.data), collection=editing.type==='account'?'accounts':editing.type==='cost'?'costs':'payouts';
      const index=next[collection].findIndex(r=>r.id===row.id);
      if(index>=0)next[collection][index]=row;else next[collection].push(row);
      await commit(next); $('editor').close(); editing=null; notify('Catatan tersimpan di browser ini.');
    } catch(err) { $('form-error').textContent=err.message; $('form-error').hidden=false; }
    finally {busy=false;$('save-record').disabled=false;}
  }
  function detail(id) {
    const a=getRecord('account',id);if(!a)return;
    const s=Ledger.accountStats(state.data,id);
    editing=null;
    modal(`${a.firm} · ${a.name}`,`${V.money(a.sizeCents)} · ${V.date(a.date)}`,`<div class="full detail-content"><div class="detail-metrics"><div><span>Total biaya</span><strong>${V.money(s.cost)}</strong></div><div><span>Payout diterima</span><strong class="value-positive">${V.money(s.received)}</strong></div><div><span>Hasil bersih</span><strong>${V.money(s.net)}</strong></div><div><span>ROI</span><strong>${V.percent(s.roi)}</strong></div></div><p>${V.pill(a.status)} <span class="small-note">${s.cost===0?'Tanpa biaya':s.remaining===0?'Sudah balik modal':`Sisa balik modal ${V.money(s.remaining)}`} · ${V.money(s.pending)} menunggu</span></p>${a.order?`<p class="small-note">Pesanan: ${esc(a.order)}</p>`:''}${a.note?`<p class="detail-note">${esc(a.note)}</p>`:''}<div class="actions"><button type="button" class="btn btn-sm" data-action="edit-purchase" data-id="${esc(id)}">Edit akun</button><button type="button" class="btn btn-sm" data-action="cost" data-id="${esc(id)}">+ Biaya</button><button type="button" class="btn btn-sm btn-primary" data-action="payout" data-id="${esc(id)}">+ Payout</button><button type="button" class="btn btn-sm btn-danger btn-quiet" data-action="delete-account" data-id="${esc(id)}">Hapus akun</button></div><div class="detail-table">${V.transactionTable(Ledger.transactions(state.data,[id]))}</div></div>`,true);
  }
  function confirm(title,message,label,action) {
    $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-ok').textContent=label;
    $('confirm-ok').disabled=false;$('confirm-error').hidden=true;confirmationAction=action;$('confirmation').showModal();
  }
  function deleteRecord(type,id) {
    ensureEditable(); const record=getRecord(type,id);if(!record)return;
    const related=type==='account'?state.data.costs.filter(x=>x.accountId===id).length+state.data.payouts.filter(x=>x.accountId===id).length:0;
    confirm(type==='account'?'Hapus akun dan transaksinya?':'Hapus transaksi ini?',type==='account'?`${record.firm} · ${record.name} beserta ${related} transaksi terkait akan dihapus. Pertimbangkan mengubah status menjadi Gagal / Ditutup agar biaya tetap tercatat. Buat backup bila ingin menyimpan salinan.`:'Transaksi yang dihapus akan dikeluarkan dari perhitungan biaya dan ROI.','Hapus',async()=>{
      const next=structuredClone(state.data);
      if(type==='account'){next.accounts=next.accounts.filter(a=>a.id!==id);next.costs=next.costs.filter(c=>c.accountId!==id);next.payouts=next.payouts.filter(p=>p.accountId!==id);}
      else {const key=type==='cost'?'costs':'payouts';next[key]=next[key].filter(r=>r.id!==id);}
      await commit(next);$('editor').close();editing=null;notify('Catatan dihapus.');
    });
  }
  function download(blob,filename) {
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function exportBackup() {
    ensureEditable(); const snapshot=await JournalStore.read();
    const stamp=new Date().toISOString();
    download(new Blob([JSON.stringify({...snapshot.data,app:'Propfolio',currency:'USD',exportedAt:stamp},null,2)],{type:'application/json'}),`propfolio-backup-${today()}.json`);
    state.lastBackup=await JournalStore.backupTime(stamp);render();notify('Unduhan backup dimulai. Simpan file JSON di tempat aman.');
  }
  async function importBackup(file) {
    ensureEditable();if(!file)return;
    if(file.size>100*1024*1024)throw new Error('Backup melebihi batas impor 100 MB.');
    let parsed;try{parsed=JSON.parse(await file.text());}catch(_){throw new Error('File bukan JSON yang valid.');}
    if(parsed.currency&&parsed.currency!=='USD')throw new Error('Backup harus menggunakan USD.');
    const next=Ledger.validateData(parsed);
    confirm('Ganti journal dengan backup?',`File ini berisi ${next.accounts.length} akun, ${next.costs.length} biaya tambahan, dan ${next.payouts.length} payout. Seluruh data saat ini akan diganti. Unduh backup data saat ini terlebih dahulu jika masih diperlukan.`,'Pulihkan backup',async()=>{await commit(next);resetFilters();render();notify('Backup dipulihkan, termasuk bukti pembayaran.');});
  }
  function downloadReceipt(id) {
    const row=Ledger.transactions(state.data).find(r=>r.id===id);if(!row?.receipt)return;
    const receipt=row.receipt, raw=atob(receipt.data.split(',')[1]), bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    download(new Blob([bytes],{type:receipt.type}),receipt.name);
  }
  function resetFilters(){state.scope='';state.filters={search:'',firm:'',status:'',from:'',to:''};state.activity={account:'',type:'',from:'',to:''};}
  async function setDemo(on) {
    if(on){ensureEditable();state.demo=true;state.data=Ledger.validateData(createDemo());}
    else {const saved=await JournalStore.read();state.demo=false;Object.assign(state,saved);}
    resetFilters();state.page='overview';render();
  }
  async function action(name,id) {
    switch(name){
      case 'account':openForm('account');break;
      case 'payout':openForm('payout','',id);break;
      case 'cost':openForm('cost','',id);break;
      case 'detail':detail(id);break;
      case 'edit-purchase':openForm('account',id);break;
      case 'edit-payout':openForm('payout',id);break;
      case 'edit-cost':openForm('cost',id);break;
      case 'delete-account':deleteRecord('account',id);break;
      case 'delete-cost':deleteRecord('cost',id);break;
      case 'delete-payout':deleteRecord('payout',id);break;
      case 'close':closeModal();break;
      case 'receipt':downloadReceipt(id);break;
      case 'export':await exportBackup();break;
      case 'import':ensureEditable();$('import-file').click();break;
      case 'demo':await setDemo(true);break;
      case 'demo-exit':await setDemo(false);break;
      case 'reset-filters':state.filters={search:'',firm:'',status:'',from:'',to:''};render();break;
      case 'reset-activity':state.activity={account:'',type:'',from:'',to:''};render();break;
    }
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-action],[data-nav]');if(!control)return;
    event.preventDefault();
    if(control.dataset.nav)nav(control.dataset.nav);
    else action(control.dataset.action,control.dataset.id||'').catch(err=>notify(err.message,true));
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='mobile-nav')return nav(el.value);
    if(el.dataset.filter){const key=el.dataset.filter;if(key in state.filters)state.filters[key]=el.value;else if(key==='monthCount')state.monthCount=Number(el.value);else if(key==='chartMonth'){if(!/^\d{4}-\d{2}$/.test(el.value))return;state.chartMonth=el.value;}else if(key==='scope')state.scope=el.value;render();}
    if(el.dataset.activity){state.activity[el.dataset.activity]=el.value;render();}
  });
  document.addEventListener('input',event=>{if(event.target.id==='account-search'){state.filters.search=event.target.value;render();}});
  $('record-form').addEventListener('submit',saveForm);
  $('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault();else editing=null;});
  $('confirm-cancel').addEventListener('click',()=>{if(!busy){$('confirmation').close();confirmationAction=null;}});
  $('confirmation').addEventListener('cancel',event=>{if(busy)event.preventDefault();else confirmationAction=null;});
  $('confirm-ok').addEventListener('click',async()=>{
    if(busy||!confirmationAction)return;busy=true;$('confirm-ok').disabled=true;
    try{await confirmationAction();$('confirmation').close();confirmationAction=null;}
    catch(err){$('confirm-error').textContent=err.message;$('confirm-error').hidden=false;}
    finally{busy=false;$('confirm-ok').disabled=false;}
  });
  $('import-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';importBackup(file).catch(err=>notify(err.message,true));});
  channel?.addEventListener('message',()=>refresh().catch(err=>notify(err.message,true)));
  window.addEventListener('focus',()=>refresh().catch(err=>notify(err.message,true)));
  async function start(){
    $('today-label').textContent=new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
    try{const saved=await JournalStore.read();Object.assign(state,saved);state.lastBackup=await JournalStore.backupTime();loaded=true;render();$('loading').hidden=true;$('app-content').hidden=false;}
    catch(err){$('loading').hidden=true;$('fatal-error').textContent=`Journal belum dapat dibuka: ${err.message}`;$('fatal-error').hidden=false;$('save-status').textContent='Penyimpanan tidak tersedia';}
  }
  start();
})();
