import { invoke, isTauri } from '@tauri-apps/api/core';
export const mockMode = import.meta.env.DEV && import.meta.env.VITE_MOCK_MODE === 'true';
export const desktop = isTauri();
export type Scalar = string | number | boolean | null;
export interface Statement {
  sql: string;
  params: Scalar[];
}
export const statement = (sql: string, ...params: Scalar[]): Statement => ({ sql, params });
export async function query<T>(sql: string, ...params: Scalar[]): Promise<T[]> {
  if (mockMode) return (await import('./mock')).mockQuery<T>(sql, params);
  if (!desktop)
    throw new Error(
      'Open the desktop application with npm run desktop. Browser fixtures are available explicitly with npm run dev:mock.',
    );
  return invoke('db_query', { statement: { sql, params } });
}
export async function execute(statements: Statement[]): Promise<void> {
  if (mockMode) return (await import('./mock')).mockExecute(statements);
  return invoke('db_execute', { statements });
}
