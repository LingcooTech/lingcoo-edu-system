import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Edit3, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';

import {
  createContent,
  deleteContent,
  importNotionContent,
  importWechatContent,
  importWordPressContent,
  listContent,
  updateContent,
  type ContentUpsertInput,
} from '@/api/client';
import type { ContentItem, ContentSourceType, ContentStatus } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { ResourceToolbar } from '@/components/shared/ResourceToolbar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;
const ALL = 'all';
const contentTabs = [
  { key: 'list', label: '内容列表' },
  { key: 'import', label: '导入内容' },
] as const;

interface ContentForm {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverUrl: string;
  authorName: string;
  status: ContentStatus;
  sourceType: ContentSourceType;
  sourceId: string;
  sourceUrl: string;
}

const EMPTY_FORM: ContentForm = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverUrl: '',
  authorName: '',
  status: 'draft',
  sourceType: 'manual',
  sourceId: '',
  sourceUrl: '',
};

function sourceLabel(sourceType: ContentSourceType) {
  switch (sourceType) {
    case 'wordpress':
      return 'WordPress';
    case 'notion':
      return 'Notion';
    case 'wechat':
      return '微信公众号';
    case 'manual':
    default:
      return '手动';
  }
}

function toForm(item: ContentItem): ContentForm {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt ?? '',
    content: item.content,
    coverUrl: item.coverUrl ?? '',
    authorName: item.authorName ?? '',
    status: item.status,
    sourceType: item.sourceType,
    sourceId: item.sourceId ?? '',
    sourceUrl: item.sourceUrl ?? '',
  };
}

function toPayload(form: ContentForm): ContentUpsertInput {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    excerpt: form.excerpt.trim(),
    content: form.content,
    coverUrl: form.coverUrl.trim(),
    authorName: form.authorName.trim(),
    status: form.status,
    sourceType: form.sourceType,
    sourceId: form.sourceId.trim(),
    sourceUrl: form.sourceUrl.trim(),
  };
}

