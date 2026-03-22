
// Membuat S-Box sederhana (Tabel Substitusi)
const S_BOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    S_BOX[i] = (i * 31 + 17) % 256; 
}

// Fungsi Rotasi Bit ke Kiri (Transposisi)
function rotl8(val, shift) {
    return ((val << shift) | (val >>> (8 - shift))) & 0xFF;
}

// Fungsi Inti Feistel
function feistelFunction(rightHalf, subKey) {
    let out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        let xored = rightHalf[i] ^ subKey[i]; 
        let substituted = S_BOX[xored];       
        out[i] = rotl8(substituted, 2);       
    }
    return out;
}

// --- PERBAIKAN: Fungsi Pengambil Sub-Kunci (Key Processor) ---
function getSubKey(key, round) {
    let subKey = new Uint8Array(4);
    for(let i = 0; i < 4; i++) {
        // Melakukan pergeseran melingkar agar ke-8 karakter selalu terpakai merata
        // Ronde 0: indeks 0,1,2,3 | Ronde 1: 2,3,4,5 | Ronde 2: 4,5,6,7 | Ronde 3: 6,7,0,1
        subKey[i] = key[(round * 2 + i) % 8]; 
    }
    return subKey;
}

// FUNGSI ENKRIPSI 1 BLOK
function encryptBlock(block, key) {
    let L = block.slice(0, 4);
    let R = block.slice(4, 8);
    
    for (let round = 0; round < 4; round++) {
        let subKey = getSubKey(key, round); // Memanggil Key Processor yang baru
        let fResult = feistelFunction(R, subKey);
        let newR = new Uint8Array(4);
        for(let i=0; i<4; i++) newR[i] = L[i] ^ fResult[i];
        L = R;
        R = newR;
    }
    let out = new Uint8Array(8);
    out.set(R, 0); 
    out.set(L, 4);
    return out;
}

// FUNGSI DEKRIPSI 1 BLOK
function decryptBlock(block, key) {
    let currR = block.slice(0, 4); 
    let currL = block.slice(4, 8); 

    // Feistel berjalan mundur
    for (let round = 3; round >= 0; round--) {
        let subKey = getSubKey(key, round); // Memanggil Key Processor yang baru
        
        let fResult = feistelFunction(currL, subKey);
        let nextL = new Uint8Array(4);
        for(let i=0; i<4; i++) nextL[i] = currR[i] ^ fResult[i];
        
        currR = currL;
        currL = nextL;
    }
    let out = new Uint8Array(8);
    out.set(currL, 0);
    out.set(currR, 4);
    return out;
}

// MODE CBC ENKRIPSI
function encryptCBC(plaintextBytes, keyBytes) {
    let padLen = 8 - (plaintextBytes.length % 8);
    let padded = new Uint8Array(plaintextBytes.length + padLen);
    padded.set(plaintextBytes);
    for (let i = plaintextBytes.length; i < padded.length; i++) padded[i] = padLen;

    if (!window.crypto || !window.crypto.getRandomValues) {
        throw new Error("Browser tidak mendukung generator IV acak.");
    }
    let iv = new Uint8Array(8);
    window.crypto.getRandomValues(iv);
    let ciphertext = new Uint8Array(iv.length + padded.length);
    ciphertext.set(iv);

    let prevBlock = iv;
    for (let i = 0; i < padded.length; i += 8) {
        let block = padded.slice(i, i + 8);
        for (let j = 0; j < 8; j++) block[j] ^= prevBlock[j]; 
        let encBlock = encryptBlock(block, keyBytes);
        ciphertext.set(encBlock, iv.length + i);
        prevBlock = encBlock;
    }
    return ciphertext;
}

// MODE CBC DEKRIPSI
function decryptCBC(ciphertextBytes, keyBytes) {
    if (ciphertextBytes.length < 16) {
        throw new Error("Ciphertext terlalu pendek. Minimal harus berisi IV + 1 blok data.");
    }
    if ((ciphertextBytes.length - 8) % 8 !== 0) {
        throw new Error("Format ciphertext tidak valid. Panjang data harus kelipatan 8 byte.");
    }

    let iv = ciphertextBytes.slice(0, 8);
    let data = ciphertextBytes.slice(8);
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
    for (let i = decryptedPadded.length - padLen; i < decryptedPadded.length; i++) {
        if (decryptedPadded[i] !== padLen) {
            throw new Error("Kunci salah atau data rusak (Padding Error)");
        }
    }
    return decryptedPadded.slice(0, decryptedPadded.length - padLen);
}

