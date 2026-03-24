
// BAGIAN 1: CORE CIPHER - FEISTEL NETWORK
// Aplikasi ini menggunakan Feistel cipher yang dikustomisasi. Ini adalah block cipher
// yang membagi 8-byte block menjadi 2 bagian 4-byte, terus di-XOR dengan hasil
// Feistel function. Dilakukan 4 round untuk hasil yang lebih kuat.

// Table substitusi (S-Box) - dipak ulang di setiap load
// Ini berfungsi untuk menambah non-linearity sehingga hasil enkripsi tidak predictable
const S_BOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    S_BOX[i] = (i * 31 + 17) % 256; // Formula sederhana tapi cukup acak
}

// Rotasi bit left - untuk diffusion (penyebaran bit yang lebih baik)
// Jadi kalau satu bit input berubah, dampaknya tersebar ke banyak bit output
function rotl8(val, shift) {
    return ((val << shift) | (val >>> (8 - shift))) & 0xFF;
}

// Feistel function - ini jantung cipher kita
// Menerima setengah blok (4 byte) dan sub-kunci, return hasil transformasi
// Langkah: XOR input dengan kunci → substitusi via S-Box → rotasi bit
function feistelFunction(rightHalf, subKey) {
    let out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        let xored = rightHalf[i] ^ subKey[i];      // XOR dengan kunci
        let substituted = S_BOX[xored];            // Substitusi non-linear
        out[i] = rotl8(substituted, 2);            // Rotasi untuk diffusion
    }
    return out;
}

// Sub-kunci untuk tiap round
// Menggunakan circular shift pada kunci asli, biar tiap round punya kunci unik
function getSubKey(key, round) {
    let subKey = new Uint8Array(4);
    for(let i = 0; i < 4; i++) {
        // Pattern: R0 ambil [0,1,2,3], R1 ambil [2,3,4,5], dst
        // Ini memastikan semua byte kunci terpakai merata
        subKey[i] = key[(round * 2 + i) % 8]; 
    }
    return subKey;
}

// Enkripsi 1 blok (8 byte) menggunakan Feistel 4 round
// Intinya: split jadi L & R → 4x: fuse R dengan L, terus swap
function encryptBlock(block, key) {
    let L = block.slice(0, 4);  // Setengah kiri
    let R = block.slice(4, 8);  // Setengah kanan
    
    // 4 round Feistel
    for (let round = 0; round < 4; round++) {
        let subKey = getSubKey(key, round);
        let fResult = feistelFunction(R, subKey);
        let newR = new Uint8Array(4);
        // Hasil XOR L dengan F(R) jadi R baru
        for(let i=0; i<4; i++) newR[i] = L[i] ^ fResult[i];
        // Swap: L baru jadi R lama, R baru jadi L lama
        L = R;
        R = newR;
    }
    // Penggabungan akhir (perhatian: R dulu baru L, ini standar Feistel)
    let out = new Uint8Array(8);
    out.set(R, 0); 
    out.set(L, 4);
    return out;
}

