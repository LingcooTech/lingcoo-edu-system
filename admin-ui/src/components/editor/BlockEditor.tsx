import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';

import { Field } from '@/components/shared/FormField';
import { QiniuGalleryField, QiniuImageField } from '@/components/shared/QiniuImageField';
import {
  ALL_BLOCK_TYPES,
  BLOCK_LABELS,
  newBlock,
  type Block,
  type BlockType,
  type FaqItem,
} from './blocks';

interface BlockEditorProps {
  value: Block[];
  onChange: (blocks: Block[]) => void;
  /** Which module types appear in the "add module" palette. Defaults to all. */
  allowed?: BlockType[];
}

function imageLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The reusable module editor: an ordered list of block "cards", each edited via
 * plain form inputs (no contenteditable), with move up/down + delete, plus an
 * "add module" picker restricted to `allowed`. Pairs with <BlockRenderer> for
 * the live preview. Shared across institution home / teacher / course / campaign.
 */
export function BlockEditor({ value, onChange, allowed = ALL_BLOCK_TYPES }: BlockEditorProps) {
  function patch(id: string, partial: Partial<Block>) {
    onChange(value.map((block) => (block.id === id ? ({ ...block, ...partial } as Block) : block)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(id: string) {
    onChange(value.filter((block) => block.id !== id));
  }

  function add(type: BlockType) {
    onChange([...value, newBlock(type)]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs">
          还没有内容模块，从下方「添加模块」开始搭建。
        </p>
      ) : (
        value.map((block, index) => (
          <div key={block.id} className="bg-card rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
                <GripVertical className="h-3.5 w-3.5" />
                {BLOCK_LABELS[block.type]}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="btn btn-ghost px-1.5 py-1"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="上移"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-1.5 py-1"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="下移"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-1.5 py-1 text-red-600"
                  onClick={() => remove(block.id)}
                  aria-label="删除模块"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="px-3 py-3">
              <BlockFields block={block} patch={(partial) => patch(block.id, partial)} />
            </div>
          </div>
        ))
      )}

      <select
        className="form-input"
        value=""
        onChange={(event) => {
          const type = event.target.value as BlockType;
          if (type) add(type);
          event.currentTarget.value = '';
        }}
      >
        <option value="">＋ 添加模块…</option>
        {allowed.map((type) => (
          <option key={type} value={type}>
            {BLOCK_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One textarea where each non-empty line becomes a list item. */
function LinesField({
  label,
  hint,
  items,
  onChange,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="form-input h-24"
        value={items.join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </Field>
  );
}

function BlockFields({ block, patch }: { block: Block; patch: (partial: Partial<Block>) => void }) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="标题文字">
            <input
              className="form-input"
              value={block.text}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </Field>
          <Field label="层级">
            <select
              className="form-input"
              value={block.level}
              onChange={(event) => patch({ level: Number(event.target.value) === 3 ? 3 : 2 })}
            >
              <option value={2}>大标题</option>
              <option value={3}>小标题</option>
            </select>
          </Field>
        </div>
      );
    case 'paragraph':
      return (
        <Field label="段落正文" hint="支持换行">
          <textarea
            className="form-input h-24"
            value={block.text}
            onChange={(event) => patch({ text: event.target.value })}
          />
        </Field>
      );
    case 'list':
      return (
        <>
          <Field label="列表样式">
            <select
              className="form-input"
              value={block.ordered ? 'ordered' : 'unordered'}
              onChange={(event) => patch({ ordered: event.target.value === 'ordered' })}
            >
              <option value="unordered">无序（圆点）</option>
              <option value="ordered">有序（数字）</option>
            </select>
          </Field>
          <LinesField
            label="列表项"
            hint="每行一项"
            items={block.items}
            onChange={(items) => patch({ items })}
          />
        </>
      );
    case 'image':
      return (
        <>
          <QiniuImageField
            label="图片地址 URL"
            value={block.url}
            onChange={(url) => patch({ url })}
            prefix="content/images"
          />
          <Field label="图注" hint="可选">
            <input
              className="form-input"
              value={block.caption ?? ''}
              onChange={(event) => patch({ caption: event.target.value })}
            />
          </Field>
          <Field label="替代文字 alt" hint="可选，无障碍/SEO">
            <input
              className="form-input"
              value={block.alt ?? ''}
              onChange={(event) => patch({ alt: event.target.value })}
            />
          </Field>
        </>
      );
    case 'imageText':
      return (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <QiniuImageField
              label="图片地址 URL"
              value={block.url}
              onChange={(url) => patch({ url })}
              prefix="content/images"
            />
            <Field label="图片位置">
              <select
                className="form-input"
                value={block.mediaSide}
                onChange={(event) =>
                  patch({ mediaSide: event.target.value === 'right' ? 'right' : 'left' })
                }
              >
                <option value="left">左图右文</option>
                <option value="right">右图左文</option>
              </select>
            </Field>
          </div>
          <Field label="标题" hint="可选">
            <input
              className="form-input"
              value={block.title ?? ''}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </Field>
          <Field label="说明文字" hint="可选">
            <textarea
              className="form-input h-20"
              value={block.text ?? ''}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </Field>
        </>
      );
    case 'stats':
      return (
        <LinesField
          label="数据条目"
          hint="每行一项，如「6-8 人小班」"
          items={block.items}
          onChange={(items) => patch({ items })}
        />
      );
    case 'testimonials':
      return (
        <LinesField
          label="评价内容"
          hint="每行一条家长评价"
          items={block.items}
          onChange={(items) => patch({ items })}
        />
      );
    case 'cta':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="按钮文字">
            <input
              className="form-input"
              value={block.text}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </Field>
          <Field label="链接" hint="如 /register">
            <input
              className="form-input"
              value={block.link}
              onChange={(event) => patch({ link: event.target.value })}
            />
          </Field>
        </div>
      );
    case 'gallery':
      return (
        <QiniuGalleryField
          label="图片地址"
          hint="每行一个图片 URL"
          value={block.urls.join('\n')}
          onChange={(value) => patch({ urls: imageLines(value) })}
          prefix="content/gallery"
        />
      );
    case 'faq':
      return <FaqFields items={block.items} onChange={(items) => patch({ items })} />;
    case 'divider':
      return <p className="text-muted-foreground text-xs">分隔线，无需配置。</p>;
  }
}

function FaqFields({
  items,
  onChange,
}: {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
}) {
  function update(index: number, partial: Partial<FaqItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...partial } : item)));
  }
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="space-y-2 rounded-md border p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">问题 {index + 1}</span>
            <button
              type="button"
              className="btn btn-ghost px-1.5 py-1 text-red-600"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label="删除问题"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            className="form-input"
            placeholder="问题"
            value={item.q}
            onChange={(event) => update(index, { q: event.target.value })}
          />
          <textarea
            className="form-input h-16"
            placeholder="回答"
            value={item.a}
            onChange={(event) => update(index, { a: event.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => onChange([...items, { q: '', a: '' }])}
      >
        <Plus className="h-4 w-4" />
        添加问题
      </button>
    </div>
  );
}
