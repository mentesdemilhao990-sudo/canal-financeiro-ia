// Acesso mínimo à API do GitHub (só para a issue de aprovação de comentários).
// Usa o GITHUB_TOKEN que o próprio Actions fornece; nada de token pessoal.

export const MARCADOR_ISSUE = "<!-- painel-comentarios -->";

export class GitHub {
  constructor({ token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY, fetch: f = globalThis.fetch } = {}) {
    this.token = token;
    this.repo = repo;
    this.fetch = f;
  }
  get disponivel() {
    return Boolean(this.token && this.repo);
  }
  async req(metodo, caminho, corpo) {
    const r = await this.fetch(`https://api.github.com/repos/${this.repo}${caminho}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(corpo ? { "content-type": "application/json" } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho}: ${j.message ?? r.status}`);
    return j;
  }
  async issueDeAprovacao() {
    const lista = await this.req("GET", "/issues?state=open&per_page=100");
    return lista.find((i) => !i.pull_request && (i.body ?? "").includes(MARCADOR_ISSUE)) ?? null;
  }
  /** Cria ou atualiza a issue de aprovação. Só cria se houver algo pendente. */
  async sincronizarIssue(titulo, corpo, { criarSeVazia = false, pendentes = 0 } = {}) {
    const atual = await this.issueDeAprovacao();
    if (atual) {
      if (atual.body === corpo && atual.title === titulo) return atual;
      return this.req("PATCH", `/issues/${atual.number}`, { title: titulo, body: corpo });
    }
    if (!pendentes && !criarSeVazia) return null;
    return this.req("POST", "/issues", { title: titulo, body: corpo });
  }
}