// Dekripsi 1 blok - jalankan Feistel mundur
// Karena Feistel symmetric, kita cukup jalankan round dalam urutan terbalik
function decryptBlock(block, key) {
    let currR = block.slice(0, 4);  // Ingat: di enkripsi, output R & L di-swap
    let currL = block.slice(4, 8); 

    // Mundur dari round 3 ke 0 (balik urutan)
    for (let round = 3; round >= 0; round--) {
        let subKey = getSubKey(key, round);
        
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

// BAGIAN 2: MODE OPERASI - CBC
// CBC (Cipher Block Chaining) membuat dependency antar blok
// Jadi kalau satu byte plaintext berubah, hampir seluruh ciphertext berubah
// Ini lebih aman dibanding ECB yang mentransformasi tiap blok independent

// Enkripsi dengan CBC mode
// Langkah:
// 1. Padding plaintext ke kelipatan 8 byte (PKCS7)
// 2. Generate IV acak 8 byte
// 3. Per blok: XOR dengan blok sebelumnya → enkripsi block
function encryptCBC(plaintextBytes, keyBytes) {
    // Padding PKCS7: tambah byte senilai padding count
    let padLen = 8 - (plaintextBytes.length % 8);
    let padded = new Uint8Array(plaintextBytes.length + padLen);
    padded.set(plaintextBytes);
    for (let i = plaintextBytes.length; i < padded.length; i++) padded[i] = padLen;

    // Generate IV acak - penting untuk security!
    if (!window.crypto || !window.crypto.getRandomValues) {
        throw new Error("Browser tidak mendukung generator IV acak (crypto.getRandomValues).");
    }
    let iv = new Uint8Array(8);
    window.crypto.getRandomValues(iv);  // Benar-benar acak, bukan pseudo-random
    
    // Output: IV + ciphertext
    let ciphertext = new Uint8Array(iv.length + padded.length);
    ciphertext.set(iv);

    // CBC chain: XOR each block dengan previous ciphertext block
    let prevBlock = iv;  // Block pertama di-XOR dengan IV
    for (let i = 0; i < padded.length; i += 8) {
        let block = padded.slice(i, i + 8);
        // XOR dengan previous ciphertext
        for (let j = 0; j < 8; j++) block[j] ^= prevBlock[j]; 
        // Enkripsi block
        let encBlock = encryptBlock(block, keyBytes);
        ciphertext.set(encBlock, iv.length + i);
        // Block ini jadi previous untuk block berikutnya
        prevBlock = encBlock;
    }
    return ciphertext;
}

// Dekripsi CBC - kebalikan enkripsi
// Ambil IV dari awal ciphertext, terus decrypt tiap block sambil maintain chain
function decryptCBC(ciphertextBytes, keyBytes) {
    // Validasi format
    if (ciphertextBytes.length < 16) {
        throw new Error("Ciphertext terlalu pendek. Harus minimal 16 byte (IV + 1 encrypted block).");
    }
    if ((ciphertextBytes.length - 8) % 8 !== 0) {
        throw new Error("Format ciphertext tidak valid. Panjang data harus kelipatan 8 byte.");
    }

    // Ambil IV dari 8 byte pertama
    let iv = ciphertextBytes.slice(0, 8);
    let data = ciphertextBytes.slice(8);
    let decryptedPadded = new Uint8Array(data.length);

    // CBC chain decrypt
    let prevBlock = iv;
    for (let i = 0; i < data.length; i += 8) {
        let block = data.slice(i, i + 8);
        let decBlock = decryptBlock(block, keyBytes);
        // XOR hasil decrypt dengan previous ciphertext
        for (let j = 0; j < 8; j++) decBlock[j] ^= prevBlock[j]; 
        decryptedPadded.set(decBlock, i);
        // Ciphertext block ini jadi previous untuk round berikutnya
        prevBlock = block;
    }

    // Validate & remove padding
    let padLen = decryptedPadded[decryptedPadded.length - 1];
    if (padLen < 1 || padLen > 8) throw new Error("Kunci salah atau data rusak (Padding validation gagal).");
    for (let i = decryptedPadded.length - padLen; i < decryptedPadded.length; i++) {
        if (decryptedPadded[i] !== padLen) {
            throw new Error("Kunci salah atau data rusak (Padding validation gagal).");
        }
    }
    return decryptedPadded.slice(0, decryptedPadded.length - padLen);
}

// BAGIAN 3: UI & FILE HANDLING
// Mode enkripsi atau dekripsi?
let currentMode = 'encrypt';

// Reset state gambar yang di-upload
function resetImageState() {
    imageBase64Data = "";  // Bersihkan data gambar
    let fileInput = document.getElementById('inputFile');
    let preview = document.getElementById('imagePreview');
    fileInput.value = "";  // Reset input file
    preview.removeAttribute('src');  // Hapus src preview
    preview.style.display = 'none';  // Sembunyikan preview
    
    // Hapus metadata gambar juga
    let imagePreviewInfo = document.getElementById('imagePreviewInfo');
    if (imagePreviewInfo) {
        imagePreviewInfo.style.display = 'none';
        imagePreviewInfo.innerHTML = "";
    }
}

function switchMode(mode) {
    // [HIGH BUG 1&2 FIX]: Abort running FileReaders sebelum mode switch
    // untuk prevent race condition dan memory leak
    if (currentImageReader) {
        currentImageReader.abort();
        currentImageReader = null;
    }
    if (currentTxtReader) {
        currentTxtReader.abort();
        currentTxtReader = null;
    }
    
    currentMode = mode;
    
    // Highlight tab yang aktif
    document.getElementById('tabEncrypt').classList.toggle('active', mode === 'encrypt');
    document.getElementById('tabDecrypt').classList.toggle('active', mode === 'decrypt');
    
    // Update aria-selected untuk accessibility
    document.getElementById('tabEncrypt').setAttribute('aria-selected', mode === 'encrypt');
    document.getElementById('tabDecrypt').setAttribute('aria-selected', mode === 'decrypt');

    // Tampilkan tombol sesuai mode
    document.getElementById('btnEncrypt').style.display = mode === 'encrypt' ? 'block' : 'none';
    document.getElementById('btnDecrypt').style.display = mode === 'decrypt' ? 'block' : 'none';

    // M2: COMPREHENSIVE CLEANUP - Reset semua state saat ganti tab
    document.getElementById('outputArea').innerText = "Hasil akan muncul di sini...";
    document.getElementById('outputImage').style.display = 'none';
    document.getElementById('copyNotification').style.display = 'none';
    document.getElementById('inputText').value = ""; 
    document.getElementById('btnCopy').style.display = 'none';
    document.getElementById('btnDownload').style.display = 'none';
    lastOutputType = null;
    
    // M2: Reset global variables
    resetImageState();
    resetTxtFileState(); // PENTING: Clear txt file state
    
    // M2: Reset form inputs
    document.getElementById('secretKey').value = "";
    
    // M2: Clear image preview info
    let imagePreviewInfo = document.getElementById('imagePreviewInfo');
    if (imagePreviewInfo) {
        imagePreviewInfo.style.display = 'none';
        imagePreviewInfo.innerText = "";
    }
    
    /* M5: Reset warning state setiap kali switch mode */
    warningState = {
        imageWarned: false,
        txtWarned: false,
        textWarned: false
    };
    
    // FITUR 1 & 2: Reset password visibility dan decryption metadata
    let secretKeyInput = document.getElementById('secretKey');
    let toggleBtn = document.getElementById('togglePasswordBtn');
    if (secretKeyInput) secretKeyInput.type = 'password'; // Reset ke password
    if (toggleBtn) {
        // Reset SVG icons ke state awal (eye-open visible, eye-closed hidden)
        let eyeOpen = toggleBtn.querySelector('.eye-open');
        let eyeClosed = toggleBtn.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = 'inline';
        if (eyeClosed) eyeClosed.style.display = 'none';
        toggleBtn.setAttribute('aria-checked', false);
    }
    
    // FITUR 2: Clear decryption metadata area
    let decryptionMetadata = document.getElementById('decryptionMetadataArea');
    if (decryptionMetadata) {
        decryptionMetadata.style.display = 'none';
        decryptionMetadata.innerText = "";
    }
    
    // Update pilihan format sesuai mode
    let optionImage = document.getElementById('optionImage');
    let inputType = document.getElementById('inputType');
    
    if (mode === 'encrypt') {
        // Enkripsi: tampilkan semua 3 pilihan
        optionImage.style.display = 'block';
        inputType.value = 'text'; // Reset ke teks normal
    } else {
        // Dekripsi: sembunyikan opsi gambar karena ciphertext sudah dalam bentuk text Base64
        optionImage.style.display = 'none';
        inputType.value = 'text'; // Reset ke teks normal
    }
    
    // Perbarui form sesuai mode
    toggleInput();
}

// Tombol teks bantuan
function setInputGroupVisibility(textVisible, fileVisible, txtFileVisible) {
    // Simple utility untuk show/hide input groups based on tipe input yang dipilih
    document.getElementById('textInputGroup').style.display = textVisible ? 'block' : 'none';
    document.getElementById('fileInputGroup').style.display = fileVisible ? 'block' : 'none';
    document.getElementById('txtFileInputGroup').style.display = txtFileVisible ? 'block' : 'none';
}

function toggleInput() {
    // C4: Protect dari race condition - jangan ganti input saat processing
    if (isProcessing) {
        alert("⚠️ Proses masih berjalan. Tunggu selesai sebelum mengganti format input.");
        document.getElementById('inputType').value = currentInputType || 'text';
        return;
    }
    
    let type = document.getElementById('inputType').value;
    currentInputType = type; // C4: Simpan state saat ini untuk race condition protection
    
    // Reset semua file states terlebih dahulu
    resetImageState();
    resetTxtFileState();
    
    // Config untuk setiap tipe input
    const config = {
        encrypt: {
            text: { visibility: [true, false, false], labels: { text: '3. Masukkan Pesan Asli (Plaintext):', file: '', txtFile: '' } },
            image: { visibility: [false, true, false], labels: { text: '', file: '3. Unggah File Gambar yang akan disandikan:', txtFile: '' } },
            txt: { visibility: [false, false, true], labels: { text: '', file: '', txtFile: '3. Unggah File Teks yang akan disandikan:' } }
        },
        decrypt: {
            text: { visibility: [true, false, false], labels: { text: '3. Paste Ciphertext (Teks Sandi) di sini:', file: '', txtFile: '' } },
            txt: { visibility: [false, false, true], labels: { text: '', file: '', txtFile: '3. Unggah File Ciphertext (.txt):' } }
        }
    };
    
    // Ambil config berdasarkan mode dan tipe input
    const modeConfig = config[currentMode];
    const typeConfig = modeConfig && modeConfig[type];
    
    if (typeConfig) {
        // Set visibility
        setInputGroupVisibility(...typeConfig.visibility);
        // Set labels
        if (typeConfig.labels.text) document.getElementById('textInputLabel').innerText = typeConfig.labels.text;
        if (typeConfig.labels.file) document.getElementById('fileInputLabel').innerText = typeConfig.labels.file;
        if (typeConfig.labels.txtFile) document.getElementById('txtFileInputLabel').innerText = typeConfig.labels.txtFile;
    }
    
    // Update teks bantuan ukuran file .txt berdasarkan mode
    let txtSizeHelpElement = document.getElementById('txtFileHelp');
    if (txtSizeHelpElement) {
        txtSizeHelpElement.innerText = currentMode === 'encrypt' ? 'Maksimal 10MB' : 'Maksimal 150MB';
    }
}

// Batasi ukuran input text tergantung mode
document.getElementById('inputText').addEventListener('input', function(e) {
    // Mode-specific limits: dekripsi butuh limit lebih besar untuk ciphertext dari gambar besar
    const isDecryptMode = currentMode === 'decrypt';
    const MAX_TEXT_SIZE = isDecryptMode ? 
        150 * 1024 * 1024 :      // Dekripsi: 150MB (untuk ciphertext gambar/txt besar)
        5 * 1024 * 1024;         // Enkripsi: 5MB (untuk teks biasa)
    const WARN_TEXT_SIZE = isDecryptMode ? 
        50 * 1024 * 1024 :       // Dekripsi: warning di 50MB
        1 * 1024 * 1024;         // Enkripsi: warning di 1MB
    
    let textBytes = new TextEncoder().encode(this.value).length;
    
    if (textBytes > MAX_TEXT_SIZE) {
        // Potong otomatis jika terlalu besar
        let encoded = new TextEncoder().encode(this.value);
        let trimmed = new TextDecoder().decode(encoded.slice(0, MAX_TEXT_SIZE));
        this.value = trimmed;
        let modeText = isDecryptMode ? "Dekripsi" : "Enkripsi";
        let limitMB = (MAX_TEXT_SIZE / (1024 * 1024)).toFixed(0);
        alert("❌ Teks " + modeText.toLowerCase() + " terlalu besar! Maksimal " + limitMB + "MB. Teks telah dipotong otomatis.");
        return;
    }
    
});

// Initialize saat page load
window.onload = function() {
    // Jalankan switchMode untuk setup awal
    switchMode('encrypt');

    // Bersihkan autofill - browser suka auto-fill form, ini trik agar jangan
    setTimeout(() => {
        document.getElementById('secretKey').value = "";
        document.getElementById('inputText').value = "";
        document.getElementById('inputFile').value = ""; // Reset file gambar juga
    }, 10);
    
    // M1: Refactor Ctrl+A handler untuk lebih clean dan focused
    handleSelectAllShortcut();
    
    // FITUR 1: Password toggle event listener
    setupPasswordToggle();
};

/* FITUR 1: Setup password visibility toggle */
function setupPasswordToggle() {
    let toggleBtn = document.getElementById('togglePasswordBtn');
    let secretKeyInput = document.getElementById('secretKey');
    
    if (!toggleBtn || !secretKeyInput) return;
    
    toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Toggle antara password dan text type
        let isPassword = secretKeyInput.type === 'password';
        secretKeyInput.type = isPassword ? 'text' : 'password';
        
        // Toggle SVG icons
        let eyeOpen = toggleBtn.querySelector('.eye-open');
        let eyeClosed = toggleBtn.querySelector('.eye-closed');
        
        if (isPassword) {
            eyeOpen.style.display = 'none';
            eyeClosed.style.display = 'inline';
        } else {
            eyeOpen.style.display = 'inline';
            eyeClosed.style.display = 'none';
        }
        
        // Update aria attributes
        toggleBtn.setAttribute('aria-pressed', isPassword);
        toggleBtn.title = isPassword ? 'Sembunyikan kunci' : 'Tampilkan kunci';
        toggleBtn.setAttribute('aria-label', isPassword ? 'Sembunyikan kunci enkripsi' : 'Tampilkan kunci enkripsi');
    });
}

