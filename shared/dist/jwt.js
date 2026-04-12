"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAccessToken = createAccessToken;
exports.createRefreshToken = createRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function createAccessToken(userId, role, secretKey, expiresInMinutes = 15) {
    return jsonwebtoken_1.default.sign({ sub: userId, role, type: 'access' }, secretKey, { expiresIn: expiresInMinutes * 60 });
}
function createRefreshToken(userId, secretKey, expiresInDays = 7) {
    return jsonwebtoken_1.default.sign({ sub: userId, type: 'refresh' }, secretKey, { expiresIn: expiresInDays * 24 * 60 * 60 });
}
function verifyAccessToken(token, secretKey) {
    const payload = jsonwebtoken_1.default.verify(token, secretKey);
    if (payload.type !== 'access')
        throw new Error('Invalid token type');
    return payload;
}
function verifyRefreshToken(token, secretKey) {
    const payload = jsonwebtoken_1.default.verify(token, secretKey);
    if (payload.type !== 'refresh')
        throw new Error('Invalid token type');
    return payload;
}
//# sourceMappingURL=jwt.js.map