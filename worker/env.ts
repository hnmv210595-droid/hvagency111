export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  COMPANY_IP?: string;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS?: string;
  LOGIN_RATE_LIMIT?: string;
  LOGIN_RATE_WINDOW_MINUTES?: string;
  TIMEZONE?: string;
  CURRENCY?: string;
  /** Cloudflare secret — plaintext admin password (hashed into D1 on bootstrap). */
  ADMIN_PASSWORD?: string;
  /** Optional; defaults to Admin111 */
  ADMIN_USERNAME?: string;
}

export type Variables = {
  user: {
    id: string;
    username: string;
    email: string | null;
    role: 'ADMIN' | 'EMPLOYEE';
    status: 'ACTIVE' | 'DISABLED';
    employee_id: string | null;
  };
  clientIp: string;
  sessionId: string;
};
