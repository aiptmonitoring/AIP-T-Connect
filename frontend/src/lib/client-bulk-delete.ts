export type BulkClient = { id: string; company_name: string };
type ClientPage = { data: BulkClient[]; total: number };
// Collect every page before deletion changes pagination.
export async function collectAllClients(fetchPage: (page: number) => Promise<ClientPage>): Promise<BulkClient[]> {
  const clients: BulkClient[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page);
    if (!Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.data)) throw Error("Unable to verify the complete client list.");
    expected ??= result.total;
    if (expected !== result.total) throw Error("The client list changed. Close this dialog and try again.");
    for (const client of result.data) {
      if (!client.id || ids.has(client.id)) throw Error("The client list changed. Close this dialog and try again.");
      ids.add(client.id);
      clients.push(client);
    }
    if (clients.length === expected) return clients;
    if (!result.data.length || clients.length > expected) throw Error("Unable to load every client. Close this dialog and try again.");
  }
}
export async function deleteClientBatch(clients: BulkClient[], remove: (id: string) => Promise<unknown>, onProgress: (deleted: number) => void): Promise<{ deleted: number; error: string }> {
  let deleted = 0;
  for (const client of clients) {
    try { await remove(client.id); } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Request failed.";
      return { deleted, error: `Stopped at ${client.company_name}: ${reason} Refresh and review the remaining clients before trying again.` };
    }
    deleted += 1;
    onProgress(deleted);
  }
  return { deleted, error: "" };
}
