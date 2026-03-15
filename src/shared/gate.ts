export type ActionType = 'copy' | 'download';

export async function requestAction(_type: ActionType): Promise<boolean> {
  // Stub: always allow (monetization gate will be implemented in v2.0)
  return true;
}
