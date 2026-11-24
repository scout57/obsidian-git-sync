import {requestUrl} from "obsidian";
import {GitHubUser} from "../types";

async function ghFetch<T>(
    url: string,
    path: string,
    token: string,
    options: { method?: string; body?: object } = {}
): Promise<T> {
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

/** Get authenticated user info */
export async function getAuthenticatedUser(url: string, token: string): Promise<GitHubUser> {
    return ghFetch<GitHubUser>(url, "/user", token);
}

/** Check if a repo exists under the authenticated user */
export async function repoExists(
    url: string,
    token: string,
    username: string,
    repoName: string
): Promise<boolean> {
    const response = await requestUrl({
        url: `${url}/repos/${username}/${repoName}`,
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
        },
        throw: false,
    });
    return response.status === 200;
}