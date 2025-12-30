import type { SettingsSection } from "renderer/stores";

export interface SettingsItem {
	id: string;
	section: SettingsSection;
	title: string;
	description: string;
	keywords: string[];
}

export const SETTINGS_ITEMS: SettingsItem[] = [
	// Account
	{
		id: "account-profile",
		section: "account",
		title: "Profile",
		description: "Your profile information",
		keywords: ["name", "email", "avatar", "user"],
	},
	{
		id: "account-version",
		section: "account",
		title: "Version",
		description: "App version and updates",
		keywords: ["version", "update", "check for updates", "app version"],
	},
	{
		id: "account-signout",
		section: "account",
		title: "Sign Out",
		description: "Sign out of your account",
		keywords: ["sign out", "logout", "log out"],
	},

	// Appearance
	{
		id: "appearance-theme",
		section: "appearance",
		title: "Theme",
		description: "Choose your theme",
		keywords: ["theme", "dark", "light", "dark mode", "light mode", "colors"],
	},
	{
		id: "appearance-markdown",
		section: "appearance",
		title: "Markdown Style",
		description: "Rendering style for markdown files",
		keywords: ["markdown", "style", "tufte", "rendering"],
	},
	{
		id: "appearance-custom-themes",
		section: "appearance",
		title: "Custom Themes",
		description: "Import custom theme files",
		keywords: ["custom", "themes", "import", "json"],
	},

	// Ringtones
	{
		id: "ringtones-notification",
		section: "ringtones",
		title: "Notification Sound",
		description: "Choose the notification sound for completed tasks",
		keywords: [
			"notification",
			"sound",
			"ringtone",
			"audio",
			"alert",
			"bell",
			"tone",
		],
	},

	// Keyboard Shortcuts
	{
		id: "keyboard-shortcuts",
		section: "keyboard",
		title: "Keyboard Shortcuts",
		description: "View all available keyboard shortcuts",
		keywords: [
			"keyboard",
			"shortcuts",
			"hotkeys",
			"keys",
			"bindings",
			"terminal",
			"workspace",
			"window",
		],
	},

	// Presets
	{
		id: "presets-terminal",
		section: "presets",
		title: "Terminal Presets",
		description: "Pre-configured terminal commands",
		keywords: [
			"preset",
			"terminal",
			"commands",
			"claude",
			"codex",
			"gemini",
			"cursor",
			"opencode",
			"agent",
			"launch",
		],
	},

	// Behavior
	{
		id: "behavior-confirm-quit",
		section: "behavior",
		title: "Confirm before quitting",
		description: "Show a confirmation dialog when quitting the app",
		keywords: ["confirm", "quit", "quitting", "exit", "close", "dialog"],
	},
];

export function searchSettings(query: string): SettingsItem[] {
	if (!query.trim()) return SETTINGS_ITEMS;

	const q = query.toLowerCase();
	return SETTINGS_ITEMS.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.keywords.some((kw) => kw.toLowerCase().includes(q)),
	);
}

export function getMatchCountBySection(
	query: string,
): Record<SettingsSection, number> {
	const matches = searchSettings(query);
	const counts: Record<string, number> = {};

	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}

	return counts as Record<SettingsSection, number>;
}

export function getMatchingItemsForSection(
	query: string,
	section: SettingsSection,
): SettingsItem[] {
	return searchSettings(query).filter((item) => item.section === section);
}
