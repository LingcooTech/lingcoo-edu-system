declare const wx: {
  request<T = unknown>(options: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    data?: unknown;
    header?: Record<string, string>;
    success?: (result: { statusCode: number; data: T }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  getStorageSync<T = unknown>(key: string): T;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  navigateTo(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  redirectTo(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  switchTab(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  setNavigationBarTitle(options: { title: string }): void;
  showToast(options: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void;
  showModal(options: {
    title: string;
    content: string;
    showCancel?: boolean;
    confirmText?: string;
    success?: (result: { confirm: boolean; cancel: boolean }) => void;
  }): void;
  setClipboardData(options: { data: string; success?: () => void }): void;
  login(options: { success?: (result: { code: string }) => void; fail?: (error: { errMsg: string }) => void }): void;
  requestPayment(options: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
    success?: () => void;
    fail?: (error: { errMsg: string }) => void;
    complete?: () => void;
  }): void;
  requestSubscribeMessage?: (options: {
    tmplIds: string[];
    success?: (result: Record<string, string>) => void;
    fail?: (error: { errMsg: string }) => void;
    complete?: () => void;
  }) => void;
};

declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare function Component(options: Record<string, unknown>): void;

interface IAppOption {
  globalData: {
    apiBaseUrl: string;
  };
}
