import crypto from 'node:crypto';

/**
 * Verifies the X-Hub-Signature-256 header sent by GitHub webhooks.
 * Computes HMAC-SHA256 of the raw request payload buffer using the secret,
 * and performs a constant-time comparison via crypto.timingSafeEqual.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : rawBody;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(bodyBuffer);
  const calculatedHex = hmac.digest('hex');
  const expectedHex = signatureHeader.slice(expectedPrefix.length);

  if (calculatedHex.length !== expectedHex.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHex, 'utf-8'),
    Buffer.from(expectedHex, 'utf-8')
  );
}

