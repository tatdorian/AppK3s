import type { DbApplication } from '../db/schema.js';

/**
 * GithubService
 * Fetches a docker-compose.yml (or any file) from a GitHub repository at deploy time.
 * Uses the GitHub raw content API — no git binary required.
 * Supports both public repos (no auth) and private repos (PAT token).
 */
export class GithubService {
  /**
   * Extracts { owner, repo } from various GitHub URL formats:
   *   https://github.com/owner/repo
   *   https://github.com/owner/repo.git
   *   github.com/owner/repo
   *   owner/repo  (shorthand)
   */
  parseRepo(githubUrl: string): { owner: string; repo: string } {
    let cleaned = githubUrl.trim();

    // Strip protocol
    cleaned = cleaned.replace(/^https?:\/\//, '');
    // Strip .git suffix
    cleaned = cleaned.replace(/\.git$/, '');
    // Strip trailing slash
    cleaned = cleaned.replace(/\/$/, '');

    // cleaned is now one of:
    //   github.com/owner/repo[/extra...]
    //   owner/repo[/extra...]
    const parts = cleaned.split('/');

    let owner: string;
    let repo: string;

    if (parts[0].toLowerCase() === 'github.com') {
      // github.com/owner/repo
      owner = parts[1];
      repo = parts[2];
    } else if (parts.length >= 2) {
      // owner/repo  (shorthand without hostname)
      owner = parts[0];
      repo = parts[1];
    } else {
      throw new Error(`Impossible de parser l'URL GitHub : "${githubUrl}". Format attendu : https://github.com/utilisateur/repo`);
    }

    if (!owner || !repo) {
      throw new Error(`URL GitHub invalide : "${githubUrl}". Le propriétaire et le nom du dépôt sont requis.`);
    }

    return { owner, repo };
  }

  /**
   * Fetches the compose file content from GitHub.
   * - Public repos: no Authorization header
   * - Private repos: Authorization: token {pat}
   * - Automatically falls back from 'main' to 'master' on 404
   */
  async fetchComposeContent(app: DbApplication): Promise<string> {
    if (!app.githubUrl) {
      throw new Error('githubUrl est requis pour le type github');
    }

    const { owner, repo } = this.parseRepo(app.githubUrl);
    const branch = app.githubBranch ?? 'main';
    const composePath = app.githubComposePath ?? 'docker-compose.yml';

    const headers: Record<string, string> = {
      'User-Agent': 'AppK3s/1.0',
    };

    if (app.githubToken) {
      headers['Authorization'] = `token ${app.githubToken}`;
    }

    const buildUrl = (b: string) =>
      `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${composePath}`;

    let response = await fetch(buildUrl(branch), { headers });

    // Fallback: if branch is 'main' and we get 404, try 'master'
    if (response.status === 404 && branch === 'main') {
      response = await fetch(buildUrl('master'), { headers });
    }

    if (!response.ok) {
      const hint =
        response.status === 404
          ? `Fichier introuvable dans ${owner}/${repo} (branche: ${branch}, chemin: ${composePath}). Vérifiez l'URL, la branche et le chemin du fichier compose.`
          : response.status === 401 || response.status === 403
          ? `Accès refusé (HTTP ${response.status}). Vérifiez que le token PAT est valide et dispose d'un accès en lecture au dépôt.`
          : `GitHub a répondu HTTP ${response.status}.`;
      throw new Error(`Échec de la récupération depuis GitHub : ${hint}`);
    }

    const content = await response.text();

    if (!content.trim()) {
      throw new Error(`Le fichier "${composePath}" récupéré depuis GitHub est vide.`);
    }

    return content;
  }
}
