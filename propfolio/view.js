window.JournalView = (() => {
  'use strict';
  const esc = Ledger.escapeHtml;
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const percent = value => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  const date = value => new Date(`${value}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const statusNames = { challenge: 'Challenge', funded: 'Funded', failed: 'Gagal', closed: 'Ditutup', received: 'Diterima', pending: 'Menunggu', paid: 'Dibayar' };
  const iconPaths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    accounts: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 12v3h4v-3"/>',
    arrows: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
    chart: '<path d="M4 3v17h17M8 14l4-5 4 3 5-7"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'arrow-down': '<path d="M7 4v16m-4-4 4 4 4-4M15 4h6m-6 5h6m-6 5h6"/>',
    wallet: '<path d="M4 7V5a2 2 0 0 1 2-2h12v4M4 7h16v14H4zM15 11h5v6h-5z"/>',
    trend: '<path d="m3 16 6-6 4 4 8-9m-6 0h6v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    arrow: '<path d="M4 12h16m-5-5 5 5-5 5"/>'
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.grid}</svg>`;
  const pill = value => `<span class="status-pill ${esc(value)}">${esc(statusNames[value] || value)}</span>`;
  const tone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
  const option = (value, title, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(title)}</option>`;
  const empty = (title, text, action = '') => `<div class="empty-state"><div class="empty-symbol">${icon('accounts')}</div><strong>${title}</strong><p>${text}</p>${action}</div>`;
  const button = (action, label, id = '', extra = '') => `<button class="btn btn-sm ${extra}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const headings = {
    overview: ['Ringkasan portofolio', 'Satu tempat untuk biaya challenge, payout, dan hasil investasimu.'],
    accounts: ['Akun prop firm', 'Setiap pembelian, dari challenge pertama sampai payout berikutnya.'],
    activity: ['Riwayat transaksi', 'Semua uang keluar dan payout, tercatat per akun.'],
    analytics: ['Di balik angkanya', 'Lihat pengeluaran, hasil bersih, dan kontribusi setiap firm.'],
    settings: ['Data & pengaturan', 'Journal pribadimu disimpan di browser ini. Kendalikan backup-nya.']
  };
  function scopedIds(state) { return state.scope ? [state.scope] : undefined; }
  function scopeFilter(state) {
    return `<div class="filter-row"><label class="visually-hidden" for="scope">Filter ringkasan akun</label><select id="scope" class="filter-select" data-filter="scope">${option('', 'Semua akun', state.scope)}${state.data.accounts.map(a => option(a.id, `${a.firm} · ${a.name}`, state.scope)).join('')}</select><span class="scope-note">Total sejak pembelian · USD</span><span class="local-label"><span class="online-dot"></span> Penyimpanan lokal</span></div>`;
  }
  function metrics(state) {
    const t = Ledger.totals(state.data, scopedIds(state));
    return `<div class="metrics-grid">
      <article class="metric-card"><div class="metric-label"><span>Total biaya</span><span>${icon('wallet')}</span></div><p class="metric-value" data-metric="cost">${money(t.cost)}</p><span class="metric-sub">${t.count} akun · termasuk biaya tambahan</span></article>
      <article class="metric-card"><div class="metric-label"><span>Payout diterima</span><span>${icon('arrow-down')}</span></div><p class="metric-value value-positive" data-metric="received">${money(t.received)}</p><span class="metric-sub">${money(t.pending)} masih menunggu</span></article>
      <article class="metric-card"><div class="metric-label"><span>Hasil bersih</span><span>${icon('trend')}</span></div><p class="metric-value value-${tone(t.net)}" data-metric="net">${money(t.net)}</p><span class="metric-sub">Payout diterima − total biaya</span></article>
      <article class="metric-card roi-card"><div class="metric-label"><span>Return on investment</span><span>${icon('target')}</span></div><p class="metric-value value-${tone(t.roi || 0)}" data-metric="roi">${percent(t.roi)}</p><span class="metric-sub">${t.cost ? 'Berdasarkan biaya, bukan besaran akun' : 'ROI tersedia setelah ada biaya'}</span></article>
    </div>`;
  }
  function monthRows(state, count) {
    const [year, month] = state.chartMonth.split('-').map(Number);
    return Ledger.monthly(state.data, scopedIds(state), count, new Date(year, month - 1, 1, 12));
  }
  function chart(state) {
    const rows = monthRows(state, state.monthCount);
    const max = Math.max(100, ...rows.flatMap(r => [r.cost, r.received]));
    const y = value => 182 - value / max * 145;
    const slot = 530 / rows.length;
    const bars = rows.map((r, i) => {
      const x = 66 + i * slot;
      const bw = Math.min(15, slot / 3);
      return `<g><rect x="${x - bw - 2}" y="${y(r.cost)}" width="${bw}" height="${182 - y(r.cost)}" rx="3" fill="#667b94"><title>${r.key} · Biaya ${money(r.cost)}</title></rect><rect x="${x + 2}" y="${y(r.received)}" width="${bw}" height="${182 - y(r.received)}" rx="3" fill="#b9f56a"><title>${r.key} · Payout ${money(r.received)}</title></rect><text x="${x}" y="206" text-anchor="middle" class="chart-label">${esc(r.date.toLocaleDateString('id-ID', {month:'short'}))}</text></g>`;
    }).join('');
    return `<div class="chart-controls"><div class="chart-legend"><span><i class="swatch cost"></i>Biaya</span><span><i class="swatch payout"></i>Payout diterima</span></div><label>Bulan akhir <input id="chart-month" type="month" value="${esc(state.chartMonth)}" data-filter="chartMonth" aria-label="Bulan akhir grafik"></label></div><div class="chart-wrap"><svg viewBox="0 0 610 225" role="img" aria-label="Grafik biaya dan payout diterima. Angka rinci tersedia di tabel analisis bulanan.">${[0,.5,1].map(v => `<line x1="45" x2="598" y1="${y(v*max)}" y2="${y(v*max)}" class="chart-grid-line"/><text x="35" y="${y(v*max)+3}" text-anchor="end" class="chart-label">${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(v*max/100)}</text>`).join('')}${bars}</svg></div>`;
  }
  function overview(state) {
    const t = Ledger.totals(state.data, scopedIds(state));
    const progress = t.cost ? Math.min(t.received/t.cost*100,100) : 0;
    const selected = state.data.accounts.filter(a => !state.scope || a.id === state.scope);
    return `${scopeFilter(state)}${metrics(state)}${!state.data.accounts.length ? `<div class="welcome"><div class="welcome-visual">${icon('accounts')}</div><div><span class="eyebrow">MULAI JOURNALMU</span><h2>Challenge pertama, catatan pertama.</h2><p>Tambahkan akun yang kamu beli. Biaya, payout, dan ROI akan terhitung otomatis.</p><div class="actions">${button('account','+ Tambah akun pertama','','btn-primary')}${button('demo','Lihat contoh tampilan')}</div></div></div>` : ''}
    <div class="grid-two"><article class="panel"><header class="panel-header"><div><h2 class="panel-title">Arus dana</h2><p class="panel-caption">Pembelian & biaya dibandingkan dengan payout.</p></div><span class="subtle-tag">${state.monthCount} BULAN</span></header><div class="panel-body">${chart(state)}</div></article><article class="panel"><header class="panel-header"><div><h2 class="panel-title">Menuju balik modal</h2><p class="panel-caption">Payout diterima dibandingkan seluruh biaya.</p></div>${icon('target')}</header><div class="panel-body"><div class="break-even-head"><div class="break-even-number">${progress.toFixed(0)}<small>% tertutup</small></div><span class="subtle-tag">${t.breakEven} AKUN BEP</span></div><div class="progress-track" role="progressbar" aria-label="Biaya tertutup payout" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div><div class="progress-meta"><span>${money(t.received)} diterima</span><span>Biaya ${money(t.cost)}</span></div><div class="legend"><div class="legend-row"><span class="legend-label"><i class="legend-dot lime"></i>Sisa balik modal keseluruhan</span><strong>${money(Math.max(t.cost-t.received,0))}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot amber"></i>Payout menunggu</span><strong>${money(t.pending)}</strong></div><div class="legend-row"><span class="legend-label"><i class="legend-dot red"></i>Akun gagal / ditutup</span><strong>${selected.filter(a=>['failed','closed'].includes(a.status)).length} akun</strong></div></div><p class="small-note">Akun gagal tetap masuk biaya. Payout menunggu belum dihitung sebagai hasil.</p></div></article></div>
    <article class="panel table-panel"><header class="panel-header"><div><h2 class="panel-title">Aktivitas terbaru</h2><p class="panel-caption">Pembelian, biaya tambahan, dan payout per akun.</p></div><button class="btn btn-quiet btn-sm" data-nav="activity">Lihat semua ${icon('arrow')}</button></header>${transactionTable(Ledger.transactions(state.data,scopedIds(state)).slice(0,5), false)}</article>`;
  }
  function accountCard(account, data) {
    const s = Ledger.accountStats(data,account.id);
    return `<article class="account-card" data-account="${esc(account.id)}"><div class="account-card-head"><div class="firm-identity"><span class="firm-avatar">${esc(account.firm.slice(0,2).toUpperCase())}</span><div><h3>${esc(account.firm)}</h3><span class="firm">${esc(account.name)}</span></div></div>${pill(account.status)}</div><p class="account-size">${money(account.sizeCents)} <span>besaran akun</span></p><div class="account-kpis">${[['Total biaya',money(s.cost),''],['Payout diterima',money(s.received),'positive'],['Hasil bersih',money(s.net),tone(s.net)],['ROI',percent(s.roi),tone(s.roi||0)]].map(([label,value,color])=>`<div><div class="kpi-label">${label}</div><div class="kpi-value ${color}">${value}</div></div>`).join('')}</div><div class="account-progress"><div class="progress-track"><div class="progress-fill" style="width:${s.recovered}%"></div></div><div class="progress-meta"><span>${s.cost === 0 ? 'Tanpa biaya · ROI tidak tersedia' : s.remaining === 0 ? 'Sudah balik modal' : `Sisa BEP ${money(s.remaining)}`}</span><span>${money(s.pending)} menunggu</span></div></div><p class="account-meta">Dibeli ${date(account.date)}</p><div class="account-footer">${button('detail','Detail',account.id,'btn-quiet')}${button('cost','+ Biaya',account.id)}${button('payout','+ Payout',account.id,'btn-primary')}</div></article>`;
  }
  function accounts(state) {
    const f = state.filters;
    const firms = [...new Set(state.data.accounts.map(a=>a.firm))].sort();
    const list = state.data.accounts.filter(a => (!f.search || `${a.firm} ${a.name} ${a.order||''}`.toLowerCase().includes(f.search.toLowerCase())) && (!f.firm || a.firm === f.firm) && (!f.status || a.status === f.status) && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to)).sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="filter-row account-filters"><label class="search-input">${icon('search')}<input id="account-search" placeholder="Cari firm, akun, atau pesanan…" aria-label="Cari akun" data-filter="search" value="${esc(f.search)}"></label><select id="firm-filter" class="filter-select" aria-label="Filter firm" data-filter="firm">${option('','Semua firm',f.firm)}${firms.map(x=>option(x,x,f.firm)).join('')}</select><select id="status-filter" class="filter-select" aria-label="Filter status akun" data-filter="status">${option('','Semua status',f.status)}${Ledger.ACCOUNT_STATUSES.map(s=>option(s,statusNames[s],f.status)).join('')}</select><label class="date-filter">Dari<input type="date" id="account-from" data-filter="from" value="${esc(f.from)}" aria-label="Pembelian dari tanggal"></label><label class="date-filter">Sampai<input type="date" id="account-to" data-filter="to" value="${esc(f.to)}" aria-label="Pembelian sampai tanggal"></label>${button('reset-filters','Reset','','btn-quiet')}</div><div class="section-heading"><p>${list.length} dari ${state.data.accounts.length} akun · semua nilai dalam USD</p></div>${list.length ? `<div class="account-grid">${list.map(a=>accountCard(a,state.data)).join('')}</div>` : empty('Belum ada akun yang ditampilkan',state.data.accounts.length ? 'Coba ubah filter atau kata pencarian.' : 'Catat pembelian akun pertamamu untuk mulai menghitung ROI.',button('account','+ Tambah akun','','btn-primary'))}`;
  }
  function transactionTable(rows, actions = true) {
    if (!rows.length) return empty('Belum ada transaksi', 'Transaksi akan muncul setelah kamu mencatat pembelian atau payout.');
    return `<div class="table-scroll"><table><thead><tr><th>Tanggal</th><th>Akun / firm</th><th>Transaksi</th><th>Nominal USD</th><th>Status</th>${actions?'<th>Aksi</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td class="nowrap">${date(r.date)}</td><td><span class="account-name">${esc(r.account.firm)}</span><span class="account-meta">${esc(r.account.name)}</span></td><td>${esc(r.label)}${r.note ? `<span class="account-meta ellipsis" title="${esc(r.note)}">${esc(r.note)}</span>`:''}</td><td class="amount ${r.type==='payout' ? r.status==='pending'?'pending':'positive' : ''}">${r.type==='payout'?'+':'−'}${money(r.amountCents)}</td><td>${pill(r.status)}</td>${actions?`<td><div class="row-actions">${r.receipt ? button('receipt','Bukti',r.id,'btn-quiet'):''}${button(`edit-${r.type}`, 'Edit',r.id,'btn-quiet')}${r.type!=='purchase'?button(`delete-${r.type}`,'Hapus',r.id,'btn-quiet btn-danger'):''}</div></td>`:''}</tr>`).join('')}</tbody></table></div>`;
  }
  function activity(state) {
    const f = state.activity;
    const rows = Ledger.transactions(state.data).filter(r=>(!f.account || r.accountId===f.account) && (!f.type || (['pending','received'].includes(f.type) ? r.type==='payout' && r.status===f.type : r.type===f.type)) && (!f.from || r.date>=f.from) && (!f.to || r.date<=f.to));
    return `<div class="filter-row"><select id="activity-account" class="filter-select" data-activity="account" aria-label="Filter transaksi per akun">${option('','Semua akun',f.account)}${state.data.accounts.map(a=>option(a.id,`${a.firm} · ${a.name}`,f.account)).join('')}</select><select id="activity-type" class="filter-select" data-activity="type" aria-label="Jenis transaksi">${[['','Semua transaksi'],['purchase','Pembelian'],['cost','Biaya tambahan'],['received','Payout diterima'],['pending','Payout menunggu']].map(([v,t])=>option(v,t,f.type)).join('')}</select><label class="date-filter">Dari<input id="activity-from" type="date" data-activity="from" value="${esc(f.from)}" aria-label="Transaksi dari tanggal"></label><label class="date-filter">Sampai<input id="activity-to" type="date" data-activity="to" value="${esc(f.to)}" aria-label="Transaksi sampai tanggal"></label>${button('reset-activity','Reset','','btn-quiet')}</div><article class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">${rows.length} transaksi</h2><p class="panel-caption">Payout dicatat sesuai nominal bersih yang diterima.</p></div>${button('cost','+ Biaya tambahan')}</div>${transactionTable(rows)}</article>`;
  }
  function analytics(state) {
    const rows = monthRows(state,state.monthCount);
    const firms = [...new Set(state.data.accounts.map(a=>a.firm))].map(name=>({name,...Ledger.totals(state.data,state.data.accounts.filter(a=>a.firm===name).map(a=>a.id))})).sort((a,b)=>b.net-a.net);
    const max = Math.max(1,...firms.map(f=>f.cost));
    return `${scopeFilter(state)}${metrics(state)}<div class="analytics-grid"><article class="panel"><div class="panel-header"><div><h2 class="panel-title">Biaya & payout bulanan</h2><p class="panel-caption">Grafik mengikuti pilihan akun di atas.</p></div><select id="month-count" data-filter="monthCount" class="filter-select" aria-label="Rentang bulan">${[6,12].map(n=>option(String(n),`${n} bulan`,String(state.monthCount))).join('')}</select></div><div class="panel-body">${chart(state)}</div></article><article class="panel"><div class="panel-header"><div><h2 class="panel-title">Biaya per firm</h2><p class="panel-caption">Seluruh akun · sejak pembelian pertama</p></div></div><div class="panel-body bar-list">${firms.length?firms.map(f=>`<div><div class="bar-item-head"><span>${esc(f.name)}</span><strong>${money(f.cost)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${f.cost/max*100}%"></div></div><p class="small-note">Payout ${money(f.received)} · ROI ${percent(f.roi)}</p></div>`).join(''):empty('Belum ada perbandingan','Tambahkan akun untuk melihat biaya tiap firm.')}</div></article></div><article class="panel table-panel spaced"><div class="panel-header"><div><h2 class="panel-title">Rincian per bulan</h2><p class="panel-caption">Hasil bersih bulan ini = payout diterima − biaya yang dibayar pada bulan ini.</p></div></div><div class="table-scroll"><table><thead><tr><th>Bulan</th><th>Biaya USD</th><th>Payout USD</th><th>Hasil bersih USD</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td>${esc(r.date.toLocaleDateString('id-ID',{month:'long',year:'numeric'}))}</td><td class="amount">${money(r.cost)}</td><td class="amount positive">${money(r.received)}</td><td class="amount ${tone(r.net)}">${money(r.net)}</td></tr>`).join('')}</tbody></table></div></article><div class="formula-note"><strong>Cara menghitung ROI</strong><p>(Payout diterima − seluruh biaya) ÷ seluruh biaya × 100%. ROI keseluruhan dihitung dari total uang, bukan rata-rata persentase tiap akun. Jika biaya nol, ROI ditampilkan sebagai “—”.</p></div>`;
  }
  function settings(state) {
    return `<div class="settings-grid"><article class="panel settings-card"><p class="eyebrow">DATA MILIKMU</p><h2>Lokal, sederhana, pribadi.</h2><p>Data tersimpan di browser dan alamat situs ini. Gunakan browser serta alamat yang sama setiap kali membuka journal.</p><div class="setting-fact"><span>Mata uang</span><strong>USD ($)</strong></div><div class="setting-fact"><span>Jumlah akun</span><strong>${state.data.accounts.length}</strong></div><div class="setting-fact"><span>Payout tercatat</span><strong>${state.data.payouts.length}</strong></div><div class="setting-fact"><span>Biaya tambahan</span><strong>${state.data.costs.length}</strong></div><div class="setting-fact"><span>Mode data</span><strong>${state.demo?'Contoh sementara':'Data pribadi · IndexedDB'}</strong></div><div class="warning-note">Menghapus data browser, memakai mode privat, atau berganti perangkat bisa membuat journal tidak tersedia. Simpan backup secara berkala.</div></article><article class="panel settings-card"><h2>Backup & pemulihan</h2><p>Backup JSON menyertakan seluruh akun, biaya, payout, dan bukti pembayaran.</p><div class="settings-actions"><div class="settings-action"><div><strong>Ekspor backup lengkap</strong><span>${state.lastBackup ? `Unduhan terakhir dimulai ${esc(new Date(state.lastBackup).toLocaleString('id-ID'))}` : 'Belum pernah mengunduh backup'}</span></div>${button('export','Unduh JSON')}</div><div class="settings-action"><div><strong>Pulihkan dari backup</strong><span>Mengganti seluruh journal. Kamu akan diminta konfirmasi.</span></div>${button('import','Pilih file JSON')}</div><div class="settings-action"><div><strong>Lihat contoh dashboard</strong><span>Data ilustrasi terpisah; tidak disimpan ke journalmu.</span></div>${button(state.demo?'demo-exit':'demo',state.demo?'Keluar contoh':'Lihat contoh')}</div></div><div class="formula-note"><strong>Nominal yang dicatat</strong><p>Harga pembelian adalah jumlah setelah diskon. Payout diterima adalah jumlah bersih sesudah potongan. Besaran akun challenge bukan modal dalam perhitungan ROI.</p></div></article></div>`;
  }
  function render(state) {
    const active = document.activeElement;
    const focusId = active?.id;
    let selection;
    try { if (active?.selectionStart != null) selection = [active.selectionStart,active.selectionEnd]; } catch (_) {}
    const renderers = {overview,accounts,activity,analytics,settings};
    document.querySelectorAll('.page').forEach(p=>{p.classList.toggle('active',p.id===`page-${state.page}`); if(p.id!==`page-${state.page}`) p.innerHTML='';});
    document.getElementById(`page-${state.page}`).innerHTML=renderers[state.page](state);
    document.getElementById('page-title').textContent=headings[state.page][0];
    document.getElementById('page-description').textContent=headings[state.page][1];
    document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('active',el.dataset.nav===state.page); if(el.dataset.nav===state.page) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');});
    document.getElementById('mobile-nav').value=state.page;
    document.getElementById('account-count').textContent=state.data.accounts.length;
    document.getElementById('demo-banner').hidden=!state.demo;
    document.getElementById('save-status').textContent=state.demo?'Data contoh tidak disimpan' : state.savedAt ? `Tersimpan lokal · ${new Date(state.savedAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}` : 'Siap · penyimpanan lokal';
    document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
    if (focusId) {
      const target = document.getElementById(focusId);
      if (target && target!==document.activeElement) { target.focus({preventScroll:true}); if(selection) try {target.setSelectionRange(...selection);} catch(_){} }
    }
  }
  return {render,money,percent,date,pill,icon,esc,option,accountCard,transactionTable};
})();