/* FITUR 2: Helper function untuk tampilkan metadata hasil dekripsi */
function displayDecryptionMetadata(decryptedBytes, decryptedContent) {
    let metadataArea = document.getElementById('decryptionMetadataArea');
    if (!metadataArea) return;
    
    // M3: Buat session flag untuk prevent race condition saat mode switch
    let sessionId = Math.random();
    metadataArea._sessionId = sessionId;
    
    try {
        // Hitung size dalam KB atau MB
        let sizeBytes = decryptedBytes.length;
        let sizeDisplay;
        if (sizeBytes > 1024 * 1024) {
            sizeDisplay = `${(sizeBytes / (1024 * 1024)).toFixed(2)}MB`;
        } else if (sizeBytes > 1024) {
            sizeDisplay = `${(sizeBytes / 1024).toFixed(2)}KB`;
        } else {
            sizeDisplay = `${sizeBytes}B`;
        }
        
        // Tentukan tipe (Gambar atau Teks)
        let isImage = decryptedContent.startsWith('data:image/');
        let contentType = isImage ? 'Gambar' : 'Teks';
        let mimeType = '';
        
        // Extract MIME type jika gambar
        if (isImage) {
            let mimeMatch = decryptedContent.match(/^data:([^;]+)/);
            if (mimeMatch) mimeType = mimeMatch[1];
        }
        
        // Compose metadata info
        let metadataInfo = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${sizeDisplay} | ${contentType}`;
        
        // Jika gambar, coba dapat dimensi secara async
        if (isImage) {
            let img = new Image();
            img.onload = function() {
                // M3: Check kalau metadata area masih valid (tidak di-clear saat mode switch)
                if (!metadataArea || metadataArea._sessionId !== sessionId) return;
                
                let dimension = `${this.width}x${this.height}px`;
                metadataInfo = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${sizeDisplay} | ${contentType} | <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; margin-left: 3px;"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg> ${dimension}`;
                if (mimeType) metadataInfo += ` | <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; margin-left: 3px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><circle cx="6.5" cy="6.5" r="1.5"></circle></svg> ${mimeType}`;
                metadataArea.innerHTML = metadataInfo;
            };
            img.onerror = function() {
                // M3: Check kalau metadata area masih valid
                if (!metadataArea || metadataArea._sessionId !== sessionId) return;
                
                // Jika gagal load image untuk dimensi, tetap tampilkan basic info
                if (mimeType) metadataInfo += ` | <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; margin-left: 3px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><circle cx="6.5" cy="6.5" r="1.5"></circle></svg> ${mimeType}`;
                metadataArea.innerHTML = metadataInfo;
            };
            img.src = decryptedContent;
        } else {
            // Untuk teks, langsung tampilkan
            metadataArea.innerHTML = metadataInfo;
        }
        
        // Tampilkan metadata area
        metadataArea.style.display = 'block';
    } catch (error) {
        console.error("Error displaying metadata:", error);
    }
}

