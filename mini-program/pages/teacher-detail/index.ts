import { fetchPublicTeacher, type PublicTeacher } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';

type InstitutionSummary = { id: string; name: string; logoUrl?: string | null };
type ResumeHighlight = { label: string; text: string };

const RESUME_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: '毕业院校', keywords: ['毕业', '大学', '学院', '院校', '本科', '硕士', '博士', '专业'] },
  { label: '专业方向', keywords: ['擅长', '专注', '书法', '美术', '国画', '硬笔', '软笔', '创作'] },
  {
    label: '教学经验',
    keywords: ['教学经验', '培训经验', '授课', '任教', '教学', '年从事', '年少儿'],
  },
  { label: '荣誉奖项', keywords: ['获奖', '奖', '优秀', '荣誉', '大赛', '展览', '收藏'] },
];

function collectResumeLines(blocks: Block[]): string[] {
  const lines: string[] = [];

  function pushText(value?: string) {
    if (!value) return;
    value
      .replace(/[。；]/g, (match) => `${match}\n`)
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*、\d.]+/, '').trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  }

  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      pushText(block.text);
      return;
    }
    if (block.type === 'list' || block.type === 'stats' || block.type === 'testimonials') {
      block.items.forEach(pushText);
      return;
    }
    if (block.type === 'imageText') {
      pushText(block.title);
      pushText(block.text);
      return;
    }
    if (block.type === 'faq') {
      block.items.forEach((item) => {
        pushText(item.q);
        pushText(item.a);
      });
    }
  });

  return Array.from(new Set(lines)).slice(0, 40);
}

function extractResumeHighlights(blocks: Block[]): ResumeHighlight[] {
  const lines = collectResumeLines(blocks);
  const used = new Set<string>();

  return RESUME_RULES.flatMap((rule) => {
    const line = lines.find(
      (item) => !used.has(item) && rule.keywords.some((keyword) => item.includes(keyword)),
    );
    if (!line) return [];
    used.add(line);
    return [{ label: rule.label, text: line }];
  });
}

Page({
  data: {
    loading: true,
    notFound: false,
    teacher: null as PublicTeacher | null,
    institution: null as InstitutionSummary | null,
    bioBlocks: [] as Block[],
    resumeHighlights: [] as ResumeHighlight[],
  },

  onLoad(options: { id?: string }) {
    this.load(options.id || '');
  },

  async load(id: string) {
    if (!id) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false });
    try {
      const detail = await fetchPublicTeacher(id);
      const bioBlocks = parseBlocks(detail.teacher.bio);
      wx.setNavigationBarTitle({ title: detail.teacher.name });
      this.setData({
        loading: false,
        teacher: detail.teacher,
        institution: detail.institution,
        bioBlocks,
        resumeHighlights: extractResumeHighlights(bioBlocks),
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goTeachers() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({ url: '/pages/teachers/index' });
      },
    });
  },

  previewQr() {
    const teacher = this.data.teacher as PublicTeacher | null;
    if (teacher?.wechatQrUrl) {
      wx.previewImage({ urls: [teacher.wechatQrUrl] });
    }
  },
});