export function ContentMarketingPage() {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | typeof ALL>(ALL);
  const [sourceFilter, setSourceFilter] = useState<ContentSourceType | typeof ALL>(ALL);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'import'>('list');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [wpForm, setWpForm] = useState({
    siteUrl: '',
    postUrl: '',
    username: '',
    appPassword: '',
    status: 'draft' as 'draft' | 'published',
  });
  const [notionForm, setNotionForm] = useState({
    apiToken: '',
    pageUrl: '',
    status: 'draft' as 'draft' | 'published',
  });
  const [wechatForm, setWechatForm] = useState({
    url: '',
    status: 'draft' as 'draft' | 'published',
  });
  const [importing, setImporting] = useState<ContentSourceType | ''>('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const draftCount = items.filter((item) => item.status === 'draft').length;
  const publishedCount = items.filter((item) => item.status === 'published').length;
  const importedCount = items.filter((item) => item.importedAt).length;

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listContent({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: search.trim() || undefined,
      status: statusFilter === ALL ? undefined : statusFilter,
      sourceType: sourceFilter === ALL ? undefined : sourceFilter,
    })
      .then((payload) => {
        if (!active) return;
        setItems(payload.items);
        setTotal(payload.total);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : '加载内容失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, search, sourceFilter, statusFilter, toast]);

  async function reload() {
    const payload = await listContent({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: search.trim() || undefined,
      status: statusFilter === ALL ? undefined : statusFilter,
      sourceType: sourceFilter === ALL ? undefined : sourceFilter,
    });
    setItems(payload.items);
    setTotal(payload.total);
  }

  function openEditor(item?: ContentItem) {
    setForm(item ? toForm(item) : EMPTY_FORM);
    setDrawerOpen(true);
  }

  function patchForm(patch: Partial<ContentForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submitContent() {
    if (!form.title.trim()) {
      toast.error('标题必填');
      return;
    }
    setSaving(true);
    try {
      const saved = form.id
        ? await updateContent(form.id, toPayload(form))
        : await createContent(toPayload(form));
      await reload();
      setForm(toForm(saved));
      setDrawerOpen(false);
      toast.success(form.id ? '内容已保存' : '内容已创建');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const item = await deleteContent(deleteTarget.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setTotal((current) => Math.max(0, current - 1));
      setDeleteTarget(null);
      toast.success('内容已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function runImport(sourceType: ContentSourceType) {
    setImporting(sourceType);
    try {
      const item =
        sourceType === 'wordpress'
          ? await importWordPressContent(wpForm)
          : sourceType === 'notion'
            ? await importNotionContent(notionForm)
            : await importWechatContent(wechatForm);
      await reload();
      toast.success(`已导入：${item.title}`);
      openEditor(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting('');
    }
  }

  const columns = useMemo<Column<ContentItem>[]>(
    () => [
      {
        key: 'title',
        header: '内容',
        className: 'min-w-[320px]',
        cell: (row) => (
          <div className="space-y-1">
            <div className="text-foreground text-sm font-semibold">{row.title}</div>
            <div className="text-muted-foreground font-mono text-[11px]">{row.slug}</div>
            {row.excerpt ? (
              <div className="text-muted-foreground line-clamp-2 text-xs leading-5">
                {row.excerpt}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'source',
        header: '来源',
        cell: (row) => (
          <div className="space-y-1">
            <StatusPill tone="info" label={sourceLabel(row.sourceType)} />
            {row.authorName ? (
              <div className="text-muted-foreground text-xs">{row.authorName}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: '状态',
        cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
      },
      {
        key: 'publishedAt',
        header: '发布时间',
        cell: (row) => (
          <span className="text-xs">
            {formatDateTime(row.publishedAt || row.importedAt || row.createdAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        cell: (row) => (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => openEditor(row)}>
              <Edit3 className="h-4 w-4" />
              编辑
            </button>
            {row.status === 'published' ? (
              <a
                className="btn btn-ghost"
                href={`/stories/${row.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                前台
              </a>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost text-red-600"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <PageFrame section="contentMarketing">
      <div className="space-y-5">
        <div className="metric-grid">
          {[
            { label: '当前页内容', value: String(items.length) },
            { label: '草稿', value: String(draftCount) },
            { label: '已发布', value: String(publishedCount) },
            { label: '已导入', value: String(importedCount) },
          ].map((item) => (
            <div key={item.label} className="resource-card p-4">
              <div className="text-muted-foreground text-sm">{item.label}</div>
              <div className="mt-1 text-2xl font-semibold">{item.value}</div>
            </div>
          ))}
        </div>

        <ResourceToolbar
          tabs={contentTabs}
          activeKey={activeTab}
          onTabChange={setActiveTab}
          action={{ label: '新建内容', onClick: () => openEditor() }}
        />

        {activeTab === 'import' && (
          <div className="grid gap-4 xl:grid-cols-3">
            <ImportCard
              title="导入 WordPress"
              description="输入文章 URL；站点地址和应用密码留空时读取系统集成配置。"
              actionLabel={importing === 'wordpress' ? '导入中...' : '导入文章'}
              disabled={importing !== ''}
              onImport={() => runImport('wordpress')}
            >
              <Field label="文章 URL">
                <input
                  className="form-input"
                  value={wpForm.postUrl}
                  onChange={(event) => setWpForm({ ...wpForm, postUrl: event.target.value })}
                  placeholder="https://your-site.com/post-slug"
                />
              </Field>
              <Field label="站点地址" hint="可选，默认从文章 URL 推断">
                <input
                  className="form-input"
                  value={wpForm.siteUrl}
                  onChange={(event) => setWpForm({ ...wpForm, siteUrl: event.target.value })}
                  placeholder="https://your-site.com"
                />
              </Field>
              <FieldRow>
                <Field label="用户名">
                  <input
                    className="form-input"
                    value={wpForm.username}
                    onChange={(event) => setWpForm({ ...wpForm, username: event.target.value })}
                  />
                </Field>
                <Field label="应用密码">
                  <input
                    className="form-input"
                    type="password"
                    value={wpForm.appPassword}
                    onChange={(event) => setWpForm({ ...wpForm, appPassword: event.target.value })}
                  />
                </Field>
              </FieldRow>
              <ImportStatusSelect
                value={wpForm.status}
                onChange={(status) => setWpForm({ ...wpForm, status })}
              />
            </ImportCard>

            <ImportCard
              title="导入 Notion"
              description="输入页面 URL；Token 留空时读取系统集成配置。"
              actionLabel={importing === 'notion' ? '导入中...' : '导入页面'}
              disabled={importing !== ''}
              onImport={() => runImport('notion')}
            >
              <Field label="Notion Token">
                <input
                  className="form-input"
                  type="password"
                  value={notionForm.apiToken}
                  onChange={(event) =>
                    setNotionForm({ ...notionForm, apiToken: event.target.value })
                  }
                />
              </Field>
              <Field label="页面 URL">
                <input
                  className="form-input"
                  value={notionForm.pageUrl}
                  onChange={(event) =>
                    setNotionForm({ ...notionForm, pageUrl: event.target.value })
                  }
                  placeholder="https://www.notion.so/..."
                />
              </Field>
              <ImportStatusSelect
                value={notionForm.status}
                onChange={(status) => setNotionForm({ ...notionForm, status })}
              />
            </ImportCard>

            <ImportCard
              title="导入微信公众号"
              description="输入公众号文章链接，系统会抓取标题、封面、摘要和正文。"
              actionLabel={importing === 'wechat' ? '导入中...' : '导入公众号文章'}
              disabled={importing !== ''}
              onImport={() => runImport('wechat')}
            >
              <Field label="公众号文章 URL">
                <input
                  className="form-input"
                  value={wechatForm.url}
                  onChange={(event) => setWechatForm({ ...wechatForm, url: event.target.value })}
                  placeholder="https://mp.weixin.qq.com/s/..."
                />
              </Field>
              <ImportStatusSelect
                value={wechatForm.status}
                onChange={(status) => setWechatForm({ ...wechatForm, status })}
              />
            </ImportCard>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="space-y-4">
            <div className="resource-card grid gap-3 p-4 md:grid-cols-[1fr_12rem_12rem_auto]">
              <input
                className="form-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索标题、slug、摘要、作者或来源链接"
              />
              <select
                className="form-input"
                value={sourceFilter}
                onChange={(event) =>
                  setSourceFilter(event.target.value as ContentSourceType | typeof ALL)
                }
              >
                <option value={ALL}>全部来源</option>
                <option value="manual">手动</option>
                <option value="wordpress">WordPress</option>
                <option value="notion">Notion</option>
                <option value="wechat">微信公众号</option>
              </select>
              <select
                className="form-input"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ContentStatus | typeof ALL)
                }
              >
                <option value={ALL}>全部状态</option>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
              <button type="button" className="btn btn-secondary h-10" onClick={() => reload()}>
                <RefreshCw className="h-4 w-4" />
                刷新
              </button>
            </div>
            {loading ? (
              <div className="resource-card text-muted-foreground py-12 text-center text-sm">
                加载中...
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={items}
                emptyMessage="暂无内容"
                pageSize={PAGE_SIZE}
                pageSizeOptions={[PAGE_SIZE]}
                searchable={false}
              />
            )}
            <div className="resource-card table-footer">
              <span className="text-foreground font-medium whitespace-nowrap">
                共 {total} 篇，第 {page} / {totalPages} 页
              </span>
              <div className="table-pagination">
                <button
                  type="button"
                  className="pagination-button"
                  aria-label="上一页"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="pagination-button"
                  aria-label="下一页"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-muted-foreground justify-self-start text-xs sm:justify-self-end">
                每页 {PAGE_SIZE}
              </span>
            </div>
          </div>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={form.id ? '编辑内容' : '新建内容'}
        description="正文支持 HTML 或 Markdown 文本，前台详情页会按文章内容展示。"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDrawerOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={submitContent}
            >
              {saving ? '保存中...' : '保存内容'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldRow>
            <Field label="标题" required>
              <input
                className="form-input"
                value={form.title}
                onChange={(event) => patchForm({ title: event.target.value })}
              />
            </Field>
            <Field label="slug" hint="留空时会根据标题生成">
              <input
                className="form-input"
                value={form.slug}
                onChange={(event) => patchForm({ slug: event.target.value })}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="状态">
              <select
                className="form-input"
                value={form.status}
                onChange={(event) => patchForm({ status: event.target.value as ContentStatus })}
              >
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
            </Field>
            <Field label="来源类型">
              <select
                className="form-input"
                value={form.sourceType}
                onChange={(event) =>
                  patchForm({ sourceType: event.target.value as ContentSourceType })
                }
              >
                <option value="manual">手动</option>
                <option value="wordpress">WordPress</option>
                <option value="notion">Notion</option>
                <option value="wechat">微信公众号</option>
              </select>
            </Field>
          </FieldRow>
          <Field label="作者 / 学员称呼">
            <input
              className="form-input"
              value={form.authorName}
              onChange={(event) => patchForm({ authorName: event.target.value })}
              placeholder="如：二年级学员 小羽"
            />
          </Field>
          <QiniuImageField
            label="封面图"
            value={form.coverUrl}
            onChange={(coverUrl) => patchForm({ coverUrl })}
            prefix="content/covers"
          />
          <FieldRow>
            <Field label="来源 ID">
              <input
                className="form-input"
                value={form.sourceId}
                onChange={(event) => patchForm({ sourceId: event.target.value })}
              />
            </Field>
            <Field label="来源链接">
              <input
                className="form-input"
                value={form.sourceUrl}
                onChange={(event) => patchForm({ sourceUrl: event.target.value })}
              />
            </Field>
          </FieldRow>
          <Field label="摘要" hint="用于首页卡片和列表页，留空时后端会从正文生成">
            <textarea
              className="form-input h-24"
              value={form.excerpt}
              onChange={(event) => patchForm({ excerpt: event.target.value })}
            />
          </Field>
          <Field label="正文内容" hint="可粘贴 HTML 或 Markdown 文本">
            <textarea
              className="form-input h-80 font-mono text-sm"
              value={form.content}
              onChange={(event) => patchForm({ content: event.target.value })}
            />
          </Field>
        </div>
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除内容？"
        message={`确认删除「${deleteTarget?.title ?? ''}」？删除后前台成长故事将不再展示这篇内容。`}
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageFrame>
  );
}

function ImportCard({
  title,
  description,
  actionLabel,
  disabled,
  onImport,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  disabled: boolean;
  onImport: () => void;
  children: ReactNode;
}) {
  return (
    <section className="resource-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
      </div>
      <div className="space-y-3">
        {children}
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={disabled}
          onClick={onImport}
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

function ImportStatusSelect({
  value,
  onChange,
}: {
  value: 'draft' | 'published';
  onChange: (value: 'draft' | 'published') => void;
}) {
  return (
    <Field label="导入状态">
      <select
        className="form-input"
        value={value}
        onChange={(event) => onChange(event.target.value as 'draft' | 'published')}
      >
        <option value="draft">保存为草稿</option>
        <option value="published">直接发布</option>
      </select>
    </Field>
  );
}
