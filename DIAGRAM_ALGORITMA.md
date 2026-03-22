# 📊 DIAGRAM ALUR ALGORITMA ENKRIPSI

## 1️⃣ FEISTEL NETWORK STRUCTURE

```
INPUT PLAINTEXT (8 byte)
│
├─ Split into:
│  ├─ L₀ (Left half, 4 byte)
│  └─ R₀ (Right half, 4 byte)
│
├─ ROUND 0:
│  ├─ SubKey₀ = getSubKey(key, 0) = [K₀, K₁, K₂, K₃]
│  ├─ F(R₀, SubKey₀) = feistelFunction()
│  ├─ L₁ = R₀
│  ├─ R₁ = L₀ ⊕ F(R₀, SubKey₀)
│
├─ ROUND 1:
│  ├─ SubKey₁ = [K₂, K₃, K₄, K₅]
│  ├─ L₂ = R₁
│  ├─ R₂ = L₁ ⊕ F(R₁, SubKey₁)
│
├─ ROUND 2:
│  ├─ SubKey₂ = [K₄, K₅, K₆, K₇]
│  ├─ L₃ = R₂
│  ├─ R₃ = L₂ ⊕ F(R₂, SubKey₂)
│
├─ ROUND 3:
│  ├─ SubKey₃ = [K₆, K₇, K₀, K₁]
│  ├─ L₄ = R₃
│  ├─ R₄ = L₃ ⊕ F(R₃, SubKey₃)
│
├─ SWAP: (R₄ || L₄)  [Note: R dulu, L belakang]
│
└─ OUTPUT CIPHERTEXT (8 byte)
```

---

## 2️⃣ FEISTEL FUNCTION DETAIL

```
F(R, SubKey):
│
├─ INPUT: R (4 byte), SubKey (4 byte)
│
├─ STEP 1: XOR dengan SubKey
│  └─ temp[i] = R[i] ⊕ SubKey[i]
│
├─ STEP 2: Substitusi via S-Box
│  └─ substituted[i] = S_BOX[temp[i]]
│     (Lookup tabel: S_BOX[0..255])
│
├─ STEP 3: Bit Rotation (Permutation)
│  └─ out[i] = rotl8(substituted[i], 2)
│     (Rotate left 2 bits)
│
└─ OUTPUT: out (4 byte)
```

**S-Box Generation:**
```javascript
for (let i = 0; i < 256; i++) {
    S_BOX[i] = (i * 31 + 17) % 256;
}
```

---

## 3️⃣ CBC MODE ENCRYPTION

```
PLAINTEXT BLOCKS
     │
     └─ Block 1          Block 2          Block 3
        │                 │                 │
        ├─ Padding check   ├─ Read block     ├─ Read block
        └─ Read block      │                 │
           │               │                 │
           ⊕ IV (Fixed)    ⊕ Prev C₁        ⊕ Prev C₂
           │               │                 │
        ┌──┴──┐          ┌──┴──┐          ┌──┴──┐
        │      │          │      │          │      │
        │ ENC  │          │ ENC  │          │ ENC  │
        │      │          │      │          │      │
        └──┬──┘          └──┬──┘          └──┬──┘
           │                │                 │
          C₁               C₂               C₃
           │                │                 │
           └────────────────────────────────────
                            │
                    CIPHERTEXT OUTPUT

Legend:
- ⊕ = XOR operation (CBC chaining)
- ENC = Feistel block encryption
- IV = Initialization Vector (fixed [21,55,99,12,87,43,10,255])
- Prev C = Previous ciphertext block (untuk chaining)
```

**Pseudocode:**
```
FOR each 8-byte plaintext block:
  1. XOR block dengan previous ciphertext (atau IV)
  2. Encrypt hasil XOR dengan Feistel
  3. Output ciphertext block
  4. Ciphertext block jadi input XOR untuk block berikutnya
```

---

## 4️⃣ CBC MODE DECRYPTION

