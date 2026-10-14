'use client';
// Réglages > Équipe (APPFLOW §14) : membres, rôles, [Inviter]. Les routes de S06 font foi pour les
// droits (propriétaire seulement) ; l'écran masque simplement ce que le serveur refuserait.
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
} from '@pubeka/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { ApiError, apiFetch } from '../../lib/api';
import { SelectField } from './select-field';

const MemberSchema = z.object({
  profile_id: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
  role: z.enum(['owner', 'editor', 'viewer']),
});
const MembersSchema = z.object({ data: z.array(MemberSchema) });
type Member = z.infer<typeof MemberSchema>;
type InvitableRole = 'editor' | 'viewer';

export function memberLabel(member: Pick<Member, 'name' | 'email' | 'profile_id'>): string {
  return member.name !== undefined && member.name !== ''
    ? member.name
    : (member.email ?? member.profile_id);
}

/** Clé de message d'une erreur de l'API (liste fermée d'API_SPEC §4). */
export function errorKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : '';
  switch (code) {
    case 'member_limit_reached':
    case 'conflict':
    case 'workspace_read_only':
    case 'validation_failed':
      return code;
    case 'forbidden':
    case 'role_insufficient':
      return 'forbidden';
    default:
      return 'generic';
  }
}

export function TeamPanel({
  workspaceId,
  isOwner,
  membersLimit,
}: {
  workspaceId: string;
  isOwner: boolean;
  membersLimit: number;
}): ReactNode {
  const t = useTranslations('settings.team');
  const common = useTranslations('common');
  const client = useQueryClient();
  const key = ['members', workspaceId] as const;
  const base = `/workspaces/${workspaceId}`;

  const members = useQuery({
    queryKey: key,
    queryFn: async () => (await apiFetch(`${base}/members`, MembersSchema)).data,
  });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('editor');
  const [invited, setInvited] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Member | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/invitations`, z.looseObject({}), {
        method: 'POST',
        body: { email: email.trim(), role },
      }),
    onSuccess: () => {
      setInvited(email.trim());
      setEmail('');
    },
    onError: () => {
      setInvited(null);
    },
  });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: InvitableRole }) =>
      apiFetch(`${base}/members/${v.id}`, MemberSchema, {
        method: 'PATCH',
        body: { role: v.role },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${base}/members/${id}`, z.undefined(), { method: 'DELETE' }),
    onSuccess: () => {
      setToRemove(null);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const roleLabel = (r: Member['role']): string =>
    r === 'owner' ? t('role_owner') : r === 'editor' ? t('role_editor') : t('role_viewer');
  const roleOptions = [
    { value: 'editor', label: t('role_editor') },
    { value: 'viewer', label: t('role_viewer') },
  ];
  const failure = invite.error ?? changeRole.error ?? remove.error;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="members-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="members-title" className="text-title font-bold">
            {t('members_label')}
          </h2>
          {members.data !== undefined ? (
            <p className="text-meta text-muted font-semibold tabular-nums">
              {t('count', { count: members.data.length, limit: membersLimit })}
            </p>
          ) : null}
        </div>
        {members.isPending ? <p className="text-muted">{t('loading')}</p> : null}
        {members.isError ? (
          <p role="alert" className="text-error font-semibold">
            {t('load_failed')}
          </p>
        ) : null}
        {members.data !== undefined ? (
          <ul className="border-line bg-panel divide-line divide-y rounded-lg border">
            {members.data.map((member) => (
              <li
                key={member.profile_id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{memberLabel(member)}</p>
                  {member.email !== undefined && member.email !== memberLabel(member) ? (
                    <p className="text-meta text-muted truncate">{member.email}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && member.role !== 'owner' ? (
                    <>
                      <SelectField
                        label={t('role_of', { name: memberLabel(member) })}
                        value={member.role}
                        options={roleOptions}
                        className="w-40 [&_label]:sr-only"
                        onChange={(event) => {
                          changeRole.mutate({
                            id: member.profile_id,
                            role: event.target.value === 'viewer' ? 'viewer' : 'editor',
                          });
                        }}
                      />
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        aria-label={t('remove', { name: memberLabel(member) })}
                        onClick={() => {
                          setToRemove(member);
                        }}
                      >
                        {t('remove_confirm')}
                      </Button>
                    </>
                  ) : (
                    <span className="border-line text-meta rounded-pill border px-3 py-1 font-semibold">
                      {roleLabel(member.role)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {isOwner ? (
        <section aria-labelledby="invite-title" className="flex flex-col gap-4">
          <h2 id="invite-title" className="text-title font-bold">
            {t('invite_title')}
          </h2>
          <form
            className="grid gap-5 sm:grid-cols-[1fr_12rem_auto] sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <Field
              label={t('invite_email')}
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <SelectField
              label={t('invite_role')}
              value={role}
              options={roleOptions}
              onChange={(event) => {
                setRole(event.target.value === 'viewer' ? 'viewer' : 'editor');
              }}
            />
            <Button type="submit" disabled={invite.isPending || email.trim() === ''}>
              {invite.isPending ? t('invite_sending') : t('invite_submit')}
            </Button>
          </form>
          {invited !== null ? (
            <p role="status" className="text-meta text-muted font-semibold">
              {t('invited', { email: invited })}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-meta text-muted">{t('only_owner')}</p>
      )}

      {failure !== null ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {t(`errors.${errorKey(failure)}`)}
        </p>
      ) : null}

      <Dialog
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
      >
        <DialogContent closeLabel={common('close')}>
          <DialogTitle>
            {t('remove_title', { name: toRemove ? memberLabel(toRemove) : '' })}
          </DialogTitle>
          <DialogDescription>{t('remove_body')}</DialogDescription>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              disabled={remove.isPending}
              onClick={() => {
                if (toRemove) remove.mutate(toRemove.profile_id);
              }}
            >
              {t('remove_confirm')}
            </Button>
            <DialogClose asChild>
              <Button variant="quiet">{common('cancel')}</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
