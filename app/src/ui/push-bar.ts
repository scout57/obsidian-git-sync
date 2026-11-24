import {Plugin} from "obsidian";
import {SyncStatus} from "../types";

type TPushStatus = 'push' | 'in_process'

const STATUS_ICONS: Record<TPushStatus, string> = {
    push: "↑ Push",
    in_process: "↑ Pushing..",
};

export class PushBarItem {
    private el: HTMLElement;

    constructor(plugin: Plugin) {
        this.el = plugin.addStatusBarItem();
        this.el.style.cursor = "pointer";
        this.set("push");
    }

    set(status: TPushStatus, detail?: string): void {
        const label = STATUS_ICONS[status];
        this.el.setText(detail ? `${label}: ${detail}` : label);
        this.el.setAttribute("data-sync-status", status);
    }

    onClick(handler: () => void): void {
        this.el.addEventListener("click", handler);
    }
}
