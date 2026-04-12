/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64-encoded string in the format "iv:authTag:ciphertext".
 */
export declare function encrypt(text: string, key: string): string;
/**
 * Decrypts a string produced by encrypt().
 * Expects "iv:authTag:ciphertext" base64-encoded format.
 */
export declare function decrypt(encrypted: string, key: string): string;
