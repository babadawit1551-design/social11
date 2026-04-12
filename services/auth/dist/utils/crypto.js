"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64-encoded string in the format "iv:authTag:ciphertext".
 */
function encrypt(text, key) {
    // Derive a 32-byte key from the provided key string
    const keyBuffer = crypto_1.default.createHash('sha256').update(key).digest();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}
/**
 * Decrypts a string produced by encrypt().
 * Expects "iv:authTag:ciphertext" base64-encoded format.
 */
function decrypt(encrypted, key) {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
    }
    const [ivB64, authTagB64, ciphertextB64] = parts;
    const keyBuffer = crypto_1.default.createHash('sha256').update(key).digest();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
//# sourceMappingURL=crypto.js.map