// --- FUNGSI BANTUAN UI MENU TAB (BARU) ---
let currentMode = 'encrypt'; // Default saat web dibuka

function resetImageState() {
    imageBase64Data = "";
    let fileInput = document.getElementById('inputFile');
    let preview = document.getElementById('imagePreview');
    fileInput.value = "";
    preview.removeAttribute('src');
    preview.style.display = 'none';
}

function switchMode(mode) {
    currentMode = mode;
    
    // Ganti warna tombol tab yang aktif
    document.getElementById('tabEncrypt').classList.toggle('active', mode === 'encrypt');
    document.getElementById('tabDecrypt').classList.toggle('active', mode === 'decrypt');

    // Sembunyikan/Tampilkan tombol eksekusi utama
    document.getElementById('btnEncrypt').style.display = mode === 'encrypt' ? 'block' : 'none';
    document.getElementById('btnDecrypt').style.display = mode === 'decrypt' ? 'block' : 'none';

    // Bersihkan layar output dan input setiap pindah tab
    document.getElementById('outputArea').innerText = "Hasil akan muncul di sini...";
    document.getElementById('outputImage').style.display = 'none';
    document.getElementById('inputText').value = ""; 
    document.getElementById('btnDownload').style.display = 'none'; // Reset tombol download
    lastOutputType = null; // Reset tracking output
    resetImageState();

    document.getElementById('secretKey').value = "";
    
    // Panggil toggleInput untuk mengatur ulang label dan kotak yang muncul
    toggleInput();
}

function toggleInput() {
    let type = document.getElementById('inputType').value;
    let textGroup = document.getElementById('textInputGroup');
    let fileGroup = document.getElementById('fileInputGroup');
    let txtFileGroup = document.getElementById('txtFileInputGroup');
    let textLabel = document.getElementById('textInputLabel');
    let fileLabel = document.getElementById('fileInputLabel');
    let txtFileLabel = document.getElementById('txtFileInputLabel');

    if (currentMode === 'encrypt') {
        if (type === 'text') {
            textGroup.style.display = 'block';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Masukkan Pesan Asli (Plaintext):";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'image') {
            textGroup.style.display = 'none'; // Sembunyikan teks, hanya butuh upload gambar
            fileGroup.style.display = 'block';
            txtFileGroup.style.display = 'none';
            fileLabel.innerText = "3. Unggah File Gambar yang akan disandikan:";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'txt') {
            textGroup.style.display = 'none';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'block';
            txtFileLabel.innerText = "3. Unggah File Teks yang akan disandikan:";
            resetImageState();
        }
    } else { // MODE DECRYPT
        if (type === 'text') {
            textGroup.style.display = 'block';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Paste Ciphertext (Teks Sandi) di sini:";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'image') {
            textGroup.style.display = 'block'; // Tampilkan teks untuk paste sandi
            fileGroup.style.display = 'none';  // Sembunyikan upload, karena kita mendekripsi dari teks
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Paste Ciphertext Gambar (Teks Super Panjang) di sini:";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'txt') {
            textGroup.style.display = 'block';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Paste Ciphertext Teks (Teks Sandi) di sini:";
            resetImageState();
            resetTxtFileState();
        }
    }
}

// Validasi ukuran text input (warn jika terlalu besar)
document.getElementById('inputText').addEventListener('input', function(e) {
    const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5MB limit untuk teks
    const WARN_TEXT_SIZE = 1 * 1024 * 1024; // Warn di 1MB
    
    let textBytes = new TextEncoder().encode(this.value).length;
    
    if (textBytes > MAX_TEXT_SIZE) {
        // Potong teks agar tidak melebihi batas
        let encoded = new TextEncoder().encode(this.value);
        let trimmed = new TextDecoder().decode(encoded.slice(0, MAX_TEXT_SIZE));
        this.value = trimmed;
        alert("❌ Teks terlalu besar! Maksimal 5MB. Teks telah dipotong otomatis.");
        return;
    }
    
    if (textBytes > WARN_TEXT_SIZE) {
        console.warn("⚠️ Peringatan: Teks cukup besar (" + (textBytes / (1024*1024)).toFixed(2) + "MB). Proses enkripsi mungkin memakan waktu lebih lama.");
    }
});

