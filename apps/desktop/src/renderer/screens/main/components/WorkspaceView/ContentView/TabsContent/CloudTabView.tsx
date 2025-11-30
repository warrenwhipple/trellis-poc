import type { CloudTab } from "renderer/stores/tabs/types";
import { WebView } from "./WebView";

interface CloudTabViewProps {
	tab: CloudTab;
}

export function CloudTabView({ tab }: CloudTabViewProps) {
	return (
		<div className="w-full h-full overflow-hidden bg-background">
			<WebView url={tab.url} />
		</div>
	);
}