```
CIPHERTEXT BLOCKS (dari enkripsi)
     │
     └─ C₁                C₂                C₃
        │                 │                 │
     ┌──┴──┐            ┌──┴──┐            ┌──┴──┐
     │      │            │      │            │      │
     │ DEC  │            │ DEC  │            │ DEC  │
     │      │            │      │            │      │
     └──┬──┘            └──┬──┘            └──┬──┘
        │                 │                 │
        ⊕ IV (Known)      ⊕ C₁ (Keep)      ⊕ C₂ (Keep)
        │                 │                 │
      P₁'               P₂'               P₃'
        │                 │                 │
        └────────────────────────────────────
                        │
                PLAINTEXT OUTPUT

Legend:
- DEC = Feistel block decryption
- ⊕ = XOR operation (reversing CBC)
- C₁, C₂, C₃ = Original ciphertext blocks (dipake XOR)
- P₁', P₂', P₃' = Decrypted plaintext blocks
```

**Pseudocode:**
```
FOR each 8-byte ciphertext block:
  1. Decrypt block dengan Feistel
  2. XOR hasil decrypt dengan previous ciphertext (atau IV)
  3. Output plaintext block
```

---

## 5️⃣ KEY SCHEDULING (Circular)

```
Master Key (8 byte):
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ K₀  │ K₁  │ K₂  │ K₃  │ K₄  │ K₅  │ K₆  │ K₇  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘

Usage di setiap Round:

Round 0:  ┌─────┬─────┬─────┬─────┐
          │ K₀  │ K₁  │ K₂  │ K₃  │  SubKey₀
          └─────┴─────┴─────┴─────┘

Round 1:        ┌─────┬─────┬─────┬─────┐
                │ K₂  │ K₃  │ K₄  │ K₅  │  SubKey₁
                └─────┴─────┴─────┴─────┘

Round 2:              ┌─────┬─────┬─────┬─────┐
                      │ K₄  │ K₅  │ K₆  │ K₇  │  SubKey₂
                      └─────┴─────┴─────┴─────┘

Round 3:                    ┌─────┬─────┬─────┬─────┐
                            │ K₆  │ K₇  │ K₀  │ K₁  │  SubKey₃ (WRAP!)
                            └─────┴─────┴─────┴─────┘

Formula:
subKey[i] = key[(round * 2 + i) % 8]

Contoh:
- Round 0: (0*2 + 0) % 8 = 0 → K₀
- Round 1: (1*2 + 0) % 8 = 2 → K₂
- Round 2: (2*2 + 0) % 8 = 4 → K₄
- Round 3: (3*2 + 0) % 8 = 6 → K₆
- Round 3: (3*2 + 1) % 8 = 7 → K₇
- Round 3: (3*2 + 2) % 8 = 0 → K₀ (WRAP AROUND!)
```

---

## 6️⃣ PADDING SCHEME (PKCS7)

```
Original Plaintext:
"Hello123" (8 byte) → Exact block size → No padding needed
Output: "Hello123" (as is)

Original Plaintext:
"Hello" (5 byte) → Need 3 more bytes to reach 8
Padding length: 8 - 5 = 3
Output: "Hello" + [3, 3, 3] = 8 byte block

Original Plaintext:
"HelloWorld" (10 byte) → 1 full block (8 byte) + 2 byte
Block 1: "HelloWor" (8 byte)
Block 2: "ld" (2 byte) → Need 6 more bytes
Padding length: 8 - 2 = 6
Output: "ld" + [6, 6, 6, 6, 6, 6] = 8 byte block

Decryption (Remove Padding):
1. Read last byte → Padding length
2. Verify jika < 1 atau > 8 → Error (wrong key!)
3. Remove last N bytes
4. Output plaintext
```

---

## 7️⃣ BASE64 ENCODING

```
INPUT: Raw bytes [0xAB, 0xCD, 0xEF]
│
├─ Convert to binary (3 byte = 24 bit):
│  10101011 11001101 11101111
│
├─ Split into 4 groups (6 bit each):
│  101010 | 111100 | 110111 | 101111
│    42       60       55       47
│
├─ Map ke BASE64_CHARS[]:
│  'q' (42) | '8' (60) | '3' (55) | 'v' (47)
│
└─ OUTPUT: "q83v"

PADDING (jika tidak kelipatan 3):
Input: 1 byte
├─ Binary: XXXXXXXX 00000000 00000000
├─ Groups: XXXXXX | XX0000 | 000000 | 000000
├─ XXXX0000 ada padding → INDEX 64
├─ 000000 ada padding → INDEX 64
└─ OUTPUT: "AB==" (2 chars + 2 padding)

Encoding Table:
A-Z (0-25) | a-z (26-51) | 0-9 (52-61) | + (62) | / (63) | = (padding)
```

