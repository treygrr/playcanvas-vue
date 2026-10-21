/**
 * The URL of a project's JSON file, which says which version is live and how to load it.
 */
export const projectUrl = (baseURL: string, slug: string): string =>
    `${baseURL.replace(/\/$/, '')}/projects/${encodeURIComponent(slug)}.json`;
