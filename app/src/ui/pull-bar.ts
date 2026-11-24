import {Plugin} from "obsidian";
import {SyncStatus} from "../types";

type TPullStatus = 'pull' | 'in_process'

const STATUS_ICONS: Record<TPullStatus, string> = {
    pull: "↓ Pull",
    in_process: "↓ Pulling..",
};

export class PullBarItem {
    private el: HTMLElement;

    constructor(plugin: Plugin) {
        this.el = plugin.addStatusBarItem();
        this.el.style.cursor = "pointer";
        this.set("pull");
    }

    set(status: TPullStatus, detail?: string): void {
        const label = STATUS_ICONS[status];
        this.el.setText(detail ? `${label}: ${detail}` : label);
        this.el.setAttribute("data-sync-status", status);
    }

    onClick(handler: () => void): void {
        this.el.addEventListener("click", handler);
    }
}
