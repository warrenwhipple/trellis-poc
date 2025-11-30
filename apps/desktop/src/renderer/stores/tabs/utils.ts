import { type CloudTab, type Tab, TabType } from "./types";
import { generateTerminalName } from "./utils/terminal-naming";

/**
 * Helper function to get child tab IDs for a given parent ID
 */
export const getChildTabIds = (tabs: Tab[], parentId: string): string[] => {
	return tabs.filter((t) => t.parentId === parentId).map((t) => t.id);
};

/**
 * Extract port from a cloud URL
 * URLs look like: https://7030-sandboxid.e2b.app or https://8888-sandboxid.e2b.app
 */
const getPortFromUrl = (url: string): string | null => {
	const match = url.match(/(\d+)-[a-z0-9-]+\.e2b\.app/);
	return match ? match[1] : null;
};

/**
 * Create a cloud tab for sandbox web views
 */
export const createCloudTab = (workspaceId: string, url: string): CloudTab => {
	const port = getPortFromUrl(url);
	// 7030 = claude agent, 8888 = webssh terminal
	const title = port === "7030" ? "Cloud Agent" : "Cloud SSH";

	return {
		id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
		title,
		workspaceId,
		isNew: true,
		type: TabType.Cloud,
		url,
	};
};

export const createNewTab = (
	workspaceId: string,
	type: TabType.Single | TabType.Group = TabType.Single,
	existingTabs: Tab[] = [],
): Tab => {
	const id = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

	// Generate unique terminal name based on existing single tabs in the current workspace
	const existingNames = existingTabs
		.filter(
			(tab) => tab.workspaceId === workspaceId && tab.type === TabType.Single,
		)
		.map((tab) => tab.title);
	const title =
		type === TabType.Single
			? generateTerminalName(existingNames)
			: "New Split View";

	const baseTab = {
		id,
		title,
		workspaceId,
		isNew: true,
	};

	if (type === TabType.Single) {
		return {
			...baseTab,
			type: TabType.Single,
		};
	}

	// For group tabs, just return the basic structure
	// Child tabs should be created separately and added via addChildTabToGroup
	return {
		...baseTab,
		type: TabType.Group,
		layout: null,
	};
};
