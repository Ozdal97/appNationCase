import 'express';

export type ClientType = 'web' | 'mobile' | 'desktop' | 'unknown';

export interface AuthenticatedUser {
  id: string;
  email: string;
  tier: 'FREE' | 'STARTUP' | 'ENTERPRISE';
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      user?: AuthenticatedUser;
      clientType?: ClientType;
      appCheckVerified?: boolean;
    }
  }
}
