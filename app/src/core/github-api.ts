import {requestUrl} from "obsidian";
import {GitHubUser} from "../types";
import {Settings} from "./index";

export class GitHubApi {

    constructor(protected readonly settings: Settings) {
    }

    async getAuthenticatedUser(): Promise<GitHubUser> {
        return this.request<GitHubUser>("/user");
    }

    async repoExists(): Promise<boolean> {
        const username = this.settings.data.githubUsername;
        const repoName = this.settings.data.repoName;

        try {
            await this.request<{}>(`/repos/${username}/${repoName}`);
            return true;
        } catch {
            return false;
        }
    }

    private async request<T>(path: string, options: { method?: string; body?: object } = {}): Promise<T> {
        const url = this.settings.data.repoApiHost;
        const token = this.settings.data.githubToken;

        const response = await requestUrl({
            url: `${url}${path}`,
            method: options.method ?? "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            throw: false,
        });

        if (response.status >= 400) {
            const err = response.json as { message?: string };
            throw new Error(`GitHub API error ${response.status}: ${err.message ?? "unknown"}`);
        }

        return response.json as T;
    }
}