import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.asymmetric import rsa, padding as asym_padding
from cryptography.hazmat.primitives import hashes, padding as sym_padding
from cryptography.hazmat.backends import default_backend

def generate_rsa_keys():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
    public_key = private_key.public_key()
    return private_key, public_key

def rsa_encrypt(public_key, data):
    return public_key.encrypt(data, asym_padding.OAEP(mgf=asym_padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

def rsa_decrypt(private_key, encrypted_data):
    return private_key.decrypt(encrypted_data, asym_padding.OAEP(mgf=asym_padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

def pad_data(data):
    padder = sym_padding.PKCS7(128).padder()
    return padder.update(data) + padder.finalize()

def unpad_data(data):
    unpadder = sym_padding.PKCS7(128).unpadder()
    return unpadder.update(data) + unpadder.finalize()

def aes_encrypt(key, data, mode_type='CBC'):
    data = pad_data(data)
    if mode_type == 'CBC':
        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        return iv + encryptor.update(data) + encryptor.finalize()
    else:
        cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
        encryptor = cipher.encryptor()
        return encryptor.update(data) + encryptor.finalize()

def aes_decrypt(key, encrypted_data, mode_type='CBC'):
    if mode_type == 'CBC':
        iv = encrypted_data[:16]
        actual_data = encrypted_data[16:]
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted_padded = decryptor.update(actual_data) + decryptor.finalize()
    else:
        cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()
    return unpad_data(decrypted_padded)

def main():
    private_key, public_key = generate_rsa_keys()
    aes_key = os.urandom(32)

    while True:
        print("\n=== APLIKASI KRIPTOGRAFI ===")
        print("1. Simulasi AES (ECB vs CBC)")
        print("2. Simulasi Kriptografi Hibrida (AES + RSA)")
        print("3. Keluar")
        pilihan = input("Pilih menu (1/2/3): ")

        if pilihan == '1':
            pesan = input("Masukkan pesan: ").encode()
            print("\n--- Mode ECB ---")
            enc_ecb = aes_encrypt(aes_key, pesan, 'ECB')
            print(f"Ciphertext (Base64): {base64.b64encode(enc_ecb).decode()}")
            dec_ecb = aes_decrypt(aes_key, enc_ecb, 'ECB')
            print(f"Decrypted: {dec_ecb.decode()}")

            print("\n--- Mode CBC ---")
            enc_cbc = aes_encrypt(aes_key, pesan, 'CBC')
            print(f"Ciphertext (Base64): {base64.b64encode(enc_cbc).decode()}")
            dec_cbc = aes_decrypt(aes_key, enc_cbc, 'CBC')
            print(f"Decrypted: {dec_cbc.decode()}")

        elif pilihan == '2':
            pesan = input("Masukkan pesan rahasia: ").encode()
            print("\n[ENKRIPSI HIBRIDA]")
            enc_pesan = aes_encrypt(aes_key, pesan, 'CBC')
            enc_aes_key = rsa_encrypt(public_key, aes_key)
            print(f"1. Pesan dienkripsi dengan AES-CBC: {base64.b64encode(enc_pesan).decode()[:50]}...")
            print(f"2. Kunci AES dienkripsi dengan RSA: {base64.b64encode(enc_aes_key).decode()[:50]}...")

            print("\n[DEKRIPSI HIBRIDA]")
            dec_aes_key = rsa_decrypt(private_key, enc_aes_key)
            if dec_aes_key == aes_key:
                print("1. Kunci AES berhasil dipulihkan menggunakan RSA Private Key.")
            dec_pesan = aes_decrypt(dec_aes_key, enc_pesan, 'CBC')
            print(f"2. Pesan asli berhasil didekripsi: {dec_pesan.decode()}")

        elif pilihan == '3':
            print("Keluar dari aplikasi.")
            break
        else:
            print("Pilihan tidak valid.")

if __name__ == '__main__':
    main()