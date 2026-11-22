/* Fictional preview data, loaded into memory only. Never inserted into IndexedDB. */
window.createDemo = function () {
  const now = new Date();
  const date = (offset, day) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, Math.min(day, offset === 0 ? now.getDate() : day), 12);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  return {
    version: 1,
    accounts: [
      {id:'demo-a',firm:'Northstar Capital',name:'Two-step · Alpha',sizeCents:10000000,priceCents:49900,status:'funded',date:date(-4,8),note:'Akun fiktif untuk melihat contoh tampilan.',order:'DEMO-001'},
      {id:'demo-b',firm:'Summit Funding',name:'Evaluation · Beta',sizeCents:5000000,priceCents:24900,status:'funded',date:date(-3,12),note:'Data ilustrasi.',order:'DEMO-002'},
      {id:'demo-c',firm:'Northstar Capital',name:'Two-step · Gamma',sizeCents:2500000,priceCents:15900,status:'failed',date:date(-2,15),note:'Akun gagal tetap masuk total biaya.',order:'DEMO-003'},
      {id:'demo-d',firm:'Oakline Traders',name:'Challenge · Delta',sizeCents:10000000,priceCents:39900,status:'challenge',date:date(0,4),note:'Data ilustrasi.',order:'DEMO-004'}
    ],
    costs: [
      {id:'demo-c1',accountId:'demo-a',date:date(-3,2),label:'Aktivasi',amountCents:9900,note:''},
      {id:'demo-c2',accountId:'demo-c',date:date(-1,6),label:'Reset challenge',amountCents:7900,note:''}
    ],
    payouts: [
      {id:'demo-p1',accountId:'demo-a',date:date(-2,22),amountCents:125000,status:'received',note:''},
      {id:'demo-p2',accountId:'demo-a',date:date(-1,20),amountCents:180000,status:'received',note:''},
      {id:'demo-p3',accountId:'demo-b',date:date(0,2),amountCents:84500,status:'received',note:''},
      {id:'demo-p4',accountId:'demo-b',date:date(0,6),amountCents:65000,status:'pending',note:'Belum masuk ROI.'}
    ]
  };
};
