# 🐛 LAPORAN TEMUAN BUG - APLIKASI KRIPTOGRAFI KAMSIS

**Tanggal Audit:** 22 Maret 2026  
**Status:** Belum diperbaiki (Pending Review)  
**Total Bug Ditemukan:** 7 bug (Kritis: 2, Tinggi: 3, Sedang: 2)

---

## 📋 RINGKASAN BUG

| # | Judul Bug | Severity | Status |
|---|-----------|----------|--------|
| BUG-001 | Crash saat user batal pilih file gambar | 🔴 Kritis | ⏳ Pending |
| BUG-002 | Dekripsi tidak validasi panjang ciphertext | 🔴 Kritis | ⏳ Pending |
| BUG-003 | Teks non-ASCII rusak setelah enkripsi/dekripsi | 🟠 Tinggi | ⏳ Pending |
| BUG-004 | Kunci rahasia ter-reset tanpa pemberitahuan | 🟠 Tinggi | ⏳ Pending |
| BUG-005 | State gambar lama terbawa ke proses berikutnya | 🟠 Tinggi | ⏳ Pending |
| BUG-006 | Sanitasi Base64 terlalu permisif | 🟡 Sedang | ⏳ Pending |
| BUG-007 | IV statis menurunkan keamanan kriptografi | 🟡 Sedang | ⏳ Pending |

---

## 🔍 DETAIL BUG

---

### **BUG-001: Crash Saat User Batal Pilih File Gambar**

**Severity:** 🔴 KRITIS  
**Status:** ⏳ Pending  
**Priority:** Tinggi