// Validasi output size setelah decode
// Kalau hasil decode terlalu besar, bisa crash browser
function validateDecodedSize(decodedBytes, maxBytes = 500 * 1024 * 1024) {
    if (decodedBytes.length > maxBytes) {
        throw new Error("Output decoded terlalu besar (" + (decodedBytes.length / (1024*1024)).toFixed(0) + "MB). Batas maksimal " + (maxBytes / (1024*1024)).toFixed(0) + "MB.");
    }
    return true;
}

// Sanitize filename - cegah path traversal attacks
// Hapus karakter special, hanya allow alfanumeric + dash/underscore/dot
function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 50);
}

/* M1: Refactored Ctrl+A handler - focused & maintainable */
function handleSelectAllShortcut() {
    document.addEventListener('keydown', function(e) {
        // Check untuk Ctrl+A atau Cmd+A (Mac)
        if (!(e.ctrlKey || e.metaKey) || e.key !== 'a') return;
        
        let outputArea = document.getElementById('outputArea');
        let outputImage = document.getElementById('outputImage');
        let activeElement = document.activeElement;
        
        // Hanya intervensi jika focus di output area atau image
        if (activeElement !== outputArea && activeElement !== outputImage) return;
        
        // M1: Prevent default selection behavior
        e.preventDefault();
        
        // Select semua teks di output area (jika ada)
        if (activeElement === outputArea && outputArea.innerText.trim() !== '') {
            let range = document.createRange();
            range.selectNodeContents(outputArea);
            let sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    });
}

// BAGIAN 4: CONVERTER & HASH
// Text ke Bytes - transform string UTF-8 ke Uint8Array
function strToBytes(str) {
    return new TextEncoder().encode(str);
}

// Bytes ke Text - transform Uint8Array back ke string UTF-8
// Note: fatal: true artinya throw error kalau hasil bukan valid UTF-8
// Ini membantu detect kalau decryption gagal (dapet random bytes bukan text)
function bytesToStr(bytes) {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// BAGIAN 5: BASE64 CODEC
// Tidak boleh pake btoa/atob, jadi kita custom dari scratch
// Base64 dipakai karena hasil encrypt adalah binary data, tapi interface aplikasi butuh text

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Bytes → Base64 String
// Algoritma: ambil 3 byte (24 bit), bagi jadi 4 chunk 6-bit, convert ke Base64 char
function bytesToBase64(bytes) {
    let result = '';
    let i = 0;
    let length = bytes.length;

    while (i < length) {
        let left = length - i;  // Byte tersisa
        
        let b1 = bytes[i++];
        let b2 = i < length ? bytes[i++] : 0;
        let b3 = i < length ? bytes[i++] : 0;

        // Split 24 bit jadi 4 chunk 6-bit
        let enc1 = b1 >> 2;
        let enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
        let enc4 = b3 & 63;

        result += BASE64_CHARS.charAt(enc1);
        result += BASE64_CHARS.charAt(enc2);
        
        // Kalau ada byte yang "tidak valid", ganti dengan padding =
        result += (left === 1) ? '=' : BASE64_CHARS.charAt(enc3);
        result += (left === 1 || left === 2) ? '=' : BASE64_CHARS.charAt(enc4);
    }
    return result;
}

// Base64 String → Bytes
// Algoritma kebalikan bytesToBase64, tapi dengan banyak validasi
function base64ToBytes(base64) {
    try {
        if (typeof base64 !== 'string') {
            throw new Error("Input Base64 harus string bukan type lain.");
        }

        // Normalisasi: hapus whitespace & newline (standard Base64 format)
        let str = base64.trim().replace(/[\r\n\s]/g, "");
        
        // Validasi charset - hanya boleh alfanumeric + +/=
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
            throw new Error("Base64 mengandung karakter yang tidak valid.");
        }
        
        // Panjang harus kelipatan 4 (standart Base64)
        if (str.length % 4 !== 0) {
            throw new Error("Panjang Base64 tidak valid (bukan kelipatan 4). Mungkin ciphertext terpotong?");
        }

        // Hitung padding = di akhir untuk tentukan output size
        let padding = 0;
        if (str.endsWith("==")) padding = 2;
        else if (str.endsWith("=")) padding = 1;
        
        let outLen = (str.length * 3 / 4) - padding;
        
        if (outLen <= 0) {
            throw new Error("Hasil Base64 decode tidak valid (output size <= 0).");
        }
        
        // Validasi buffer size - cegah crash dari OOM
        const MAX_DECODE_SIZE = 500 * 1024 * 1024; // 500MB hard limit
        if (outLen > MAX_DECODE_SIZE) {
            throw new Error(`Hasil decode terlalu besar (${(outLen / 1024 / 1024).toFixed(2)}MB > 500MB). Kemungkinan data corrupt atau serangan.`);
        }
        
        let bytes = new Uint8Array(outLen);

        // Decode 4 Base64 char → 3 bytes
        let i = 0, j = 0;
        while (i < str.length) {
            let enc1 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc2 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc3 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc4 = BASE64_CHARS.indexOf(str.charAt(i++));

            if (enc1 === -1 || enc2 === -1) {
                throw new Error(`Karakter Base64 tidak valid di posisi ${i - 4}`);
            }

            // Combine 4 chunk 6-bit → 3 byte
            let b1 = (enc1 << 2) | (enc2 >> 4);
            let b2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            let b3 = ((enc3 & 3) << 6) | enc4;

            bytes[j++] = b1;
            if (enc3 !== -1 && j < outLen) bytes[j++] = b2;  // Hanya kalau enc3 valid
            if (enc4 !== -1 && j < outLen) bytes[j++] = b3;  // Hanya kalau enc4 valid
        }
        
        // Verify output size match
        if (j !== outLen) {
            throw new Error(`Decode mismatch: expected ${outLen} bytes, got ${j} bytes.`);
        }
        
        return bytes;
    } catch (error) {
        throw new Error(`Base64 decode error: ${error.message}`);
    }
}

// BAGIAN 6: INTEGRITY & HASH
// Hash untuk detect kalau ciphertext di-modify
// Menggunakan DJB2, bukan cryptographic hash (ok untuk non-cryptographic use)

function generateCustomHash(str) {
    // DJB2 algorithm - simple tapi cukup baik untuk detect changes
    let hash = 5381;  // Magic number (prime-related)
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) + hash) ^ char;  // (hash * 33) ^ char
    }
    
    // Convert ke 32-bit unsigned int, format jadi hex string
    return (hash >>> 0).toString(16).padStart(8, '0');
}

