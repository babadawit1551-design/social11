import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

export interface EncryptedValue {
  iv: string;         // hex
  ciphertext: string; // hex
  authTag: string;    // hex
}

/**
 * Encrypts plaintext using AES-256-GCM with a unique random IV per call.
 * Returns { iv, ciphertext, authTag } all as hex strings.
 * Requirements: 1.2, 11.2
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedValue {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts an EncryptedValue produced by encrypt().
 * Requirements: 1.2, 11.2
 */
export function decrypt(encrypted: EncryptedValue, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
