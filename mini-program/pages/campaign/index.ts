import {
  fetchCampaignLanding,
  submitCampaignParticipation,
  type CampaignLandingPayload,
  type TrialSession,
} from '../../services/api';
import { requestSubscribe } from '../../services/subscribe';
import { formatDateTime } from '../../utils/format';
import { parseBlocks, type Block } from '../../utils/blocks';

interface CampaignState {
  loading: boolean;
  submitting: boolean;
  notFound: boolean;
  code: string;
  payload: CampaignLandingPayload | null;
  contentBlocks: Block[];
  trialSessions: Array<TrialSession & { startsAtLabel: string }>;
  trialSessionId: string;
}

const initialState: CampaignState = {
  loading: true,
  submitting: false,
  notFound: false,
  code: '',
  payload: null,
  contentBlocks: [],
  trialSessions: [],
  trialSessionId: '',
};

function decodeScene(scene?: string): Record<string, string> {
  if (!scene) return {};
  const decoded = decodeURIComponent(scene);
  return decoded.split('&').reduce<Record<string, string>>((acc, pair) => {
    const [key, value] = pair.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

Page({
  data: initialState,

  onLoad(options: { code?: string; scene?: string }) {
    const scene = decodeScene(options.scene);
    const code = options.code || scene.campaign || scene.code || '';
    this.load(code);
  },

  async load(code: string) {
    if (!code) {
      this.setData({ loading: false, notFound: true });
      return;
    }

    this.setData({ loading: true, notFound: false, code });
    try {
      const payload = await fetchCampaignLanding(code);
      wx.setNavigationBarTitle({ title: payload.campaign.name });
      const trialSessions = payload.trialSessions.map((session) => ({
        ...session,
        startsAtLabel: formatDateTime(session.startsAt),
      }));
      this.setData({
        loading: false,
        payload,
        contentBlocks: parseBlocks(payload.campaign.content),
        trialSessions,
        trialSessionId: trialSessions[0]?.id ?? '',
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  onTrialChange(event: { detail: { value: string } }) {
    this.setData({ trialSessionId: event.detail.value });
  },

  async onSubmit(event: {
    detail: {
      value: {
        guardianName?: string;
        phone?: string;
        studentName?: string;
        grade?: string;
      };
    };
  }) {
    if (!this.data.payload) return;
    const value = event.detail.value;
    const guardianName = (value.guardianName || '').trim();
    const phone = (value.phone || '').trim();
    const studentName = (value.studentName || '').trim();
    const grade = (value.grade || '').trim();

    if (!guardianName || !phone || !studentName || !grade) {
      wx.showToast({ title: '请补全报名信息', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const payload = this.data.payload;
      await requestSubscribe(['trial_registration']);
      await submitCampaignParticipation(payload.campaign.code, {
        guardianName,
        phone,
        studentName,
        grade,
        trialSessionId: this.data.trialSessionId || undefined,
        courseId: payload.course?.id,
        source: payload.channel?.code ?? 'campaign',
        medium: payload.campaign.medium,
      });
      wx.showModal({
        title: '提交成功',
        content: '老师会尽快联系确认试听时间。',
        showCancel: false,
        success() {
          wx.redirectTo({ url: '/pages/home/index' });
        },
      });
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