let imageBase64Data = "";
let txtFileContent = "";
let lastOutputType = null;  /* Tracking output type untuk download: 'text', 'image', atau 'txt' */
let currentInputType = 'text';  /* Track jenis input yang aktif */

/* Global reference untuk FileReader yang sedang aktif untuk bisa di-abort kalau user switch mode */
let currentImageReader = null;
let currentTxtReader = null;

/* Flag race condition prevention - pastikan hanya satu proses encrypt/decrypt berjalan */
let isProcessing = false;

/* Timeout protection: kalau proses lebih dari 60 detik, stop otomatis supaya browser tidak hang */
let operationTimeout = null;
const OPERATION_TIMEOUT_MS = 60000;  /* 60 detik timeout */

/* Tracking warning state untuk prevent spam notifikasi yang sama berkali-kali */
let warningState = {
    imageWarned: false,
    txtWarned: false,
    textWarned: false
};

function resetTxtFileState() {
    /* Bersihkan semua state file teks sesuai kondisi sebelumnya */
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

    // Cleanup FileReader sebelumnya kalau ada untuk prevent memory leak saat baca file baru
    if (currentImageReader) {
        currentImageReader.abort();
        currentImageReader = null;
    }

    // Batasi ukuran file gambar untuk prevent browser memory issues
    const MAX_IMAGE_SIZE = 50 * 1024 * 1024;  /* 50MB batas maksimal */
    const WARN_IMAGE_SIZE = 20 * 1024 * 1024;  /* 20MB threshold warning */
    
    if (file.size > MAX_IMAGE_SIZE) {
        alert("❌ Ukuran file gambar terlalu besar! Maksimal 50MB.");
        resetImageState();
        return;
    }
    
    // M5: Only show warning once per session
    if (file.size > WARN_IMAGE_SIZE && !warningState.imageWarned) {
        alert("⚠️ Peringatan: File gambar cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi mungkin memakan waktu lebih lama.");
        warningState.imageWarned = true; // Set flag untuk prevent spam
    }

    // Tracking FileReader untuk cleanup nanti saat pembaca di-abort
    currentImageReader = reader;
    
    // M4: Track FileReader abort status
    let isAborted = false;
    reader._isAborted = false;
    
    reader.onerror = function() {
        console.error("Error membaca file gambar");
        isAborted = true;
        reader._isAborted = true;
        resetImageState();
        currentImageReader = null; // K1: Cleanup
    };
    reader.onload = function(event) {
        // M4: Check kalau reader tidak di-abort sebelum update state
        if (isAborted || reader._isAborted) return;
        imageBase64Data = event.target.result; 
        let preview = document.getElementById('imagePreview');
        preview.src = imageBase64Data;
        preview.style.display = 'block';
        
        // C3: Add metadata info (size, dimensions, type)
        let img = new Image();
        img.onload = function() {
            let fileSize = (file.size / (1024 * 1024)).toFixed(2); // MB
            let dimension = `${this.width}x${this.height}px`;
            
            // Create atau update info element
            let infoEl = document.getElementById('imagePreviewInfo');
            if (!infoEl) {
                infoEl = document.createElement('div');
                infoEl.id = 'imagePreviewInfo';
                preview.parentElement.appendChild(infoEl);
            }
            infoEl.style.display = 'block';
            infoEl.style.cssText = 'font-size: 12px; color: #9ca3af; margin-top: 8px;';
            infoEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${fileSize}MB | <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; margin-left: 3px;"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg> ${dimension} | <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; margin-left: 3px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><circle cx="6.5" cy="6.5" r="1.5"></circle></svg> ${file.type}`;
            infoEl.setAttribute('role', 'status');
            infoEl.setAttribute('aria-live', 'polite');
        };
        img.src = imageBase64Data;
        
        currentImageReader = null; // K1: Cleanup setelah load selesai
        isAborted = false; // M4: Reset abort flag
    };
    reader.readAsDataURL(file);
});

