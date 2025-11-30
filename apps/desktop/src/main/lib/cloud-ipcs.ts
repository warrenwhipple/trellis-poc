import { ipcMain } from "electron";
import { cloudApiClient } from "./cloud-api-client";
import { db } from "./db";
import type { CloudSandbox } from "./db/schemas";

/**
 * Register cloud sandbox IPC handlers
 * Note: createSandbox and deleteSandbox are now handled via tRPC (see lib/trpc/routers/cloud)
 */
export function registerCloudHandlers() {
	ipcMain.handle("cloud-sandbox-list", async () => {
		return cloudApiClient.listSandboxes();
	});

	ipcMain.handle(
		"cloud-sandbox-status",
		async (_event, input: { sandboxId: string }) => {
			return cloudApiClient.getSandboxStatus(input.sandboxId);
		},
	);

	ipcMain.handle(
		"worktree-set-cloud-sandbox",
		async (
			_event,
			input: { worktreeId: string; cloudSandbox: CloudSandbox | null },
		) => {
			try {
				await db.update((data) => {
					const worktree = data.worktrees.find(
						(wt) => wt.id === input.worktreeId,
					);
					if (worktree) {
						worktree.cloudSandbox = input.cloudSandbox ?? undefined;
					}
				});
				return { success: true };
			} catch (error) {
				console.error("Failed to update worktree sandbox:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);
}
