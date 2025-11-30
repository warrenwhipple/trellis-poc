import { Button } from "@superset/ui/button";
import { HiMiniXMark } from "react-icons/hi2";
import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { type CloudTab, type Tab, TabType } from "renderer/stores";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { WebView } from "../WebView";

interface GroupTabPaneProps {
	tabId: string;
	path: MosaicBranch[];
	childTab: Tab;
	isActive: boolean;
	workspaceId: string;
	groupId: string;
	splitTabHorizontal: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	splitTabVertical: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	removeChildTabFromGroup: (groupId: string, tabId: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
}

export function GroupTabPane({
	tabId,
	path,
	childTab,
	isActive,
	workspaceId,
	groupId,
	splitTabHorizontal,
	splitTabVertical,
	removeChildTabFromGroup,
	setActiveTab,
}: GroupTabPaneProps) {
	const _handleFocus = () => {
		setActiveTab(workspaceId, tabId);
	};

	const handleCloseTab = (e: React.MouseEvent) => {
		e.stopPropagation();
		removeChildTabFromGroup(groupId, tabId);
	};

	const renderContent = () => {
		if (childTab.type === TabType.Cloud) {
			return <WebView url={(childTab as CloudTab).url} />;
		}
		return <Terminal tabId={tabId} workspaceId={workspaceId} />;
	};

	return (
		<MosaicWindow<string>
			path={path}
			title={childTab.title}
			toolbarControls={
				<Button
					variant="link"
					size="icon"
					onClick={handleCloseTab}
					title="Close pane"
					className=" hover:text-white/80"
				>
					<HiMiniXMark className="size-4" />
				</Button>
			}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitTabHorizontal(workspaceId, tabId, path)}
				onSplitVertical={() => splitTabVertical(workspaceId, tabId, path)}
				onClosePane={() => removeChildTabFromGroup(groupId, tabId)}
			>
				<div className="w-full h-full overflow-hidden">{renderContent()}</div>
			</TabContentContextMenu>
		</MosaicWindow>
	);
}