document.getElementById('inputTxtFile').addEventListener('change', function(e) {
    let file = e.target.files[0];

    if (!file) {
        resetTxtFileState();
        return;
    }

    // K1: Cleanup previous reader jika ada untuk prevent memory leak
    if (currentTxtReader) {
        currentTxtReader.abort();
        currentTxtReader = null;
    }

    // Batasi ukuran file teks - berbeda antara mode encrypt vs decrypt
    const isDecryptMode = currentMode === 'decrypt';
    const MAX_TXT_SIZE = isDecryptMode ? 
        150 * 1024 * 1024 :      /* Dekripsi: Max 150MB */
        10 * 1024 * 1024;        /* Enkripsi: Max 10MB */
    const WARN_TXT_SIZE = isDecryptMode ? 
        50 * 1024 * 1024 :       /* Dekripsi: Warning 50MB */
        5 * 1024 * 1024;         /* Enkripsi: Warning 5MB */
    
    if (file.size > MAX_TXT_SIZE) {
        let maxMB = (MAX_TXT_SIZE / (1024*1024)).toFixed(0);
        alert("❌ Ukuran file teks terlalu besar! Maksimal " + maxMB + "MB.");
        resetTxtFileState();
        return;
    }
    
    // M5: Only show warning once per session
    if (file.size > WARN_TXT_SIZE && !warningState.txtWarned) {
        alert("⚠️ Peringatan: File teks cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi/dekripsi mungkin memakan waktu lebih lama.");
        warningState.txtWarned = true; // Set flag untuk prevent spam
    }

    let reader = new FileReader();
    currentTxtReader = reader; // K1: Track untuk cleanup
    let preview = document.getElementById('txtFilePreview'); // FIX: Declare preview di sini agar accessible di luar callback
    
    // M4: Track FileReader abort status
    let isTxtAborted = false;
    reader._isTxtAborted = false;
    
    reader.onerror = function() {
        console.error("Error membaca file teks");
        isTxtAborted = true;
        reader._isTxtAborted = true;
        resetTxtFileState();
        currentTxtReader = null; // K1: Cleanup
        preview.parentElement.classList.remove('loading'); // FIX: Remove loading state on error
        
        // [HIGH BUG 6 FIX]: Reset button loading state jika ada proses encryption running
        if (isProcessing) {
            let btnEncrypt = document.getElementById('btnEncrypt');
            let btnDecrypt = document.getElementById('btnDecrypt');
            if (btnEncrypt && btnEncrypt.classList.contains('loading')) {
                btnEncrypt.classList.remove('loading');
                let btnText = btnEncrypt.querySelector('.btn-text');
                if (btnText) btnText.innerText = 'EKSEKUSI ENKRIPSI';
            }
            if (btnDecrypt && btnDecrypt.classList.contains('loading')) {
                btnDecrypt.classList.remove('loading');
                let btnText = btnDecrypt.querySelector('.btn-text');
                if (btnText) btnText.innerText = 'EKSEKUSI DEKRIPSI';
            }
        }
    };
    reader.onload = function(event) {
        // M4: Check kalau reader tidak di-abort
        if (isTxtAborted || reader._isTxtAborted) return;
        txtFileContent = event.target.result;
        preview.innerText = txtFileContent;
        preview.style.display = 'block';
        currentTxtReader = null; // K1: Cleanup setelah load selesai
        isTxtAborted = false; // M4: Reset abort flag
        
        // M8: Remove loading state
        preview.parentElement.classList.remove('loading');
    };
    
    // M8: Add loading state saat membaca file
    preview.parentElement.classList.add('loading');
    reader.readAsText(file);
});