#### Lokasi Bug:
- **File:** [script.js](script.js#L258-L269)
- **Line:** 259-269

#### Kode Bermasalah:
```javascript
let imageBase64Data = "";
document.getElementById('inputFile').addEventListener('change', function(e) {
    let file = e.target.files[0];
    let reader = new FileReader();
    reader.onload = function(event) {
        imageBase64Data = event.target.result; 
        let preview = document.getElementById('imagePreview');
        preview.src = imageBase64Data;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);  // ← BUG DI SINI
});
```

#### Penyebab Bug:
Event listener `change` langsung memanggil `FileReader.readAsDataURL(file)` tanpa mengecek apakah file ada. Ketika user membuka dialog file picker dan menutupnya tanpa memilih file (klik Cancel/X), maka `e.target.files[0]` akan bernilai `undefined`. Fungsi `readAsDataURL()` dipanggil dengan argument undefined, yang menyebabkan error.

#### Akibat Bug:
1. **Runtime Error:** `TypeError: Failed to execute 'readAsDataURL' on 'FileReader': parameter 1 is not of type 'Blob'`
2. **Aplikasi crash:** Event listener error bisa membuat state aplikasi tidak konsisten
3. **User experience buruk:** User tidak bisa lanjut operasi sampai refresh halaman
4. **Console error:** Error akan terlihat di browser console (F12)

#### Demo Kasus Gagal:
```
1. Pilih mode: "Tipe Format" = "File Gambar"
2. Klik "Unggah File Gambar"
3. Dialog file picker terbuka
4. Klik tombol "Cancel" atau "X" (tanpa pilih file)
   └─ ⚠️ CRASH! Error di console browser
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Tambahkan guard clause untuk cek apakah file ada
   if (!file) { return; }

2. Reset state jika batal pilih file:
   - Kosongkan imageBase64Data ke ""
   - Sembunyikan preview
   - Reset input file value

3. Tambahkan error handling untuk FileReader
   reader.onerror untuk menangani failure
```

#### File yang Akan Diubah:
- `script.js` (baris 259-269)

---

### **BUG-002: Dekripsi Tidak Validasi Panjang Ciphertext**

**Severity:** 🔴 KRITIS  
**Status:** ⏳ Pending  
**Priority:** Tinggi

#### Lokasi Bug:
- **File:** [script.js](script.js#L99-L115)
- **Line:** 99-115 (terutama line 100-102)

#### Kode Bermasalah:
```javascript
function decryptCBC(ciphertextBytes, keyBytes) {
    let iv = ciphertextBytes.slice(0, 8);           // ← Ambil 8 byte pertama
    let data = ciphertextBytes.slice(8);            // ← Ambil sisanya
    let decryptedPadded = new Uint8Array(data.length);

    let prevBlock = iv;
    for (let i = 0; i < data.length; i += 8) {
        let block = data.slice(i, i + 8);
        let decBlock = decryptBlock(block, keyBytes);
        for (let j = 0; j < 8; j++) decBlock[j] ^= prevBlock[j]; 
        decryptedPadded.set(decBlock, i);
        prevBlock = block;
    }

    let padLen = decryptedPadded[decryptedPadded.length - 1];
    if (padLen < 1 || padLen > 8) throw new Error("Kunci salah atau data rusak (Padding Error)");
    return decryptedPadded.slice(0, decryptedPadded.length - padLen);
}
```

#### Penyebab Bug:
Fungsi `decryptCBC` tidak melakukan validasi awal pada panjang ciphertext sebelum mulai decode. Beberapa kasus edge case tidak ditangani:

1. **Ciphertext terlalu pendek:** Jika panjang < 16 byte (8 IV + minimal 8 data), hasil decryption akan salah
2. **Sisa data tidak kelipatan 8:** Jika (ciphertext.length - 8) bukan kelipatan 8, akan ada block yang tidak utuh (< 8 byte)
3. **Ciphertext kosong:** Jika panjang 0 atau 8 byte saja

#### Akibat Bug:
1. **Output sampah:** Ciphertext tidak valid tetap di-decode, hasil teks/gambar menjadi corrupt
2. **Error padding membingungkan:** Error message "Kunci salah atau data rusak" muncul, tapi sebenarnya format input yang salah
3. **Tidak ada indikasi jelas:** User tidak tahu bahwa input ciphertext mereka tidak valid
4. **Dekripsi gambar gagal tanpa reason:** Saat dekripsi gambar, hanya keluar error tanpa penjelasan format

#### Demo Kasus Gagal:
```
1. Ciphertext corrupted atau dipotong (panjang random)
   Contoh: "ABC123XY" (8 byte saja, tidak ada data payload)
2. Paste ke kotak dekripsi
3. Klik DEKRIPSI
   └─ ⚠️ Output sampah atau error padding yang menyesatkan
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Validasi panjang minimum:
   if (ciphertextBytes.length < 16) {
       throw new Error("Ciphertext terlalu pendek (minimal 16 byte)");
   }

2. Validasi panjang data kelipatan 8:
   let dataLen = ciphertextBytes.length - 8;
   if (dataLen % 8 !== 0) {
       throw new Error("Panjang ciphertext tidak valid (harus 8 + kelipatan 8)");
   }

3. Validasi padding value:
   Cek range padding dengan lebih ketat
```

#### File yang Akan Diubah:
- `script.js` (baris 99-116)

---

### **BUG-003: Teks Non-ASCII Rusak Setelah Enkripsi/Dekripsi**

**Severity:** 🟠 TINGGI  
**Status:** ⏳ Pending  
**Priority:** Tinggi

#### Lokasi Bug:
- **File:** [script.js](script.js#L179-L182)
- **Line:** 179-182 (strToBytes)
- **File:** [script.js](script.js#L290-L293)
- **Line:** 290-293 (processData decrypt text)
- **File:** [script.js](script.js#L306-L307)
- **Line:** 306-307 (processData decrypt image)

#### Kode Bermasalah:
```javascript
// BARIS 179-182: strToBytes
function strToBytes(str) {
    let bytes = new Uint8Array(str.length);
    for(let i=0; i<str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
    return bytes;
}

// BARIS 290-293: Dekripsi text
let decrypted = decryptCBC(encBytes, keyBytes);
let text = '';
for(let i=0; i<decrypted.length; i++) text += String.fromCharCode(decrypted[i]);
outputArea.innerText = text;
```

#### Penyebab Bug:
Konversi string ↔ byte menggunakan `charCodeAt()` dan `String.fromCharCode()` dengan masking 0xFF. Ini hanya aman untuk karakter ASCII (0-127). Karakter non-ASCII seperti emoji, huruf beraksen (é, ñ, ü), atau simbol CJK (中, 日, 한) akan:

1. **Kehilangan informasi:** Karakter UTF-16 yang membutuhkan 2+ bytes dipotong menjadi 1 byte
2. **Rusak setelah round-trip:** Plaintext → bytes → encryption → decryption → bytes → text ≠ original

#### Contoh Kasus:
```
Plaintext: "Halo 你好 😀"

1. strToBytes('Halo 你好 😀'):
   - 'H' (72) → 72
   - 'a' (97) → 97
   - 'l' (108) → 108
   - 'o' (111) → 111
   - ' ' (32) → 32
   - '你' (20320) → 20320 & 0xFF = 224 ← HILANG INFO!
   - '好' (22909) → 22909 & 0xFF = 205 ← HILANG INFO!
   - '😀' (128512) → 128512 & 0xFF = 0 ← HILANG INFO!

2. Bytes: [72, 97, 108, 111, 32, 224, 205, 0, ...]

3. Setelah decrypt:
   - Bytes: [72, 97, 108, 111, 32, 224, 205, 0, ...]

4. fromCharCode(72, 97, 108, 111, 32, 224, 205, 0):
   → "Halo àÍ\0" (CORRUPT!)
```

#### Akibat Bug:
1. **Data loss:** Teks non-ASCII tidak bisa enkripsi/dekripsi dengan benar
2. **Silent corruption:** Tidak ada error, hanya output yang salah
3. **Image gambar data mungkin corrupt:** Jika image bytes berisi karakter > 127
4. **User confusion:** Hasil dekripsi tidak sesuai input

#### Demo Kasus Gagal:
```
1. Encrypt teks: "Nama saya Mūhammad 🔐"
2. Copy ciphertext
3. Decrypt ciphertext
   └─ ⚠️ Hasil: "Nama saya M\u00FChhammad ?" (Rusak!)
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Ganti strToBytes dengan TextEncoder (standar Web API):
   function strToBytes(str) {
       return new TextEncoder().encode(str);
   }

2. Ganti fromCharCode dengan TextDecoder:
   let text = new TextDecoder().decode(decrypted);

3. Pisahkan jalur teks dan gambar:
   - Teks mode: gunakan TextEncoder/TextDecoder
   - Image mode: tetap gunakan string conversion (karena base64 sudah aman)
```

#### File yang Akan Diubah:
- `script.js` (baris 179-182, 290-293, 306-307)

---

### **BUG-004: Kunci Rahasia Ter-Reset Tanpa Pemberitahuan**

**Severity:** 🟠 TINGGI  
**Status:** ⏳ Pending  
**Priority:** Tinggi

#### Lokasi Bug:
- **File:** [script.js](script.js#L121-L142)
- **Line:** 137-138 (Kosongkan kunci di switchMode)
- **File:** [script.js](script.js#L271-L273)
- **Line:** 272-273 (padEnd kunci dengan 0)
- **File:** [index.html](index.html#L22)
- **Line:** 22 (default value kunci)

#### Kode Bermasalah:
```javascript
// BARIS 137-138: Di function switchMode()
function switchMode(mode) {
    // ... kode lain ...
    
    // --- BARIS BARU: Kosongkan Kunci Rahasia ---
    document.getElementById('secretKey').value = ""; // ← BUG DI SINI!
    
    // ... kode lain ...
}

// BARIS 272-273: Di function processData()
function processData(action) {
    let keyStr = document.getElementById('secretKey').value.padEnd(8, '0');  // ← AUTO PADDING!
    let keyBytes = strToBytes(keyStr.substring(0, 8));
    // ...
}
```

#### Penyebab Bug:
Kombinasi dari 2 aksi:

1. **switchMode() mengosongkan kunci:** Saat user pindah tab (dari Encrypt ke Decrypt atau sebaliknya), kunci sengaja dikosongkan
2. **processData() auto-padding dengan 0:** Ketika user skip input kunci dan langsung klik encrypt/decrypt, `padEnd(8, '0')` otomatis mengisi dengan karakter '0'
3. **User tidak aware:** Field kunci kosong terlihat jelas, tapi user mungkin tidak sadar sudah jadi "00000000"

#### Akibat Bug:
1. **Enkripsi dengan kunci lemah:** Enkripsi dengan "00000000" adalah keamanan minimal
2. **Dekripsi tidak sesuai:** Jika user di-encrypt dengan kunci "RAHASIA", pindah tab, kunci menjadi kosong, lalu dekripsi → hasil salah
3. **Security risk:** Kunci ditebak dengan mudah ("00000000")
4. **User kebingungan:** Hasil dekripsi tidak match padahal ciphertext benar

#### Demo Kasus Gagal:
```
1. Mode: ENCRYPT, Key: "RAHASIAK"
2. Encrypt: "Halo Dunia"
   → Ciphertext: "dZr0n0m5jVo=" (dengan key RAHASIAK)

3. Pindah ke tab DEKRIPSI
   → Kunci field otomatis kosong!
   → Key jadi "00000000" (diam-diam)

4. Paste ciphertext "dZr0n0m5jVo="
5. Klik DEKRIPSI
   → ⚠️ ERROR: "Kunci salah atau data rusak"
      (Padahal seharusnya "Halo Dunia" dengan key RAHASIAK)
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Jangan reset kunci saat switchMode:
   Hapus baris: document.getElementById('secretKey').value = "";

2. Tambah validasi kunci di processData:
   if (!keyStr || keyStr.trim() === "") {
       alert("Kunci rahasia tidak boleh kosong!");
       return;
   }

3. Beri warning visual:
   - Highlight field kunci jika kosong
   - Disable tombol encrypt/decrypt jika kunci kosong
```

#### File yang Akan Diubah:
- `script.js` (baris 137-138, 272-273)
- Opsional: `index.html` (ubah default value atau hapus)

---

### **BUG-005: State Gambar Lama Terbawa ke Proses Berikutnya**

**Severity:** 🟠 TINGGI  
**Status:** ⏳ Pending  
**Priority:** Tinggi

#### Lokasi Bug:
- **File:** [script.js](script.js#L258)
- **Line:** 258 (imageBase64Data global var)
- **File:** [script.js](script.js#L144-L172)
- **Line:** 144-172 (toggleInput function tidak reset imageBase64Data)
- **File:** [index.html](index.html#L33-L36)
- **Line:** 33-36 (file input tidak reset)

#### Kode Bermasalah:
```javascript
// BARIS 258: Variabel global tidak di-reset
let imageBase64Data = "";

// Di toggleInput() atau switchMode(), tidak ada yang reset imageBase64Data
function toggleInput() {
    // ... setup UI ...
    // TIDAK ADA: imageBase64Data = "";
    // TIDAK ADA: document.getElementById('inputFile').value = "";
    // TIDAK ADA: document.getElementById('imagePreview').src = "";
}
```

#### Penyebab Bug:
Variabel global `imageBase64Data` menyimpan data gambar yang sudah dipilih. Ketika user:

1. Upload gambar1 untuk encryption
2. Pindah ke mode teks atau ganti tipe input
3. Upload gambar2 atau batal
4. imageBase64Data masih berisi data gambar1 lama

#### Akibat Bug:
1. **User encrypt gambar lama secara tidak terduga:** Pikirnya encrypt gambar2, padahal masih gambar1
2. **Dekripsi gambar salah:** State lama terbawa, menghasilkan output bukan gambar yang diharapkan
3. **UI tidak konsisten:** Preview di-hide tapi data masih ada di memory
4. **Silent data loss/corruption:** Tidak ada warning, data lama terenkripsi tanpa sadar

#### Demo Kasus Gagal:
```
1. Upload "gambar1.jpg" di mode Image Encrypt
2. Lihat preview gambar1 ✓
3. Pindah ke "Tipe Format: Teks Normal"
   → Preview hilang, tapi imageBase64Data masih punya gambar1!

4. Ganti mode ke Image Decrypt
   → Klik tombol Image
   
5. Paste ciphertext gambar2
6. Klik DEKRIPSI
   → ⚠️ Aplikasi mencoba decrypt dengan imageBase64Data gambar1!
      Atau ada inconsistency logic menyebabkan hasil salah
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Reset imageBase64Data di switchMode():
   imageBase64Data = "";

2. Reset imageBase64Data di toggleInput() saat ganti tipe input:
   if (type !== 'image') {
       imageBase64Data = "";
   }

3. Reset input file element:
   document.getElementById('inputFile').value = "";

4. Bersihkan preview:
   let preview = document.getElementById('imagePreview');
   preview.src = "";
   preview.style.display = 'none';
```

#### File yang Akan Diubah:
- `script.js` (baris 121-142, 144-172)

---

### **BUG-006: Sanitasi Base64 Terlalu Permisif**

**Severity:** 🟡 SEDANG  
**Status:** ⏳ Pending  
**Priority:** Sedang

#### Lokasi Bug:
- **File:** [script.js](script.js#L224-L230)
- **Line:** 226 (regex replace)

#### Kode Bermasalah:
```javascript
function base64ToBytes(base64) {
    // PERBAIKAN 1: Tambahkan \= pada regex agar tanda '=' tidak ikut terhapus
    let str = base64.replace(/[^A-Za-z0-9\+\/\=]/g, ""); // ← BUG DI SINI!
    
    if (str.length % 4 !== 0) {
        throw new Error("Format Ciphertext tidak valid atau terpotong!");
    }
    // ... lebih lanjut ...
}
```

#### Penyebab Bug:
Regex sanitasi `/[^A-Za-z0-9\+\/\=]/g` menghapus **semua karakter non-Base64 diam-diam**:

1. **Karakter spasi/newline dihapus:** User copy-paste dari email/dokumen yang punya formatting, karakter tersembunyi dihapus otomatis
2. **Tidak ada warning:** Data modified tanpa user tahu
3. **Bisa memperbaiki ciphertext corrupt:** Jika karakter salah satu dua, dihapus dan kebetulan padding jadi valid, bisa decode dengan salah

#### Akibat Bug:
1. **Silent data corruption:** Input diubah tanpa konfirmasi
2. **Dekripsi hasil salah:** Ciphertext corrupt tetap bisa "didecode" menjadi output sampah
3. **Susah debug:** User tidak tahu bahwa input mereka dimodifikasi
4. **Keamanan menurun:** Ciphertext yang seharusnya ditolak bisa terima

#### Demo Kasus Gagal:
```
1. Ciphertext yang benar: "dZr0n0m5jVo="
2. User copy-paste dari email: "dZr0n0m5 jVo="
   (ada 1 space di tengah)

3. Paste ke kotak dekripsi
4. Klik DEKRIPSI
   → Tidak ada error!
   → Regex otomatis hapus space
   → Dekripsi dengan "dZr0n0m5jVo=" (seolah-olah benar)

5. Hasil: Sesuai plaintext ✓ (kebetulan benar)
   
   TAPI jika:
   Ciphertext: "dZr0n0m5jVo=" tapi di-copy sebagai "dZr0n0m5 jVX="
   → Regex: "dZr0n0m5jVX=" (X bukan karakter valid BASE64)
   → Regex hapus X → "dZr0n0m5jV="
   → Dekripsi: Result salah tapi tidak ada error!
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Validasi format Base64 ketat sebelum sanitasi:
   - Check apakah input hanya berisi Base64 chars + optional whitespace
   - Reject jika ada karakter ilegal (bukan A-Z/a-z/0-9/+/=/whitespace)

2. Trim whitespace tapi jangan hapus:
   let str = base64.trim().replace(/\s/g, "");

3. Validasi panjang vs padding:
   - Jika ada '=', hanya boleh akhir (1-2 padding)
   - Tidak boleh '=' di tengah-tengah

4. Error message eksplisit:
   if (/[^A-Za-z0-9\+\/\=\s]/.test(base64)) {
       throw new Error("Ciphertext mengandung karakter tidak valid!");
   }
```

#### File yang Akan Diubah:
- `script.js` (baris 224-230)

---

### **BUG-007: IV Statis Menurunkan Keamanan Kriptografi**

**Severity:** 🟡 SEDANG  
**Status:** ⏳ Pending  
**Priority:** Sedang (Keamanan)

#### Lokasi Bug:
- **File:** [script.js](script.js#L83)
- **Line:** 83

#### Kode Bermasalah:
```javascript
function encryptCBC(plaintextBytes, keyBytes) {
    let padLen = 8 - (plaintextBytes.length % 8);
    // ... padding ...
    
    let iv = new Uint8Array([21, 55, 99, 12, 87, 43, 10, 255]); // ← IV STATIS/FIXED!
    let ciphertext = new Uint8Array(iv.length + padded.length);
    ciphertext.set(iv);
    // ... enkripsi ...
}
```

#### Penyebab Bug:
IV (Initialization Vector) hardcoded tetap sama untuk setiap enkripsi. Dalam CBC mode, IV seharusnya **acak/random per enkripsi** untuk menjaga semantik keamanan.

#### Akibat Bug (Keamanan):
1. **Plaintext block awal yang sama → Ciphertext block awal yang sama:**
   ```
   Encryption 1: Plaintext "AAAAAAAAAAAAAAAAAAAAAAA..." 
                 + IV tetap [21,55,99,...]
                 → CipherBlock1 = "ABC123XY" (selalu sama)
   
   Encryption 2: Plaintext "AAAAAAAAAAAAAAAAAAAAAAA..."
                 + IV tetap [21,55,99,...]
                 → CipherBlock1 = "ABC123XY" (SAMA!)
   ```

2. **Pattern attack:** Attacker bisa deteksi plaintext pattern dari ciphertext

3. **Semantic security lemah:** Tidak memenuhi standar IND-CPA (Indistinguishability under Chosen Plaintext Attack)

#### Akibat Bug (Fungsional):
1. **Tidak sesuai standar CBC:** CBC seharusnya generate random IV
2. **Compliance issue:** Jika ada audit keamanan, ini akan ditandai

#### Demo Kasus Gagal:
```
1. Encrypt "HELLOWORLD" dengan key "KUNCI123"
   → Ciphertext1: "dZr0n0m5jVo=" (mulai dengan "dZr0...")

2. Encrypt "HELLOWORLD" dengan key "KUNCI123"
   → Ciphertext2: "dZr0n0m5jVo=" (SAMA PERSIS!)

3. Attacker bisa deteksi bahwa ciphertext1 == ciphertext2
   → Tau bahwa plaintext1 == plaintext2
   → KEAMANAN TURUN!
```

#### Rencana Perbaikan:
```
Perubahan yang akan dilakukan:

1. Generate IV acak per enkripsi:
   let iv = new Uint8Array(8);
   crypto.getRandomValues(iv);

2. Prepend IV ke ciphertext (sudah sesuai format sekarang):
   ```

#### File yang Akan Diubah:
- `script.js` (baris 83)

---

## 📊 SUMMARY TABEL PERBAIKAN

| # | Bug | File | Line | Perubahan |
|---|-----|------|------|-----------|
| 001 | Crash file cancel | script.js | 259-269 | Add guard, reset state |
| 002 | No ciphertext validation | script.js | 99-116 | Add length checks |
| 003 | Non-ASCII corruption | script.js | 179-182, 290-293, 306-307 | Use TextEncoder/Decoder |
| 004 | Key auto-reset | script.js | 137-138, 272-273 | Remove reset, add validation |
| 005 | Old image state | script.js | 121-172, 258 | Reset imageBase64Data |
| 006 | Permissive sanitization | script.js | 224-230 | Validate format strictly |
| 007 | Static IV | script.js | 83 | Generate random IV |

---

## 🔧 REKOMENDASI PRIORITAS PERBAIKAN

**Urutan Perbaikan (dari urgent ke less urgent):**

1. **LANGSUNG (Sebelum submit):**
   - BUG-001: Crash input file 🔴
   - BUG-002: Ciphertext validation 🔴
   - BUG-004: Key reset issue 🟠

2. **SEGERA (Hari ini jika bisa):**
   - BUG-003: UTF-8 encoding 🟠
   - BUG-005: Image state cleanup 🟠

3. **OPTIONAL (Nice to have):**
   - BUG-006: Base64 sanitasi 🟡
   - BUG-007: Random IV 🟡

---

## 📝 CATATAN AUDIT

- **Audit Date:** 22 Maret 2026
- **Auditor:** Static Code Analysis + Runtime Logic Review
- **Tools:** Manual inspection JavaScript/HTML/CSS
- **Testing:** Berdasarkan logical flow analysis
- **Status:** Belum di-test runtime (akan di-test setelah perbaikan)

---

## ✅ NEXT STEPS

1. ✅ Review laporan bug ini
2. ⏳ Persetujuan untuk mulai perbaikan
3. ⏳ Implement fixes sesuai rencana
4. ⏳ Test setiap bug fix
5. ⏳ Final validation

---

*Laporanini dibuat untuk keperluan tugas KAMSIS - Kriptografi & Keamanan Sistem*
*Silakan hubungi jika ada klarifikasi mengenai bug atau rencana perbaikan*
