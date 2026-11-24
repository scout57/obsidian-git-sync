import {Plugin} from "obsidian";

type TPushStatus = 'idle' | 'in_process'

export class BarButton {
    private el: HTMLElement;

    constructor(plugin: Plugin, protected readonly name: string, protected readonly icon: string) {
        this.el = plugin.addStatusBarItem();
        this.el.style.cursor = "pointer";
        this.set("idle");
    }

    set(status: TPushStatus, detail?: string): void {
        let label = status == 'idle' ? this.name : 'process..';
        label = `${this.icon} ${label}`;

        if (detail) {
            label = `${label}: ${detail}`
        }

        this.el.setText(label);
        this.el.setAttribute("data-sync-status", status);
    }

    onClick(handler: () => void | Promise<void>): void {
        this.el.addEventListener("click", async () => {
            try {
                this.set('in_process')
                await handler();
            } finally {
                this.set("idle")
            }
        });
    }
}