function processData(action) {
    /* Proteksi race condition: hanya 1 proses dapat berjalan bersamaan
       Kalau user spam tombol, bisa cause data corruption */
    if (isProcessing) {
        alert("Proses masih berjalan. Tunggu sebentar...");
        return;
    }
    
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

    /* Set processing flag agar TIDAK boleh triggered ulang
       Disable button biar user tahu sedang proses */
    isProcessing = true;
    let processBtn = action === 'encrypt' ? 
        document.getElementById('btnEncrypt') : 
        document.getElementById('btnDecrypt');
    let originalBtnText = processBtn.innerText;
    processBtn.disabled = true;
    
    // Update button with loading state
    let btnText = processBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.innerText = action === 'encrypt' ? 'MEMPROSES...' : 'MEMPROSES...';
    }
    processBtn.classList.add('loading'); // ✅ ADD: Tampilkan animasi loading

    /* Setup timeout protection: kalau proses >60 detik, abort otomatis
       Ini prevent browser freeze dari operasi yang stuck */
    operationTimeout = setTimeout(function() {
        // M3: Timeout handler
        if (isProcessing) {
            isProcessing = false;
            processBtn.disabled = false;
            let btnText = processBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.innerText = action === 'encrypt' ? 'EKSEKUSI ENKRIPSI' : 'EKSEKUSI DEKRIPSI';
            }
            processBtn.classList.remove('loading');
            outputArea.innerText = `ERROR: Operasi timeout (>60 detik). Proses dibatalkan untuk mencegah browser hang.`;
            lastOutputType = null;
            document.getElementById('btnCopy').style.display = 'none';
            document.getElementById('btnDownload').style.display = 'none';
            alert("Proses terlalu lama (>60 detik). Dibatalkan otomatis.");
        }
    }, OPERATION_TIMEOUT_MS);

    // Bungkus komputasi berat dalam setTimeout agar browser dapat refresh display
    // Ini prevent UI freeze saat proses enkripsi/dekripsi file besar
    setTimeout(function() {
        try {
        if (type === 'text') {
            let input = document.getElementById('inputText').value;
            if (!input) return alert("Pesan tidak boleh kosong!");

            if (action === 'encrypt') {
                let dataBytes = strToBytes(input);
                let encrypted = encryptCBC(dataBytes, keyBytes);
                let base64Output = bytesToBase64(encrypted);
                let hash = generateCustomHash(base64Output);
                outputArea.innerText = base64Output + "." + hash; // Append hash dengan pemisah titik
                lastOutputType = 'text';
            } else {
                // MODE DEKRIPSI dengan validasi hash integrity
                // Pisahkan ciphertext dan hash
                let separatorIndex = input.lastIndexOf('.');
                if (separatorIndex === -1) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                let base64Part = input.substring(0, separatorIndex);
                let hashPart = input.substring(separatorIndex + 1);
                
                // Validasi hash
                let calculatedHash = generateCustomHash(base64Part);
                if (calculatedHash !== hashPart) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                
                let encBytes = base64ToBytes(base64Part);
                let decrypted = decryptCBC(encBytes, keyBytes);
                
                // C3: Validate output size
                validateDecodedSize(decrypted);
                
                let decryptedText = bytesToStr(decrypted);
                
                // FITUR 2: Display metadata hasil dekripsi
                displayDecryptionMetadata(decrypted, decryptedText);
                
                // Cek apakah hasil dekripsi adalah gambar (data:image/xxx)
                if (decryptedText.startsWith("data:image/")) {
                    // Hasil dekripsi adalah gambar - tampilkan sebagai gambar
                    outputArea.innerText = "Gambar berhasil didekripsi! Lihat di bawah.";
                    outputImage.src = decryptedText;
                    outputImage.style.display = 'block';
                    lastOutputType = 'image';
                } else {
                    // Hasil dekripsi adalah teks normale
                    outputArea.innerText = decryptedText;
                    lastOutputType = 'text';
                }
            }
        } else if (type === 'image') {
            if (action === 'encrypt') {
                if (!imageBase64Data) return alert("Pilih gambar terlebih dahulu!");
                let dataBytes = strToBytes(imageBase64Data);
                let encrypted = encryptCBC(dataBytes, keyBytes);
                let base64Output = bytesToBase64(encrypted);
                let hash = generateCustomHash(base64Output);
                outputArea.innerText = base64Output + "." + hash; // Append hash dengan pemisah titik
                lastOutputType = 'text';
            } else {
                let input = document.getElementById('inputText').value; 
                if (!input) return alert("Pindahkan Ciphertext hasil enkripsi gambar ke kotak Teks untuk didekripsi!");
                
                // MODE DEKRIPSI dengan validasi hash integrity
                // Pisahkan ciphertext dan hash
                let separatorIndex = input.lastIndexOf('.');
                if (separatorIndex === -1) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                let base64Part = input.substring(0, separatorIndex);
                let hashPart = input.substring(separatorIndex + 1);
                
                // Validasi hash
                let calculatedHash = generateCustomHash(base64Part);
                if (calculatedHash !== hashPart) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                
                let encBytes = base64ToBytes(base64Part);
                let decrypted = decryptCBC(encBytes, keyBytes);
                
                // C3: Validate output size
                validateDecodedSize(decrypted);
                
                let base64Image = bytesToStr(decrypted);

                // FITUR 2: Tampilkan informasi metadata dari hasil dekripsi gambar
                displayDecryptionMetadata(decrypted, base64Image);

                // Integrity validation: cegah kalau hasil dekripsi bukan gambar valid
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
                let base64Output = bytesToBase64(encrypted);
                let hash = generateCustomHash(base64Output);
                outputArea.innerText = base64Output + "." + hash; // Append hash dengan pemisah titik
                lastOutputType = 'text';
            } else {
                // MODE DEKRIPSI dengan validasi hash integrity
                let input = txtFileContent || document.getElementById('inputText').value;
                if (!input) return alert("Unggah file Ciphertext (.txt) untuk didekripsi!");
                
                // Pisahkan ciphertext dan hash
                let separatorIndex = input.lastIndexOf('.');
                if (separatorIndex === -1) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                let base64Part = input.substring(0, separatorIndex);
                let hashPart = input.substring(separatorIndex + 1);
                
                // Validasi hash
                let calculatedHash = generateCustomHash(base64Part);
                if (calculatedHash !== hashPart) {
                    throw new Error("Integritas data rusak! Ciphertext telah dimodifikasi oleh pihak luar.");
                }
                
                let encBytes = base64ToBytes(base64Part);
                let decrypted = decryptCBC(encBytes, keyBytes);
                
                // C3: Validate output size
                validateDecodedSize(decrypted);
                
                let decryptedText = bytesToStr(decrypted);
                
                // FITUR 2: Display metadata hasil dekripsi
                displayDecryptionMetadata(decrypted, decryptedText);
                
                // Cek apakah hasil dekripsi adalah gambar (data:image/xxx)
                if (decryptedText.startsWith("data:image/")) {
                    // Hasil dekripsi adalah gambar - tampilkan sebagai gambar
                    outputArea.innerText = "Gambar berhasil didekripsi! Lihat di bawah.";
                    outputImage.src = decryptedText;
                    outputImage.style.display = 'block';
                    lastOutputType = 'image';
                } else {
                    // Hasil dekripsi adalah teks normal
                    outputArea.innerText = decryptedText;
                    lastOutputType = 'txt';
                }
            }
        }
        
        // Tampilkan tombol copy dan download setelah output berhasil dibuat
        document.getElementById('btnCopy').style.display = 'block';
        document.getElementById('btnDownload').style.display = 'block';
        
   } catch (e) {
        // Security: Generic error message to prevent Padding Oracle Attack
        outputArea.innerText = "ERROR: Ciphertext atau kunci rahasia salah.";
        
        // Debug log untuk developer saja
        console.error("System Log (Developer Only):", e.message);
        
        // [HIGH BUG 6 FIX]: Explicitly reset loading state di catch block
        isProcessing = false;
        processBtn.disabled = false;
        let btnText = processBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.innerText = action === 'encrypt' ? 'EKSEKUSI ENKRIPSI' : 'EKSEKUSI DEKRIPSI';
        }
        processBtn.classList.remove('loading');
        if (operationTimeout) {
            clearTimeout(operationTimeout);
            operationTimeout = null;
        }
        
        lastOutputType = null;
        document.getElementById('btnCopy').style.display = 'none';
        document.getElementById('btnDownload').style.display = 'none';
        } finally {
            /* K2: Always restore button state & clear processing flag */
            isProcessing = false;
            processBtn.disabled = false;
            let btnText = processBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.innerText = action === 'encrypt' ? 'EKSEKUSI ENKRIPSI' : 'EKSEKUSI DEKRIPSI';
            }
            processBtn.classList.remove('loading');
            
            /* M3: Cleanup timeout */
            if (operationTimeout) {
                clearTimeout(operationTimeout);
                operationTimeout = null;
            }
            
            // M7: Hide copy notification jika proses selesai dengan error
            let notification = document.getElementById('copyNotification');
            if (notification && notification.style.display === 'block') {
                notification.style.display = 'none';
            }
        }
    }, 50); // ✅ 50ms delay untuk browser bisa paint animasi loading sebelum CPU freeze
}

