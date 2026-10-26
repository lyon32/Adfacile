'use client';
// Étape « Sources » (APPFLOW §8.1) : plateforme, Page, sources (lien, photo, publication, document, description),
// consigne facultative, [Analyser]. Les fichiers sont envoyés au stockage par URL signée, puis l'analyse est lancée
// avec une `Idempotency-Key` (elle dépense). Le brouillon vit dans le magasin du client, jamais sur le serveur.
import { Button, buttonVariants, Card, cn, Field } from '@pubeka/ui';
import {
  Camera,
  Check,
  FileText,
  Link2,
  MessageSquare,
  PenLine,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { useWizardStore } from '../../stores/wizard-store';
import { usePages } from '../meta-connection/api';
import { SelectField } from '../settings/select-field';
import { UploadFailedError, uploadFile, useStartAnalysis } from './api';
import {
  buildBody,
  checkFile,
  countSources,
  DOCUMENT_TYPES,
  filesToUpload,
  IMAGE_TYPES,
  MAX_INTENT_CHARS,
  MAX_PHOTOS,
  MAX_TEXT_CHARS,
  validateDraft,
  type Draft,
  type DraftError,
  type SourceKind,
} from './sources-model';
import { TextAreaField } from './text-area-field';

export type StartErrorKey =
  | 'unsafe_url'
  | 'file_type'
  | 'file_too_large_image'
  | 'file_too_large_document'
  | 'file_gone'
  | 'rate_limited'
  | 'forbidden'
  | 'unavailable'
  | 'generic';

/** Clé du message d'une erreur de l'API (liste fermée d'API_SPEC §4). `kind` : genre du fichier en cours d'envoi. */
export function startErrorKey(
  error: unknown,
  kind: 'image' | 'document' | null = null,
): StartErrorKey {
  if (error instanceof UploadFailedError) return 'unavailable';
  if (!(error instanceof ApiError)) return 'generic';
  switch (error.code) {
    case 'unsafe_url':
      return 'unsafe_url';
    case 'unsupported_file_type':
      return 'file_type';
    case 'file_too_large':
      return kind === 'document' ? 'file_too_large_document' : 'file_too_large_image';
    case 'gone':
      return 'file_gone';
    case 'rate_limited':
      return 'rate_limited';
    case 'role_insufficient':
    case 'forbidden':
    case 'workspace_read_only':
    case 'workspace_suspended':
    case 'workspace_locked':
      return 'forbidden';
    case 'provider_unavailable':
    case 'maintenance':
      return 'unavailable';
    default:
      return 'generic';
  }
}

const KIND_ICONS: Record<SourceKind, LucideIcon> = {
  website: Link2,
  photo: Camera,
  post: MessageSquare,
  document: FileText,
  text: PenLine,
};
const KINDS: readonly SourceKind[] = ['website', 'photo', 'post', 'document', 'text'];

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} Ko`;
}

function FilePicker({
  label,
  accept,
  multiple,
  onPick,
}: {
  label: string;
  accept: string;
  multiple: boolean;
  onPick: (files: File[]) => void;
}): ReactNode {
  return (
    <label
      className={cn(
        buttonVariants({ variant: 'quiet' }),
        'focus-within:outline-focus cursor-pointer self-start focus-within:outline-2 focus-within:outline-offset-2',
      )}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files === null ? [] : Array.from(event.target.files);
          // Même fichier choisi deux fois de suite : le champ est vidé pour que « change » se redéclenche.
          event.target.value = '';
          if (files.length > 0) onPick(files);
        }}
      />
      {label}
    </label>
  );
}

function FileRow({
  file,
  problem,
  onRemove,
}: {
  file: File;
  problem: string | null;
  onRemove: () => void;
}): ReactNode {
  const t = useTranslations('campaign.wizard.sources');
  return (
    <li className="border-line flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{file.name}</p>
        <p
          className={cn('text-meta', problem === null ? 'text-muted' : 'text-error font-semibold')}
        >
          {problem ?? formatSize(file.size)}
        </p>
      </div>
      <Button
        type="button"
        variant="quiet"
        size="icon"
        aria-label={t('file_remove', { name: file.name })}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

export interface SourcesStepProps {
  workspaceId: string;
  /** Appelé quand l'analyse est lancée : l'écran suit alors `analysisId` dans l'adresse. */
  onStarted: (analysisId: string) => void;
}

export function SourcesStep({ workspaceId, onStarted }: SourcesStepProps): ReactNode {
  const t = useTranslations('campaign.wizard.sources');
  const draft = useWizardStore((s) => s.draft);
  const store = useWizardStore();
  const pages = usePages(workspaceId);
  const start = useStartAnalysis(workspaceId);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [failure, setFailure] = useState<StartErrorKey | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);

  const activePages = pages.data?.data.filter((p) => p.active) ?? [];
  const pageId = draft.pageId === '' ? (activePages[0]?.id ?? '') : draft.pageId;
  const effective: Draft = { ...draft, pageId };
  const errors = validateDraft(effective);
  const errorOf = (field: DraftError['field']): DraftError | undefined =>
    errors.find((e) => e.field === field);
  const has = (kind: SourceKind): boolean => draft.kinds.includes(kind);
  const busy = progress !== null || start.isPending;
  const sourceCount = countSources(effective);

  const message = (error: DraftError | undefined): string | undefined => {
    if (error === undefined || !showErrors) return undefined;
    return t(`errors.${error.code === 'need_one' ? 'generic' : error.code}`);
  };

  async function submit(): Promise<void> {
    setShowErrors(true);
    setFailure(null);
    if (errors.length > 0) return;
    const uploads = filesToUpload(effective);
    let kind: 'image' | 'document' | null = null;
    try {
      const paths: string[] = [];
      for (const [index, entry] of uploads.entries()) {
        kind = entry.type;
        setProgress({ current: index + 1, total: uploads.length });
        paths.push(await uploadFile(workspaceId, entry.file));
      }
      kind = null;
      setProgress({ current: uploads.length, total: uploads.length });
      const body = buildBody(effective, paths);
      // Même demande = même clé (double clic, nouvelle tentative) ; une demande modifiée reçoit une nouvelle clé.
      const signature = JSON.stringify({
        ...body,
        files: uploads.map((u) => [u.file.name, u.file.size]),
      });
      if (keyRef.current?.signature !== signature) {
        keyRef.current = { signature, key: crypto.randomUUID() };
      }
      const analysis = await start.mutateAsync({ body, key: keyRef.current.key });
      onStarted(analysis.id);
    } catch (error) {
      setFailure(startErrorKey(error, kind));
    } finally {
      setProgress(null);
    }
  }

  const photoProblem = (file: File): string | null => {
    const problem = checkFile(file, 'image');
    return problem === null ? null : t(`errors.${problem}`);
  };

  return (
    <section aria-labelledby="sources-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="sources-title" className="text-2xl font-bold">
          {t('title')}
        </h1>
        <p className="text-muted">{t('body')}</p>
      </header>

      <Card className="flex flex-col gap-5">
        <div role="radiogroup" aria-label={t('platform_label')} className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked="true"
            className="border-ink bg-panel flex min-h-11 items-center gap-2 rounded-md border-2 px-4 text-sm font-bold"
          >
            <Check aria-hidden="true" className="size-4" />
            {t('platform_meta')}
          </button>
          {(['platform_google', 'platform_tiktok'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked="false"
              aria-disabled="true"
              className="border-line text-muted flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border px-4 text-sm font-semibold"
            >
              {t(key)}
              <span className="border-line rounded-sm border px-1.5 py-0.5 text-xs font-bold">
                {t('soon')}
              </span>
            </button>
          ))}
        </div>
        {activePages.length > 0 ? (
          <SelectField
            label={t('page_label')}
            value={pageId}
            options={activePages.map((p) => ({ value: p.id, label: p.name }))}
            disabled={busy}
            onChange={(event) => {
              store.setField('pageId', event.target.value);
            }}
          />
        ) : null}
      </Card>

      <fieldset className="flex flex-col gap-3" disabled={busy}>
        <legend className="text-title mb-3 font-semibold">{t('choices_label')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind];
            const selected = has(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  store.toggleKind(kind);
                }}
                className={cn(
                  'bg-panel flex min-h-16 items-start gap-3 rounded-lg border p-4 text-left transition-colors motion-reduce:transition-none',
                  selected ? 'border-ink border-2' : 'border-line hover:border-field-line',
                )}
              >
                <Icon aria-hidden="true" className="text-muted mt-0.5 size-5 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-title font-semibold">{t(kind)}</span>
                  <span className="text-meta text-muted">{t(`${kind}_hint`)}</span>
                </span>
                {selected ? <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {draft.kinds.length > 0 ? (
        <Card className="flex flex-col gap-6">
          {has('website') ? (
            <Field
              label={t('website_field')}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder={t('website_placeholder')}
              value={draft.websiteUrl}
              disabled={busy}
              error={message(errorOf('websiteUrl'))}
              onChange={(event) => {
                store.setField('websiteUrl', event.target.value);
              }}
            />
          ) : null}
          {has('photo') ? (
            <div className="flex flex-col gap-3">
              <FilePicker
                label={t('photo_pick')}
                accept={IMAGE_TYPES.join(',')}
                multiple
                onPick={(files) => {
                  store.addPhotos(files);
                }}
              />
              {draft.photos.length > 0 ? (
                <>
                  <p className="text-meta text-muted font-semibold">
                    {t('file_count', { count: draft.photos.length })}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {draft.photos.map((file, index) => (
                      <FileRow
                        key={`${file.name}-${String(index)}`}
                        file={file}
                        problem={photoProblem(file)}
                        onRemove={() => {
                          store.removePhoto(index);
                        }}
                      />
                    ))}
                  </ul>
                </>
              ) : null}
              {draft.photos.length > MAX_PHOTOS ? (
                <p role="alert" className="text-meta text-error font-semibold">
                  {t('errors.too_many_photos')}
                </p>
              ) : null}
            </div>
          ) : null}
          {has('post') ? (
            <Field
              label={t('post_field')}
              type="url"
              inputMode="url"
              placeholder={t('website_placeholder')}
              value={draft.postUrl}
              disabled={busy}
              hint={t('post_help')}
              error={message(errorOf('postUrl'))}
              onChange={(event) => {
                store.setField('postUrl', event.target.value);
              }}
            />
          ) : null}
          {has('document') ? (
            <div className="flex flex-col gap-3">
              <FilePicker
                label={t('document_pick')}
                accept={`${DOCUMENT_TYPES.join(',')},.pdf,.docx`}
                multiple={false}
                onPick={(files) => {
                  store.setDocument(files[0] ?? null);
                }}
              />
              {draft.document === null ? null : (
                <ul>
                  <FileRow
                    file={draft.document}
                    problem={(() => {
                      const problem = checkFile(draft.document, 'document');
                      return problem === null ? null : t(`errors.${problem}`);
                    })()}
                    onRemove={() => {
                      store.setDocument(null);
                    }}
                  />
                </ul>
              )}
            </div>
          ) : null}
          {has('text') ? (
            <TextAreaField
              label={t('text_field')}
              hint={t('text_help')}
              value={draft.text}
              disabled={busy}
              counter={`${String(draft.text.length)} / ${String(MAX_TEXT_CHARS)}`}
              error={message(errorOf('text'))}
              onChange={(event) => {
                store.setField('text', event.target.value);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <TextAreaField
        label={t('intent_field')}
        hint={t('intent_help')}
        value={draft.intent}
        maxLength={MAX_INTENT_CHARS}
        disabled={busy}
        onChange={(event) => {
          store.setField('intent', event.target.value);
        }}
      />

      <div className="flex flex-col gap-3" aria-live="polite">
        {showErrors && errorOf('sources') !== undefined ? (
          <p role="alert" className="text-meta text-error font-semibold">
            {t('need_one')}
          </p>
        ) : null}
        {failure === null ? null : (
          <p role="alert" className="text-error text-sm font-semibold">
            {t(`errors.${failure}`)}
          </p>
        )}
        {progress === null ? null : (
          <p className="text-muted text-sm font-semibold">
            {progress.total === 0 || progress.current >= progress.total
              ? t('analysing_start')
              : t('analysing_upload', { current: progress.current, total: progress.total })}
          </p>
        )}
        <Button
          type="button"
          className="w-full sm:w-auto sm:self-start"
          disabled={busy || sourceCount === 0}
          onClick={() => {
            void submit();
          }}
        >
          {t('analyse')}
        </Button>
      </div>
    </section>
  );
}
