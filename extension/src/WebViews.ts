import { window, ViewColumn, WebviewPanel } from "vscode";
import { Server } from "./Server";
import { Disposable } from "@hediet/std/disposable";

export const debugVisualizer = "debugVisualizer";

export class WebViews {
	private readonly debugVisualizations = new Map<WebviewPanel, WebView>();

	public readonly dispose = Disposable.fn();

	constructor(private readonly server: Server) {
		this.dispose.track(
			window.registerWebviewPanelSerializer(debugVisualizer, {
				deserializeWebviewPanel: async (panel, state) => {
					this.restore(panel);
				},
			})
		);

		this.dispose.track({
			dispose: () => {
				for (const panel of this.debugVisualizations.keys()) {
					panel.dispose();
				}
			},
		});
	}

	public createNew() {
		const panel = window.createWebviewPanel(
			debugVisualizer,
			"Debug Visualizer",
			ViewColumn.Two,
			{ enableScripts: true }
		);

		this.setupView(panel);
	}

	public restore(webviewPanel: WebviewPanel) {
		this.setupView(webviewPanel);
	}

	private setupView(webviewPanel: WebviewPanel) {
		webviewPanel.webview.html = getHtml(this.server);
		const view = new WebView(webviewPanel);
		this.debugVisualizations.set(webviewPanel, view);
		webviewPanel.onDidDispose(() => {
			this.debugVisualizations.delete(webviewPanel);
		});
	}
}

export class WebView {
	constructor(private readonly webviewPanel: WebviewPanel) {}
}

export function getHtml(server: Server) {
	const isDev = !!process.env.USE_DEV_UI;
	return `
        <html>
			<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';">
            <style>
                html { height: 100%; width: 100%; padding: 0; margin: 0; }
                body { height: 100%; width: 100%; padding: 0; margin: 0; }
                iframe { height: 100%; width: 100%; padding: 0; margin: 0; border: 0; display: block; }
            </style>
            </head>
			<body>
				<script>
					window.webViewData = ${JSON.stringify({
						serverSecret: server.secret,
						serverPort: server.port,
					})};
					const api = window.VsCodeApi = acquireVsCodeApi();
					window.addEventListener('message', event => {
						if (event.source === window.frames[0]) {
							if (event.data.command === "setState") {
								console.log("setState", event.data.state);
								api.setState(event.data.state);
							}
							if (event.data.command === "getState") {
								console.log("getState, sent ", api.getState());
								window.frames[0].postMessage({ command: "getStateResult", state: api.getState() }, "*");
							}
						}
					});
				</script>
				${
					isDev
						? `<iframe sandbox="allow-top-navigation allow-scripts allow-same-origin allow-popups allow-pointer-lock allow-forms" src="${server.getIndexUrl(
								{ mode: "webViewIFrame" }
						  )}"></iframe>`
						: `<script type="text/javascript" src="${server.mainBundleUrl}"></script>`
				}
            </body>
        </html>
    `;
}
