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
  getSystemInfoSync(): {
    statusBarHeight?: number;
    windowWidth?: number;
    windowHeight?: number;
    safeArea?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
      width: number;
      height: number;
    };
  };
  getMenuButtonBoundingClientRect(): {
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  navigateTo(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  navigateBack(options?: {
    delta?: number;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  redirectTo(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  switchTab(options: { url: string; fail?: (error: { errMsg: string }) => void }): void;
  pageScrollTo(options: {
    scrollTop?: number;
    selector?: string;
    duration?: number;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  setTabBarBadge?: (options: {
    index: number;
    text: string;
    success?: () => void;
    fail?: (error: { errMsg: string }) => void;
  }) => void;
  removeTabBarBadge?: (options: {
    index: number;
    success?: () => void;
    fail?: (error: { errMsg: string }) => void;
  }) => void;
  setNavigationBarTitle(options: { title: string }): void;
  previewImage(options: { urls: string[]; current?: string; fail?: (error: { errMsg: string }) => void }): void;
  openLocation(options: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    scale?: number;
    fail?: (error: { errMsg: string }) => void;
  }): void;
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
  stopPullDownRefresh(options?: { complete?: () => void }): void;
  chooseMedia(options: {
    count?: number;
    mediaType?: ('image' | 'video')[];
    sourceType?: ('album' | 'camera')[];
    sizeType?: ('original' | 'compressed')[];
    success?: (result: {
      tempFiles: { tempFilePath: string; size: number; fileType?: string }[];
      type: string;
    }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    header?: Record<string, string>;
    formData?: Record<string, unknown>;
    success?: (result: { statusCode: number; data: string }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
  showLoading(options: { title: string; mask?: boolean }): void;
  hideLoading(options?: { complete?: () => void }): void;
};

declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare function Component(options: Record<string, unknown>): void;
declare function getCurrentPages(): Array<{ route: string }>;

interface IAppOption {
  globalData: {
    apiBaseUrl: string;
  };
}
