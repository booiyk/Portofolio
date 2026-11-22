/* IndexedDB persistence: atomic writes with optimistic revision checks. */
window.JournalStore = (() => {
  'use strict';
  let database;
  async function open() {
    if (database) return database;
    database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('propfolio-local-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      request.onerror = () => reject(new Error('Penyimpanan browser tidak tersedia. Gunakan browser biasa, bukan mode privat, lalu coba lagi.'));
      request.onblocked = () => reject(new Error('Tutup tab journal lain agar penyimpanan bisa dibuka.'));
    });
    return database;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('journal');
      request.onsuccess = () => {
        try {
          const value = request.result;
          resolve(value ? { ...value, data: Ledger.validateData(value.data) } : { data: Ledger.emptyData(), revision: 0, savedAt: null });
        } catch (err) { reject(err); }
      };
      request.onerror = () => reject(request.error);
    });
  }
  async function save(data, expectedRevision) {
    const safe = Ledger.validateData(data);
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('journal');
      let result, conflict = false;
      request.onsuccess = () => {
        const revision = request.result?.revision || 0;
        if (revision !== expectedRevision) { conflict = true; transaction.abort(); return; }
        result = { data: safe, revision: revision + 1, savedAt: new Date().toISOString() };
        store.put(result, 'journal');
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(new Error(conflict ? 'Data berubah di tab lain. Tutup formulir lalu muat ulang sebelum mengedit.' : 'Data belum tersimpan. Ruang penyimpanan mungkin penuh; hapus lampiran besar atau buat backup.'));
      transaction.onerror = () => { /* onabort reports the final result */ };
    });
  }
  async function backupTime(value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', value ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('workspace');
      const request = value ? store.put(value, 'lastBackup') : store.get('lastBackup');
      let result;
      request.onsuccess = () => { result = value || request.result || null; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  }
  return { read, save, backupTime };
})();
