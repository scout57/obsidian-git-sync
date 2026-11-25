import {App, Plugin} from "obsidian";
import {BarButton} from "./button-bar";
import {MultiSyncSettingsTab} from "./settings-tab";
import MultiSyncPlugin from "../main";

export class UI {
    // public readonly clone: BarButton;
    public readonly pull: BarButton;
    public readonly push: BarButton;
    public readonly settings: MultiSyncSettingsTab;

    constructor(plugin: MultiSyncPlugin) {
        // this.clone = new BarButton(plugin, 'Clone', '+');
        this.pull = new BarButton(plugin, 'Pull', '↓');
        this.push = new BarButton(plugin, 'Push', '↑');
        this.settings = new MultiSyncSettingsTab(plugin);
    }
}