// Jalankan pengaturan UI pertama kali saat web dimuat
window.onload = function() {
    // Jalankan switchMode untuk mengatur tampilan awal
    switchMode('encrypt');

    // MENGHANCURKAN CACHE BROWSER SECARA PAKSA
    // Kita gunakan setTimeout (jeda 10 milidetik) agar kode ini dieksekusi 
    // TEPAT SETELAH browser selesai mencoba memasukkan data autofill-nya.
    setTimeout(() => {
        document.getElementById('secretKey').value = "";
        document.getElementById('inputText').value = "";
        document.getElementById('inputFile').value = ""; // Reset file gambar juga
    }, 10);
    
    // FITUR BARU: Ctrl+A pada output area hanya select bagian output saja
    // Tambahkan tabindex agar output area bisa menerima focus
    document.getElementById('outputArea').setAttribute('tabindex', '0');
    document.getElementById('outputImage').setAttribute('tabindex', '0');
    
    // Deteksi Ctrl+A pada document level
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            let outputArea = document.getElementById('outputArea');
            let outputImage = document.getElementById('outputImage');
            
            // Check apakah fokus ada di output area atau gambar output
            if (document.activeElement === outputArea || document.activeElement === outputImage) {
                e.preventDefault();
                
                // Select semua text di output area menggunakan Selection API
                let range = document.createRange();
                range.selectNodeContents(outputArea);
                let sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    });
};

function strToBytes(str) {
    return new TextEncoder().encode(str);
}

function bytesToStr(bytes) {
    return new TextDecoder().decode(bytes);
}

// ====================================================================
// FUNGSI BASE64 KUSTOM (TANPA MENGGUNAKAN WINDOW.BTOA / WINDOW.ATOB)
// Memenuhi syarat mutlak "Dilarang menggunakan library / fungsi bawaan"
// ====================================================================

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";


// Konversi Bytes (Uint8Array) ke Teks Base64 (Pengganti btoa)
function bytesToBase64(bytes) {
    let result = '';
    let i = 0;
    let length = bytes.length;

    while (i < length) {
        // Hitung sisa byte yang belum diproses di putaran ini
        let left = length - i; 
        
        let b1 = bytes[i++];
        let b2 = i < length ? bytes[i++] : 0;
        let b3 = i < length ? bytes[i++] : 0;

        // Pecah 24 bit menjadi 4 potongan (masing-masing 6 bit)
        let enc1 = b1 >> 2;
        let enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
        let enc4 = b3 & 63;

        result += BASE64_CHARS.charAt(enc1);
        result += BASE64_CHARS.charAt(enc2);
        
        // PERBAIKAN: Logika penambahan '=' yang jauh lebih akurat
        result += (left === 1) ? '=' : BASE64_CHARS.charAt(enc3);
        result += (left === 1 || left === 2) ? '=' : BASE64_CHARS.charAt(enc4);
    }
    return result;
}

// Konversi Teks Base64 ke Bytes (Pengganti atob)
function base64ToBytes(base64) {
    if (/[^A-Za-z0-9+/=\s]/.test(base64)) {
        throw new Error("Ciphertext mengandung karakter tidak valid!");
    }
    let str = base64.trim().replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
        throw new Error("Format Base64 tidak valid!");
    }
    
    if (str.length % 4 !== 0) {
        throw new Error("Format Ciphertext tidak valid atau terpotong!");
    }

    // PERBAIKAN 2: Gunakan variabel 'str' yang sudah bersih dari spasi
    let padding = 0;
    if (str.endsWith("==")) padding = 2;
    else if (str.endsWith("=")) padding = 1;
    
    let outLen = (str.length * 3 / 4) - padding;
    let bytes = new Uint8Array(outLen);

    let i = 0, j = 0;
    while (i < str.length) {
        let enc1 = BASE64_CHARS.indexOf(str.charAt(i++));
        let enc2 = BASE64_CHARS.indexOf(str.charAt(i++));
        let enc3 = BASE64_CHARS.indexOf(str.charAt(i++));
        let enc4 = BASE64_CHARS.indexOf(str.charAt(i++));

        let b1 = (enc1 << 2) | (enc2 >> 4);
        let b2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        let b3 = ((enc3 & 3) << 6) | enc4;

        bytes[j++] = b1;
        if (enc3 !== -1 && j < outLen) bytes[j++] = b2;
        if (enc4 !== -1 && j < outLen) bytes[j++] = b3;
    }
    return bytes;
}

