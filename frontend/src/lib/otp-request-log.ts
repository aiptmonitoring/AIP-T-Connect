type OtpFlow =
  | 'register'
  | 'login'
  | 'forgot_password'
  | 'resend_signup'
  | 'resend_login'
  | 'resend_recovery';

type OtpAction = 'signUp' | 'signInWithOtp' | 'resetPasswordForEmail' | 'resend';

type OtpRequestMeta = {
  flow: OtpFlow;
  email: string;
  triggeredBy: string;
  action: OtpAction;
};

type OtpRequestResult = {
  response?: unknown;
  error?: unknown;
};

type OtpErrorLog = {
  message: string;
  status?: number;
  code?: string;
};

type OtpResponseLog = {
  hasData: boolean;
  hasSession: boolean;
  hasUser: boolean;
};

function sanitizeEmail(email: string) {
  const [name = '', domain = ''] = email.trim().toLowerCase().split('@');
  return { emailHint: name ? `${name.slice(0, 2)}***` : '', emailDomain: domain };
}

function makeRequestId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}`;
}

function sanitizeError(error: unknown): OtpErrorLog | null {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
  };

  const message = typeof candidate.message === 'string' ? candidate.message : 'Unknown error';
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const code = typeof candidate.code === 'string' ? candidate.code : undefined;

  return { message, status, code };
}

function sanitizeResponse(response: unknown): OtpResponseLog {
  if (!response || typeof response !== 'object') {
    return { hasData: false, hasSession: false, hasUser: false };
  }

  const candidate = response as {
    session?: unknown;
    user?: unknown;
  };

  return {
    hasData: true,
    hasSession: Boolean(candidate.session),
    hasUser: Boolean(candidate.user),
  };
}

export function beginOtpRequest(meta: OtpRequestMeta) {
  const requestId = makeRequestId();
  const startedAt = Date.now();
  const base = {
    requestId,
    flow: meta.flow,
    ...sanitizeEmail(meta.email),
    triggeredBy: meta.triggeredBy,
    action: meta.action,
  };

  console.info('[OTP][start]', {
    ...base,
    timestamp: new Date(startedAt).toISOString(),
  });

  return {
    requestId,
    finish(result: OtpRequestResult = {}) {
      const endedAt = Date.now();

      console.info('[OTP][end]', {
        ...base,
        timestamp: new Date(endedAt).toISOString(),
        durationMs: endedAt - startedAt,
        response: sanitizeResponse(result.response),
        error: sanitizeError(result.error),
      });
    },
  };
}
