export type TPluginSettingsData = {
    githubToken: string;           // OAuth access token (stored locally)
    githubUsername: string;        // Authenticated GitHub username
    repoName: string;              // e.g. "obsidian-my-vault"
    repoApiHost: string;               // e.g. "obsidian-my-vault"
    repoHubHost: string;               // e.g. "obsidian-my-vault"
    repoUrl: string;               // e.g. "obsidian-my-vault"
    autoSync: boolean;             // auto-sync on file changes
    syncIntervalMs: number;        // debounce window
    excludePatterns: string[];     // glob patterns to ignore (e.g. ".obsidian/workspace")
    lastSyncTime: number;          // unix timestamp of last successful sync
    commitMessageTemplate: string; // e.g. "sync: {{datetime}}"
}

export const DEFAULT_SETTINGS: TPluginSettingsData = {
    githubToken: "",
    githubUsername: "",
    repoName: "",
    repoApiHost: "",
    repoHubHost: "",
    repoUrl: "",
    autoSync: true,
    syncIntervalMs: 3000,
    excludePatterns: [
        ".obsidian/workspace",
        ".obsidian/workspace.json",
        ".obsidian/plugins/*/data.json",
    ],
    lastSyncTime: 0,
    commitMessageTemplate: "sync: {{datetime}}",
};

export interface DeviceFlowResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}

export interface GitHubUser {
    login: string;
    id: number;
    name: string;
    email: string;
}

export interface GitHubRepo {
    name: string;
    full_name: string;
    private: boolean;
    clone_url: string;
    html_url: string;
}

export type SyncStatus =
    | "idle"
    | "pulling"
    | "pushing"
    | "conflict"
    | "error"
    | "connecting";

export interface ConflictFile {
    path: string;
    ours: string;   // local file content
    theirs: string; // remote file content
}

export interface SyncResult {
    success: boolean;
    conflictFiles: ConflictFile[];
    error?: string;
}