let imageBase64Data = "";
let txtFileContent = "";
let lastOutputType = null; // Tracking untuk download: 'text', 'image', atau 'txt'

function resetTxtFileState() {
    txtFileContent = "";
    document.getElementById('inputTxtFile').value = "";
    let preview = document.getElementById('txtFilePreview');
    preview.style.display = 'none';
    preview.innerText = "";
}

document.getElementById('inputFile').addEventListener('change', function(e) {
    let file = e.target.files[0];

    if (!file) {
        resetImageState();
        return;
    }

    // Validasi ukuran file gambar (50MB max, warn di 20MB)
    const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
    const WARN_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
    
    if (file.size > MAX_IMAGE_SIZE) {
        alert("❌ Ukuran file gambar terlalu besar! Maksimal 50MB.");
        resetImageState();
        return;
    }
    
    if (file.size > WARN_IMAGE_SIZE) {
        alert("⚠️ Peringatan: File gambar cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi mungkin memakan waktu lebih lama.");
    }

    let reader = new FileReader();
    reader.onerror = function() {
        resetImageState();
    };
    reader.onload = function(event) {
        imageBase64Data = event.target.result; 
        let preview = document.getElementById('imagePreview');
        preview.src = imageBase64Data;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
});

document.getElementById('inputTxtFile').addEventListener('change', function(e) {
    let file = e.target.files[0];

    if (!file) {
        resetTxtFileState();
        return;
    }

    // Validasi ukuran file txt (10MB max, warn di 5MB)
    const MAX_TXT_SIZE = 10 * 1024 * 1024; // 10MB
    const WARN_TXT_SIZE = 5 * 1024 * 1024; // 5MB
    
    if (file.size > MAX_TXT_SIZE) {
        alert("❌ Ukuran file teks terlalu besar! Maksimal 10MB.");
        resetTxtFileState();
        return;
    }
    
    if (file.size > WARN_TXT_SIZE) {
        alert("⚠️ Peringatan: File teks cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi mungkin memakan waktu lebih lama.");
    }

    let reader = new FileReader();
    reader.onerror = function() {
        resetTxtFileState();
    };
    reader.onload = function(event) {
        txtFileContent = event.target.result;
        let preview = document.getElementById('txtFilePreview');
        preview.innerText = txtFileContent;
        preview.style.display = 'block';
    };
    reader.readAsText(file);
});

function processData(action) {
    let rawKey = document.getElementById('secretKey').value;
    if (!rawKey || !rawKey.trim()) {
        return alert("Kunci rahasia tidak boleh kosong!");
    }
    let keyStr = rawKey.padEnd(8, '0');
    let keyBytes = strToBytes(keyStr.substring(0, 8));
    let type = document.getElementById('inputType').value;
    let outputArea = document.getElementById('outputArea');
    let outputImage = document.getElementById('outputImage');
    outputImage.style.display = 'none';

    try {
        if (type === 'text') {
            let input = document.getElementById('inputText').value;
            if (!input) return alert("Pesan tidak boleh kosong!");

            if (action === 'encrypt') {
                let dataBytes = strToBytes(input);
                let encrypted = encryptCBC(dataBytes, keyBytes);
                outputArea.innerText = bytesToBase64(encrypted);
                lastOutputType = 'text';
            } else {
                let encBytes = base64ToBytes(input);
                let decrypted = decryptCBC(encBytes, keyBytes);
                outputArea.innerText = bytesToStr(decrypted);
                lastOutputType = 'text';
            }
        } else if (type === 'image') {
            if (action === 'encrypt') {
                if (!imageBase64Data) return alert("Pilih gambar terlebih dahulu!");
                let dataBytes = strToBytes(imageBase64Data);
                let encrypted = encryptCBC(dataBytes, keyBytes);
                outputArea.innerText = bytesToBase64(encrypted);
                lastOutputType = 'text';
            } else {
                let input = document.getElementById('inputText').value; 
                if (!input) return alert("Pindahkan Ciphertext hasil enkripsi gambar ke kotak Teks untuk didekripsi!");
                let encBytes = base64ToBytes(input);
                let decrypted = decryptCBC(encBytes, keyBytes);
                let base64Image = bytesToStr(decrypted);

                if (!base64Image.startsWith("data:image/")) {
                    throw new Error("Ciphertext ini bukan berisi gambar! Silakan gunakan mode Teks Normal.");
                }

                outputArea.innerText = "Gambar berhasil didekripsi! Lihat di bawah.";
                outputImage.src = base64Image;
                outputImage.style.display = 'block';
                lastOutputType = 'image';
            }
        } else if (type === 'txt') {
            if (action === 'encrypt') {
                if (!txtFileContent) return alert("Pilih file teks terlebih dahulu!");
                let dataBytes = strToBytes(txtFileContent);
                let encrypted = encryptCBC(dataBytes, keyBytes);
                outputArea.innerText = bytesToBase64(encrypted);
                lastOutputType = 'text';
            } else {
                let input = document.getElementById('inputText').value;
                if (!input) return alert("Pindahkan Ciphertext hasil enkripsi teks ke kotak Teks untuk didekripsi!");
                let encBytes = base64ToBytes(input);
                let decrypted = decryptCBC(encBytes, keyBytes);
                let decryptedText = bytesToStr(decrypted);
                outputArea.innerText = decryptedText;
                lastOutputType = 'txt';
            }
        }
        
        // BARU: Tampilkan tombol download setelah output berhasil dibuat
        document.getElementById('btnDownload').style.display = 'block';
        
   } catch (e) {
        // --- PERBAIKAN: Pesan error generik untuk mencegah "Oracle Attack" ---
        if (action === 'encrypt') {
            outputArea.innerText = "ERROR: Proses enkripsi gagal. Periksa kembali input Anda.";
        } else {
            outputArea.innerText = "ERROR: Proses dekripsi gagal. Pastikan Kunci Rahasia dan Ciphertext sudah benar.";
        }
        
        // Pesan error aslinya tetap kita simpan secara rahasia di Console Browser (F12) 
        // agar Anda (sebagai developer) tetap bisa melacak jika ada bug sungguhan.
        console.error("System Log (Developer Only):", e.message);
        lastOutputType = null;
        document.getElementById('btnDownload').style.display = 'none';
    }
}

function downloadOutput() {
    if (!lastOutputType) {
        return alert("Tidak ada output untuk diunduh!");
    }

    let outputArea = document.getElementById('outputArea');
    let outputImage = document.getElementById('outputImage');
    
    if (lastOutputType === 'text') {
        // Download text output (ciphertext atau plaintext)
        let text = outputArea.innerText;
        if (!text || text.includes("Hasil akan muncul") || text.includes("ERROR")) {
            return alert("Tidak ada output valid untuk diunduh!");
        }
        
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', 'output_' + new Date().getTime() + '.txt');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        
    } else if (lastOutputType === 'image') {
        // Download image output (base64 gambar)
        if (!outputImage.src || outputImage.style.display === 'none') {
            return alert("Tidak ada gambar untuk diunduh!");
        }
        
        let link = document.createElement('a');
        link.href = outputImage.src;
        // Extract format dari base64 (data:image/png atau data:image/jpeg)
        let format = outputImage.src.match(/data:image\/(.*?);/);
        let fileFormat = format ? format[1] : 'png';
        link.download = 'output_image_' + new Date().getTime() + '.' + fileFormat;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } else if (lastOutputType === 'txt') {
        // Download txt file output (plaintext dari decrypt txt file)
        let text = outputArea.innerText;
        if (!text || text.includes("Hasil akan muncul") || text.includes("ERROR")) {
            return alert("Tidak ada output valid untuk diunduh!");
        }
        
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', 'decrypt_' + new Date().getTime() + '.txt');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
