import {
  fetchWechatMiniSubscribeTemplates,
  type SubscribeTemplateKey,
  type WechatMiniSubscribeTemplate,
} from './api';

let templateCache: WechatMiniSubscribeTemplate[] | null = null;

async function loadTemplates() {
  if (templateCache) {
    return templateCache;
  }
  try {
    templateCache = await fetchWechatMiniSubscribeTemplates();
  } catch {
    templateCache = [];
  }
  return templateCache;
}

export async function requestSubscribe(keys: SubscribeTemplateKey[]) {
  const requestSubscribeMessage = wx.requestSubscribeMessage;
  if (!keys.length || !requestSubscribeMessage) {
    return;
  }

  const templates = await loadTemplates();
  const keySet = new Set(keys);
  const tmplIds = templates
    .filter((template) => keySet.has(template.key))
    .map((template) => template.templateId);

  if (!tmplIds.length) {
    return;
  }

  await new Promise<void>((resolve) => {
    requestSubscribeMessage({
      tmplIds,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}