function copyOutput() {
    if (!lastOutputType) {
        alert("Tidak ada output untuk dicopy!");
        return;
    }

    let outputArea = document.getElementById('outputArea');
    let textToCopy = "";
    
    if (lastOutputType === 'text' || lastOutputType === 'txt') {
        // Copy teks dari output area (ciphertext atau plaintext)
        textToCopy = outputArea.innerText;
        
        // Validasi text
        if (!textToCopy || textToCopy.includes("Hasil akan muncul") || textToCopy.includes("ERROR")) {
            alert("Tidak ada output valid untuk dicopy!");
            return;
        }
    } else if (lastOutputType === 'image') {
        // Copy base64 image dari image tag
        let outputImage = document.getElementById('outputImage');
        if (!outputImage.src || outputImage.style.display === 'none') {
            alert("Tidak ada gambar untuk dicopy!");
            return;
        }
        textToCopy = outputImage.src;
    }
    
    // Copy ke clipboard menggunakan modern API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(function() {
            showCopyNotification();
        }).catch(function(err) {
            // Fallback untuk browser lama
            if (fallbackCopyToClipboard(textToCopy)) {
                showCopyNotification();
            }
        });
    } else {
        // Fallback untuk browser yang tidak support Clipboard API
        if (fallbackCopyToClipboard(textToCopy)) {
            showCopyNotification();
        }
    }
}

// Tampilkan notifikasi inline copy success
// K4: Gunakan CSS custom property untuk duration (configurable, bukan hardcoded)
function showCopyNotification() {
    // M7: Only show notification jika tidak sedang processing
    if (isProcessing) {
        alert("Copy berhasil, tapi proses masih berjalan...");
        return;
    }
    
    let notification = document.getElementById('copyNotification');
    notification.style.display = 'block';
    
    // Baca duration dari CSS custom property
    let durationStr = getComputedStyle(document.documentElement)
        .getPropertyValue('--notification-duration').trim();
    let durationMs = parseInt(durationStr);
    
    // Fallback jika parsing gagal
    if (isNaN(durationMs)) durationMs = 2500;
    
    // Auto hide setelah durasi animation
    setTimeout(function() {
        if (notification.style.display === 'block') {
            notification.style.display = 'none';
        }
    }, durationMs);
}

// Fallback function untuk copy - return true jika berhasil
// K1: Ensure DOM cleanup dengan finally block
function fallbackCopyToClipboard(text) {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    textArea.setAttribute('aria-hidden', 'true');
    document.body.appendChild(textArea);
    
    try {
        textArea.select();
        let successful = document.execCommand('copy');
        if (!successful) {

            return false;
        }
        return true;
    } catch (err) {
        // Silently fail fallback copy
        return false;
    } finally {
        // K1: IMPORTANT - cleanup textarea dari DOM untuk prevent accumulation
        if (textArea && textArea.parentNode) {
            textArea.parentNode.removeChild(textArea);
        }
    }
}

function downloadOutput() {
    if (!lastOutputType) {
        return alert("Tidak ada output untuk diunduh!");
    }

    let outputArea = document.getElementById('outputArea');
    let outputImage = document.getElementById('outputImage');
    
    if (lastOutputType === 'text') {
        // Download output teks (ciphertext atau plaintext)
        let text = outputArea.innerText;
        if (!text || text.includes("Hasil akan muncul") || text.includes("ERROR")) {
            return alert("Tidak ada output valid untuk diunduh!");
        }
        
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        // M1: Sanitize filename
        let filename = sanitizeFilename('output_' + new Date().getTime() + '.txt');
        element.setAttribute('download', filename);
        // MIN4: Accessibility label
        element.setAttribute('aria-label', 'Download file teks hasil enkripsi/dekripsi');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        
    } else if (lastOutputType === 'image') {
        // Download output gambar (base64)
        if (!outputImage.src || outputImage.style.display === 'none') {
            return alert("Tidak ada gambar untuk diunduh!");
        }
        
        let link = document.createElement('a');
        link.href = outputImage.src;
        // Ekstrak format dari base64 (data:image/png atau data:image/jpeg)
        let format = outputImage.src.match(/data:image\/(.*?);/);
        let fileFormat = format ? format[1] : 'png';
        // M1: Sanitize filename
        let imageName = sanitizeFilename('output_image_' + new Date().getTime() + '.' + fileFormat);
        link.download = imageName;
        // MIN4: Add accessibility label
        link.setAttribute('aria-label', 'Download gambar hasil dekripsi (' + fileFormat + ')');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } else if (lastOutputType === 'txt') {
        // Download output file teks (plaintext dari dekripsi file txt)
        let text = outputArea.innerText;
        if (!text || text.includes("Hasil akan muncul") || text.includes("ERROR")) {
            return alert("Tidak ada output valid untuk diunduh!");
        }
        
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        // M1: Sanitize filename
        let txtFilename = sanitizeFilename('decrypt_' + new Date().getTime() + '.txt');
        element.setAttribute('download', txtFilename);
        // MIN4: Accessibility label
        element.setAttribute('aria-label', 'Download file teks hasil dekripsi');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
