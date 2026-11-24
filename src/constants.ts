import {normalizePath, Platform} from "obsidian";

export const PLUGIN_ID         = "obsidian-multisync";
export const PLUGIN_TITLE      = "ScoutGitSync";
export const GIT_AUTHOR_NAME   = "scout57";
export const GIT_AUTHOR_EMAIL  = "kemnep.omck@gmail.com";
export const GIT_DIR           = ".git";
export const SYNC_DEBOUNCE_MS  = 3000;
export const SYNC_ON_OPEN      = true;
export const SYNC_ON_CLOSE     = true;
export const DEFAULT_BRANCH    = "master";


export const translatePath = (path: string) => {
    if(Platform.isDesktopApp && navigator.platform === "Win32") {
        return path.replace(/\//g, "\\");
    }
    return path;
}