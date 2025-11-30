import { useSplitTabHorizontal, useSplitTabVertical } from "renderer/stores";
import type { CloudTab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "./TabContentContextMenu";
import { WebView } from "./WebView";

interface CloudTabViewProps {
	tab: CloudTab;
}

export function CloudTabView({ tab }: CloudTabViewProps) {
	const splitTabHorizontal = useSplitTabHorizontal();
	const splitTabVertical = useSplitTabVertical();

	return (
		<TabContentContextMenu
			onSplitHorizontal={() => splitTabHorizontal(tab.workspaceId, tab.id)}
			onSplitVertical={() => splitTabVertical(tab.workspaceId, tab.id)}
		>
			<div className="w-full h-full overflow-hidden bg-background">
				<WebView url={tab.url} />
			</div>
		</TabContentContextMenu>
	);
}
