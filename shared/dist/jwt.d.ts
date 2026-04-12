export interface AccessTokenPayload {
    sub: string;
    role: string;
    type: 'access';
}
export interface RefreshTokenPayload {
    sub: string;
    type: 'refresh';
}
export declare function createAccessToken(userId: string, role: string, secretKey: string, expiresInMinutes?: number): string;
export declare function createRefreshToken(userId: string, secretKey: string, expiresInDays?: number): string;
export declare function verifyAccessToken(token: string, secretKey: string): AccessTokenPayload;
export declare function verifyRefreshToken(token: string, secretKey: string): RefreshTokenPayload;
//# sourceMappingURL=jwt.d.ts.map