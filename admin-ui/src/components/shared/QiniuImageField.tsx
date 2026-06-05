import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, Image, RefreshCw, UploadCloud } from 'lucide-react';

import { fetchQiniuImages, uploadQiniuImage } from '@/api/client';
import type { QiniuImageItem } from '@/api/types';
import { useToast } from '@/components/shared/Toast';

function imageLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function appendUrl(value: string, url: string) {
  const lines = imageLines(value);
  if (!lines.includes(url)) {
    lines.push(url);
  }
  return lines.join('\n');
}

function bytesLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5 block">
      <span className="form-label">{label}</span>
      {children}
      {hint ? <span className="form-hint">{hint}</span> : null}
    </div>
  );
}

export function QiniuImageField({
  label,
  hint,
  value,
  onChange,
  prefix,
  previewAlt = '图片预览',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  previewAlt?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const result = await uploadQiniuImage(file, prefix);
      onChange(result.publicUrl);
      toast.success('图片已上传');
      setPickerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <FieldShell label={label} hint={hint}>
      <div className="grid gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="form-input min-w-0 flex-1"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="h-4 w-4" />
              {uploading ? '上传中...' : '上传'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPickerOpen((open) => !open)}
            >
              <FolderOpen className="h-4 w-4" />
              素材库
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void upload(file);
          }}
        />
        {value ? (
          <div className="h-32 overflow-hidden rounded-lg border bg-slate-50">
            <img src={value} alt={previewAlt} className="h-full w-full object-cover" />
          </div>
        ) : null}
        {pickerOpen ? (
          <QiniuImagePicker
            prefix={prefix}
            onSelect={(url) => {
              onChange(url);
              setPickerOpen(false);
            }}
          />
        ) : null}
      </div>
    </FieldShell>
  );
}

export function QiniuGalleryField({
  label,
  hint,
  value,
  onChange,
  prefix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const urls = imageLines(value);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      let next = value;
      for (const file of Array.from(files)) {
        const result = await uploadQiniuImage(file, prefix);
        next = appendUrl(next, result.publicUrl);
      }
      onChange(next);
      toast.success(files.length > 1 ? '图片已批量上传' : '图片已上传');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <FieldShell label={label} hint={hint}>
      <div className="grid gap-2">
        <textarea
          className="form-input h-24"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" />
            {uploading ? '上传中...' : '上传并追加'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPickerOpen((open) => !open)}
          >
            <FolderOpen className="h-4 w-4" />
            从素材库追加
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            event.currentTarget.value = '';
            if (files?.length) void upload(files);
          }}
        />
        {urls.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {urls.slice(0, 8).map((url) => (
              <div key={url} className="aspect-video overflow-hidden rounded-md border bg-slate-50">
                <img src={url} alt="图库预览" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        ) : null}
        {pickerOpen ? (
          <QiniuImagePicker prefix={prefix} onSelect={(url) => onChange(appendUrl(value, url))} />
        ) : null}
      </div>
    </FieldShell>
  );
}

export function QiniuMediaLibrary({ prefix = '' }: { prefix?: string }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState(prefix);
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadQiniuImage(file, currentPrefix || undefined);
      }
      setReloadKey((key) => key + 1);
      toast.success(files.length > 1 ? '素材已批量上传' : '素材已上传');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="resource-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">图片素材库</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="form-input w-full sm:w-56"
            placeholder="目录前缀"
            value={currentPrefix}
            onChange={(event) => setCurrentPrefix(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" />
            {uploading ? '上传中...' : '上传素材'}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          event.currentTarget.value = '';
          if (files?.length) void upload(files);
        }}
      />
      <div className="mt-4">
        <QiniuImagePicker prefix={currentPrefix || undefined} reloadKey={reloadKey} />
      </div>
    </section>
  );
}

function QiniuImagePicker({
  prefix,
  onSelect,
  reloadKey = 0,
}: {
  prefix?: string;
  onSelect?: (url: string) => void;
  reloadKey?: number;
}) {
  const toast = useToast();
  const [items, setItems] = useState<QiniuImageItem[]>([]);
  const [marker, setMarker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(nextMarker?: string | null) {
    setLoading(true);
    try {
      const payload = await fetchQiniuImages({
        prefix,
        marker: nextMarker ?? undefined,
        limit: 40,
      });
      setItems((current) => (nextMarker ? [...current, ...payload.items] : payload.items));
      setMarker(payload.marker);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '素材加载失败');
      if (!nextMarker) {
        setItems([]);
        setMarker(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(null);
  }, [prefix, reloadKey]);

  return (
    <div className="rounded-lg border bg-slate-50/70 p-3">
      {items.length === 0 && !loading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
          <Image className="h-4 w-4" />
          暂无图片素材
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const content = (
              <>
                <div className="aspect-video overflow-hidden rounded-md border bg-white">
                  <img src={item.url} alt={item.key} className="h-full w-full object-cover" />
                </div>
                <div className="mt-1 min-w-0">
                  <div className="truncate text-xs font-medium">{item.key}</div>
                  {item.size ? (
                    <div className="text-muted-foreground text-[11px]">{bytesLabel(item.size)}</div>
                  ) : null}
                </div>
              </>
            );
            return onSelect ? (
              <button
                key={item.key}
                type="button"
                className="rounded-md p-1 text-left hover:bg-white"
                onClick={() => onSelect(item.url)}
              >
                {content}
              </button>
            ) : (
              <div key={item.key} className="rounded-md p-1">
                {content}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex justify-center">
        {marker ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => void load(marker)}
          >
            {loading ? '加载中...' : '加载更多'}
          </button>
        ) : loading ? (
          <span className="text-muted-foreground text-sm">加载中...</span>
        ) : null}
      </div>
    </div>
  );
}
