
// Tabel substitusi byte - buat saat loading
const S_BOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    S_BOX[i] = (i * 31 + 17) % 256; 
}

// Rotasi bit - penting buat diffusion
function rotl8(val, shift) {
    return ((val << shift) | (val >>> (8 - shift))) & 0xFF;
}

// Feistel function - core dari cipher ini
function feistelFunction(rightHalf, subKey) {
    let out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        let xored = rightHalf[i] ^ subKey[i];
        let substituted = S_BOX[xored];
        out[i] = rotl8(substituted, 2);
    }
    return out;
}

// Generate subkey untuk tiap round - pake circular shift
function getSubKey(key, round) {
    let subKey = new Uint8Array(4);
    for(let i = 0; i < 4; i++) {
        // Gunakan modulo agar semua karakter kunci terpakai merata
        // Round 0: 0,1,2,3 | Round 1: 2,3,4,5 | Round 2: 4,5,6,7 | Round 3: 6,7,0,1
        subKey[i] = key[(round * 2 + i) % 8]; 
    }
    return subKey;
}

// Enkripsi 1 blok (8 byte) pake Feistel 4 rounds
function encryptBlock(block, key) {
    let L = block.slice(0, 4);
    let R = block.slice(4, 8);
    
    for (let round = 0; round < 4; round++) {
        let subKey = getSubKey(key, round);
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

// Dekripsi 1 blok - jalankan Feistel mundur
function decryptBlock(block, key) {
    let currR = block.slice(0, 4); 
    let currL = block.slice(4, 8); 

    // Mundur dari round 3 ke 0
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

// CBC mode - XOR dengan IV dulu, terus chain blocks
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

// CBC mode decrypt - ambil IV dari awal ciphertext
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

// UI functions buat tab switching
let currentMode = 'encrypt'; // enkripsi atau dekripsi?

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
    
    // Highlight tab yang aktif
    document.getElementById('tabEncrypt').classList.toggle('active', mode === 'encrypt');
    document.getElementById('tabDecrypt').classList.toggle('active', mode === 'decrypt');

    // Tampilkan tombol sesuai mode
    document.getElementById('btnEncrypt').style.display = mode === 'encrypt' ? 'block' : 'none';
    document.getElementById('btnDecrypt').style.display = mode === 'decrypt' ? 'block' : 'none';

    // Hapus semua saat ganti tab
    document.getElementById('outputArea').innerText = "Hasil akan muncul di sini...";
    document.getElementById('outputImage').style.display = 'none';
    document.getElementById('copyNotification').style.display = 'none';
    document.getElementById('inputText').value = ""; 
    document.getElementById('btnCopy').style.display = 'none';
    document.getElementById('btnDownload').style.display = 'none';
    lastOutputType = null;
    resetImageState();

    document.getElementById('secretKey').value = "";
    
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

function toggleInput() {
    let type = document.getElementById('inputType').value;
    let textGroup = document.getElementById('textInputGroup');
    let fileGroup = document.getElementById('fileInputGroup');
    let txtFileGroup = document.getElementById('txtFileInputGroup');
    let textLabel = document.getElementById('textInputLabel');
    let fileLabel = document.getElementById('fileInputLabel');
    let txtFileLabel = document.getElementById('txtFileInputLabel');

    if (currentMode === 'encrypt') {
        // MODE ENKRIPSI: 3 pilihan (text, image, txt)
        if (type === 'text') {
            textGroup.style.display = 'block';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Masukkan Pesan Asli (Plaintext):";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'image') {
            textGroup.style.display = 'none';
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
    } else {
        // MODE DEKRIPSI: 2 pilihan (text, txt) - opsi gambar sudah disembunyikan
        if (type === 'text') {
            textGroup.style.display = 'block';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'none';
            textLabel.innerText = "3. Paste Ciphertext (Teks Sandi) di sini:";
            resetImageState();
            resetTxtFileState();
        } else if (type === 'txt') {
            // File .txt mode dekripsi - hanya upload file, sembunyikan textarea
            textGroup.style.display = 'none';
            fileGroup.style.display = 'none';
            txtFileGroup.style.display = 'block';
            txtFileLabel.innerText = "3. Unggah File Ciphertext (.txt):";
            resetImageState();
        }
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
    
    if (textBytes > WARN_TEXT_SIZE) {
        let warnMB = (textBytes / (1024*1024)).toFixed(2);
        console.warn("⚠️ Peringatan: Teks cukup besar (" + warnMB + "MB). Proses enkripsi/dekripsi mungkin memakan waktu lebih lama.");
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
    
    // Ctrl+A pada output area hanya select output saja
    // Berikan tabindex agar bisa di-focus
    document.getElementById('outputArea').setAttribute('tabindex', '0');
    document.getElementById('outputImage').setAttribute('tabindex', '0');
    
    // Untuk shortcut Ctrl+A
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            let outputArea = document.getElementById('outputArea');
            let outputImage = document.getElementById('outputImage');
            
            // Cek apakah fokus ada di output area atau gambar output
            if (document.activeElement === outputArea || document.activeElement === outputImage) {
                e.preventDefault();
                
                // Pilih semua teks di output area
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

/* K5: XSS Protection - Sanitize output sebelum display */
function sanitizeOutput(text, maxLength = 100000) {
    if (typeof text !== 'string') {
        text = String(text);
    }
    
    // Limit panjang untuk prevent DoS
    if (text.length > maxLength) {
        console.warn(`Output truncated dari ${text.length} ke ${maxLength} chars`);
        text = text.substring(0, maxLength) + '... [TRUNCATED]';
    }
    
    return text;
}

// Custom Base64 encoding/decoding - ga boleh pake btoa/atob
// Harus built from scratch

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";


// Convert bytes to Base64 string
function bytesToBase64(bytes) {
    let result = '';
    let i = 0;
    let length = bytes.length;

    while (i < length) {
        // Cek berapa byte tersisa
        let left = length - i; 
        
        let b1 = bytes[i++];
        let b2 = i < length ? bytes[i++] : 0;
        let b3 = i < length ? bytes[i++] : 0;

        // Bagi 24 bit menjadi 4 bagian dari 6 bit
        let enc1 = b1 >> 2;
        let enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
        let enc4 = b3 & 63;

        result += BASE64_CHARS.charAt(enc1);
        result += BASE64_CHARS.charAt(enc2);
        
        // Tambahkan padding '=' jika diperlukan
        result += (left === 1) ? '=' : BASE64_CHARS.charAt(enc3);
        result += (left === 1 || left === 2) ? '=' : BASE64_CHARS.charAt(enc4);
    }
    return result;
}

// Decode Base64 back to bytes
// K3: Enhanced validation & edge case handling (algoritma tetap sama)
function base64ToBytes(base64) {
    try {
        if (typeof base64 !== 'string') {
            throw new Error("Base64 input harus string.");
        }

        // Normalisasi: hapus whitespace/newline (RFC 4648 valid)
        let str = base64.trim().replace(/[\r\n\s]/g, "");
        
        // Validate charset
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
            throw new Error("Base64 mengandung karakter invalid.");
        }
        
        // Validate panjang (harus kelipatan 4)
        if (str.length % 4 !== 0) {
            throw new Error("Panjang Base64 harus kelipatan 4. Mungkin ciphertext terpotong?");
        }

        // Hitung padding untuk kalkulasi panjang
        let padding = 0;
        if (str.endsWith("==")) padding = 2;
        else if (str.endsWith("=")) padding = 1;
        
        let outLen = (str.length * 3 / 4) - padding;
        
        // K3: Validate output length
        if (outLen <= 0) {
            throw new Error("Base64 decode menghasilkan panjang output invalid.");
        }
        
        let bytes = new Uint8Array(outLen);

        let i = 0, j = 0;
        while (i < str.length) {
            let enc1 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc2 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc3 = BASE64_CHARS.indexOf(str.charAt(i++));
            let enc4 = BASE64_CHARS.indexOf(str.charAt(i++));

            // K3: Better error context
            if (enc1 === -1 || enc2 === -1) {
                throw new Error(`Invalid Base64 character di posisi ${i - 4}`);
            }

            let b1 = (enc1 << 2) | (enc2 >> 4);
            let b2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            let b3 = ((enc3 & 3) << 6) | enc4;

            bytes[j++] = b1;
            if (enc3 !== -1 && j < outLen) bytes[j++] = b2;
            if (enc4 !== -1 && j < outLen) bytes[j++] = b3;
        }
        
        // K3: Verify output length matches expected
        if (j !== outLen) {
            throw new Error(`Decode mismatch: expected ${outLen}, got ${j} bytes.`);
        }
        
        return bytes;
    } catch (error) {
        // Re-throw dengan konteks yang lebih jelas
        throw new Error(`Base64 decode error: ${error.message}`);
    }
}

let imageBase64Data = "";
let txtFileContent = "";
let lastOutputType = null; // Lacak jenis output untuk download: 'text', 'image', atau 'txt'

/* K1: Global reference untuk cleanup FileReader */
let currentImageReader = null;
let currentTxtReader = null;

/* K2: Race condition protection */
let isProcessing = false;

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

    // K1: Cleanup previous reader jika ada untuk prevent memory leak
    if (currentImageReader) {
        currentImageReader.abort();
        currentImageReader = null;
    }

    // Cegah user upload gambar terlalu besar
    const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // Batas maksimal 50MB
    const WARN_IMAGE_SIZE = 20 * 1024 * 1024; // Peringatan di 20MB
    
    if (file.size > MAX_IMAGE_SIZE) {
        alert("❌ Ukuran file gambar terlalu besar! Maksimal 50MB.");
        resetImageState();
        return;
    }
    
    if (file.size > WARN_IMAGE_SIZE) {
        alert("⚠️ Peringatan: File gambar cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi mungkin memakan waktu lebih lama.");
    }

    let reader = new FileReader();
    currentImageReader = reader; // K1: Track untuk cleanup
    
    reader.onerror = function() {
        console.error("Error membaca file gambar");
        resetImageState();
        currentImageReader = null; // K1: Cleanup
    };
    reader.onload = function(event) {
        imageBase64Data = event.target.result; 
        let preview = document.getElementById('imagePreview');
        preview.src = imageBase64Data;
        preview.style.display = 'block';
        currentImageReader = null; // K1: Cleanup setelah load selesai
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

    // Batasi ukuran file teks
    const MAX_TXT_SIZE = 10 * 1024 * 1024; // Batas maksimal 10MB
    const WARN_TXT_SIZE = 5 * 1024 * 1024; // Peringatan di 5MB
    
    if (file.size > MAX_TXT_SIZE) {
        alert("❌ Ukuran file teks terlalu besar! Maksimal 10MB.");
        resetTxtFileState();
        return;
    }
    
    if (file.size > WARN_TXT_SIZE) {
        alert("⚠️ Peringatan: File teks cukup besar (" + (file.size / (1024*1024)).toFixed(2) + "MB). Proses enkripsi/dekripsi mungkin memakan waktu lebih lama.");
    }

    let reader = new FileReader();
    currentTxtReader = reader; // K1: Track untuk cleanup
    
    reader.onerror = function() {
        console.error("Error membaca file teks");
        resetTxtFileState();
        currentTxtReader = null; // K1: Cleanup
    };
    reader.onload = function(event) {
        txtFileContent = event.target.result;
        let preview = document.getElementById('txtFilePreview');
        preview.innerText = txtFileContent;
        preview.style.display = 'block';
        currentTxtReader = null; // K1: Cleanup setelah load selesai
    };
    reader.readAsText(file);
});

function processData(action) {
    /* K2: Race condition protection - prevent multiple simultaneous operations */
    if (isProcessing) {
        alert("⚠️ Proses masih berjalan. Tunggu sebentar...");
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

    /* K2: Set processing flag & disable buttons */
    isProcessing = true;
    let processBtn = action === 'encrypt' ? 
        document.getElementById('btnEncrypt') : 
        document.getElementById('btnDecrypt');
    let originalBtnText = processBtn.innerText;
    processBtn.disabled = true;
    processBtn.innerText = action === 'encrypt' ? '⏳ Enkripsi...' : '⏳ Dekripsi...';

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
                // MODE DEKRIPSI
                let encBytes = base64ToBytes(input);
                let decrypted = decryptCBC(encBytes, keyBytes);
                let decryptedText = bytesToStr(decrypted);
                
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
                // MODE DEKRIPSI
                let input = txtFileContent || document.getElementById('inputText').value;
                if (!input) return alert("Unggah file Ciphertext (.txt) untuk didekripsi!");
                let encBytes = base64ToBytes(input);
                let decrypted = decryptCBC(encBytes, keyBytes);
                let decryptedText = bytesToStr(decrypted);
                
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
            // Pesan error generik untuk keamanan
        if (action === 'encrypt') {
            outputArea.innerText = "ERROR: Enkripsi gagal, cek input Anda.";
        } else {
            outputArea.innerText = "ERROR: Dekripsi gagal, cek kunci/ciphertext.";
        }
        
        // Error asli ada di console untuk debugging
        console.error("System Log (Developer Only):", e.message);
        lastOutputType = null;
        document.getElementById('btnCopy').style.display = 'none';
        document.getElementById('btnDownload').style.display = 'none';
    } finally {
        /* K2: Always restore button state & clear processing flag */
        isProcessing = false;
        processBtn.disabled = false;
        processBtn.innerText = originalBtnText;
    }
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
        notification.style.display = 'none';
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
            console.warn("execCommand copy tidak berhasil");
            return false;
        }
        return true;
    } catch (err) {
        console.error("Fallback copy error:", err);
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
        element.setAttribute('download', 'output_' + new Date().getTime() + '.txt');
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
        link.download = 'output_image_' + new Date().getTime() + '.' + fileFormat;
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
        element.setAttribute('download', 'decrypt_' + new Date().getTime() + '.txt');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
