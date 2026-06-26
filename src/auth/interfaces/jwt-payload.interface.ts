export interface JwtPayload {
  sub: number;       // user id
  username: string;
  role: string;
  tenantId: number;  // owning tenant — every request is scoped to this tenant
}
