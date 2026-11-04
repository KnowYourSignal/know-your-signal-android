import { ApiError } from './handler.ts';
import type { BatchResult, Dependencies } from './handler.ts';

/** The caller JWT is used throughout; no privileged service-role client. */
export function createDependencies(
  url: string,
  key: string,
  request = fetch
): Dependencies {
  const endpoint = url.replace(/\/$/, '');
  if (!endpoint || !key) throw new Error('Missing Supabase configuration');
  const headers = (token: string) => ({
    apikey: key,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
  async function call(path: string, token: string, body?: unknown) {
    let res: Response;
    try {
      res = await request(`${endpoint}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', true);
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new ApiError(503, 'INVALID_BACKEND_RESPONSE', true);
    }
    if (!res.ok) {
      if (res.status === 401) throw new ApiError(401, 'UNAUTHORIZED');
      if (res.status === 429) throw new ApiError(429, 'RATE_LIMITED', true);
      if (res.status === 403 && data?.message === 'CONSENT_REQUIRED')
        throw new ApiError(403, 'CONSENT_REQUIRED');
      if (res.status === 413) throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
      if (
        res.status === 400 &&
        ['INVALID_ENVELOPE', 'UNSUPPORTED_SCHEMA', 'INVALID_BATCH'].includes(
          data?.message
        )
      )
        throw new ApiError(400, data.message);
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', true);
    }
    return data;
  }
  return {
    async authenticate(token) {
      const user = await call('/auth/v1/user', token);
      if (typeof user?.id !== 'string') throw new ApiError(401, 'UNAUTHORIZED');
    },
    async ingest(token, payload) {
      const result = await call('/rest/v1/rpc/ingest_measurements', token, {
        p_payload: payload,
      });
      if (
        !result ||
        !['aceptadas', 'duplicadas', 'rechazadas'].every((k) =>
          Array.isArray(result[k])
        )
      )
        throw new ApiError(503, 'INVALID_BACKEND_RESPONSE', true);
      return result as BatchResult;
    },
  };
}
