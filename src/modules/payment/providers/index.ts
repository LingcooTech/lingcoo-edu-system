import { httpError } from '../../../lib/http-error.js';
import { AlipayProvider } from './alipay.js';
import type { LivePaymentProviderCode, PaymentProviderAdapter } from './types.js';
import { WechatPayProvider } from './wechat-pay.js';

const PROVIDERS: Record<LivePaymentProviderCode, PaymentProviderAdapter> = {
  wechat_pay: new WechatPayProvider(),
  alipay: new AlipayProvider()
};

export function listPaymentProviders(): PaymentProviderAdapter[] {
  return Object.values(PROVIDERS);
}

export function getPaymentProvider(code: LivePaymentProviderCode): PaymentProviderAdapter {
  const provider = PROVIDERS[code];
  if (!provider) {
    throw httpError(404, `Unknown payment provider: ${code}`);
  }

  return provider;
}
