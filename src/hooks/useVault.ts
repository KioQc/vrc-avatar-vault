import type { Avatar } from '../types/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repository } from '../db/repository';
export const useAvatars = () =>
  useQuery({ queryKey: ['avatars'], queryFn: () => repository.avatars() });
export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => repository.settings() });
export function useAction<TArgs, TResult>(
  action: (args: TArgs) => Promise<TResult>,
  message?: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      if (message) toast.success(message);
    },
    onSettled: () => {
      void client.invalidateQueries({
        predicate: (query) => !['image', 'storage'].includes(String(query.queryKey[0])),
      });
    },
    onError: (e) => toast.error(String(e instanceof Error ? e.message : e)),
  });
}

export function useFavorite(avatar: Avatar) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => repository.updateAvatar(avatar.id, { favorite: avatar.favorite ? 0 : 1 }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['avatars'] });
      const previous = client.getQueryData<Avatar[]>(['avatars']);
      client.setQueryData<Avatar[]>(['avatars'], (rows) =>
        rows?.map((a) => (a.id === avatar.id ? { ...a, favorite: a.favorite ? 0 : 1 } : a)),
      );
      return { previous };
    },
    onError: (error, _args, context) => {
      if (context?.previous) client.setQueryData(['avatars'], context.previous);
      toast.error(String(error));
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['avatars'] }),
  });
}
