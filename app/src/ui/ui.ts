import {PullBarItem} from "./pull-bar";
import {App, Plugin} from "obsidian";
import {PushBarItem} from "./push-bar";
import {MultiSyncSettingsTab} from "./settings-tab";
import MultiSyncPlugin from "../main";

export class UI {
    public readonly pull: PullBarItem;
    public readonly push: PushBarItem;
    public readonly settings: MultiSyncSettingsTab;

    constructor(app: App, plugin: MultiSyncPlugin) {
        this.pull = new PullBarItem(plugin);
        this.push = new PushBarItem(plugin);
        this.settings = new MultiSyncSettingsTab(app, plugin);
    }
}