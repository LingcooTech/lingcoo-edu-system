import type { AppEnv } from '../../../lib/env.js';

export type PaymentProviderCode = 'wechat_pay' | 'alipay' | 'mock';
export type LivePaymentProviderCode = Exclude<PaymentProviderCode, 'mock'>;

/**
 * A payment intent describes how the client should complete payment for an
 * order: render a QR (`native_qr`), open a redirect (`page_redirect`), or — in
 * development — call the mock-pay endpoint (`mock_mini_program`).
 */
export interface PaymentIntent {
  orderNo: string;
  provider: PaymentProviderCode;
  amount: number;
  currency: string;
  mode: 'native_qr' | 'page_redirect' | 'mock_mini_program' | 'mini_program_jsapi';
  status: 'pending_payment' | 'paid';
  configured: boolean;
  integrationStatus: 'live' | 'mock' | 'not_configured';
  notifyUrl?: string;
  nextAction: 'render_qr' | 'redirect' | 'mock_pay' | 'request_payment' | 'none';
  nextStep: string;
  payload: Record<string, unknown>;
}

export type ProviderOrderContext = {
  orderNo: string;
  subject: string;
  amount: number;
  currency: string;
};

export type ProviderContext = {
  env: AppEnv;
  clientIp?: string;
  order: ProviderOrderContext;
};

export type MiniProgramPaymentContext = ProviderContext & {
  openid: string;
};

export type ProviderNotificationContext = {
  env: AppEnv;
  headers: Record<string, unknown>;
  rawBody?: string | Buffer;
  body: unknown;
};

export type ProviderQueryContext = {
  env: AppEnv;
  order: ProviderOrderContext & {
    providerOrderId?: string | null;
  };
};

export type PaymentNotificationResult =
  | {
      kind: 'paid';
      provider: LivePaymentProviderCode;
      providerEventId: string;
      orderNo: string;
      providerOrderId: string;
      amount: number;
      currency: 'CNY';
      paidAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'ignored';
      provider: LivePaymentProviderCode;
      providerEventId: string;
      payload: Record<string, unknown>;
      reason: string;
    };

export type PaymentQueryResult =
  | {
      kind: 'paid';
      provider: LivePaymentProviderCode;
      orderNo: string;
      providerOrderId: string;
      amount: number;
      currency: 'CNY';
      paidAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'pending' | 'closed' | 'not_found';
      provider: LivePaymentProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      payload: Record<string, unknown>;
      reason: string;
    };

export interface PaymentProviderAdapter {
  code: LivePaymentProviderCode;
  label: string;
  isConfigured(env?: AppEnv): boolean;
  getOverview(env: AppEnv): {
    values: Record<string, string | boolean>;
    secrets: Record<string, { configured: boolean }>;
    notifyUrl?: string;
  };
  preparePayment(context: ProviderContext): Promise<PaymentIntent>;
  prepareMiniProgramPayment?(context: MiniProgramPaymentContext): Promise<PaymentIntent>;
  parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult>;
  queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult>;
}