---

## 8️⃣ APLIKASI UI FLOW

```
┌──────────────────────────────────
│     APLIKASI ENKRIPSI WEB
└──────────────────────────────────

┌─ INPUT SECTION
│  ├─ Secret Key (8 char max)
│  ├─ Mode Choice:
│  │  ├─ Text Mode
│  │  └─ Image Mode
│  └─ Input Data:
│     ├─ Textarea (Text/Ciphertext)
│     └─ File Input (Image)

┌─ BUTTON SECTION
│  ├─ 🔒 ENKRIPSI
│  │  ├─ Get plaintext from Input
│  │  ├─ Process with Feistel CBC
│  │  ├─ Convert to Base64
│  │  └─ Display ciphertext
│  │
│  └─ 🔓 DEKRIPSI
│     ├─ Get ciphertext from Input
│     ├─ Convert from Base64
│     ├─ Process with reverse Feistel
│     └─ Display plaintext / image

┌─ OUTPUT SECTION
│  ├─ Textarea (for text/ciphertext)
│  └─ Image Container (for images)
```

---

## 9️⃣ COMPLETE ENCRYPTION FLOW EXAMPLE

```
USER INPUT:
├─ Key: "KUNCI123"
├─ Plaintext: "HI" (2 byte)
└─ Mode: Text

PROCESS:
1. Padding PKCS7:
   "HI" (2 byte) + [6,6,6,6,6,6] → 8 byte block

2. Block 1 [0x48, 0x49, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06]:
   ├─ Split: L=[0x48, 0x49, 0x06, 0x06], R=[0x06, 0x06, 0x06, 0x06]
   ├─ Round 0-3: Feistel encryption
   └─ Output: C=[encrypted bytes]

3. CBC Mode:
   ├─ Block before encryption: XOR dengan IV
   ├─ After encryption: jadi C₁
   └─ Output: IV + C₁

4. Base64 Encoding:
   └─ IV + C₁ → Base64 string

OUTPUT:
Ciphertext: "rKp2M7xQ+Vc=" (example)

DECRYPTION (reverse):
Input: "rKp2M7xQ+Vc="
   ↓
Base64 decode → bytes
   ↓
Extract IV + ciphertext
   ↓
Reverse CBC + Feistel
   ↓
Remove padding
   ↓
Output: "HI" ✓
```

---

## 🔟 SECURITY COMPARISON

```
┌─────────────┬─────────────┬──────────────────┐
│ ECB MODE    │ CBC MODE    │ OUR IMPL         │
├─────────────┼─────────────┼──────────────────┤
│ Block 1     │ Block 1     │ Block 1          │
│ "HELLO123"  │ "HELLO123"  │ "HELLO123"       │
│ + SAME KEY  │ + SAME KEY  │ + SAME KEY       │
│ = C₁        │ = XOR IV    │ = XOR IV         │
│             │ = ENCRYPT   │ = ENCRYPT        │
│ Block 2     │ Block 2     │ Block 2          │
│ "HELLO123"  │ "HELLO123"  │ "HELLO123"       │
│ + SAME KEY  │ + SAME KEY  │ + SAME KEY       │
│ = C₂ (SAME! │ = XOR C₁    │ = XOR C₁         │
│  WEAK!)     │ = ENCRYPT   │ = ENCRYPT        │
│             │ = C₂        │ = C₂             │
│             │ (DIFFERENT!)│ (DIFFERENT!)     │
│             │ = SECURE ✓  │ = SECURE ✓       │
└─────────────┴─────────────┴──────────────────┘
```

---

**Summary:** Aplikasi menggunakan Feistel Network + CBC Mode dengan 10+ fungsi kriptografi. Semua custom implementation tanpa library eksternal. ✅
