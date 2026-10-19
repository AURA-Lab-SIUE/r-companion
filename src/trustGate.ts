// Restricted Mode: one modal with one button, then the paused action resumes by itself once the
// folder is trusted. Pure: the VS Code calls come in through TrustHost, so the unit tests use fakes.

export interface TrustHost {
  isTrusted(): boolean;
  /** Shows a modal (it never hides by itself) and resolves to the button chosen, or undefined. */
  askModal(message: string, detail: string, button: string): Thenable<string | undefined>;
  /** Opens VS Code's Workspace Trust page (workbench.trust.manage). */
  openTrustPage(): Thenable<unknown>;
  now(): number;
}

export const TRUST_BUTTON = 'Trust this folder';
/** A paused action left waiting longer than this is dropped, so it never starts by surprise. */
export const PENDING_MS = 15 * 60 * 1000;

export class TrustGate {
  private pending: { run: () => unknown; at: number } | undefined;
  constructor(private host: TrustHost) {}

  /** True when the folder is trusted. Otherwise asks once and keeps `rerun` for after trust. */
  async require(what: string, rerun: () => unknown): Promise<boolean> {
    if (this.host.isTrusted()) return true;
    this.pending = { run: rerun, at: this.host.now() };
    const b = await this.host.askModal(
      `This folder is open in Restricted Mode, so ${what} waits until you trust it.`,
      `Select ${TRUST_BUTTON}, then select Trust on the page that opens. Trust only your own course folder. The extension carries on by itself after that.`,
      TRUST_BUTTON,
    );
    if (b === TRUST_BUTTON) await this.host.openTrustPage();
    else this.pending = undefined;
    return false;
  }

  /** Wire to vscode.workspace.onDidGrantWorkspaceTrust. Runs the paused action once. */
  granted(): unknown {
    const p = this.pending;
    this.pending = undefined;
    if (!p || this.host.now() - p.at > PENDING_MS) return undefined;
    return p.run();
  }

  get waiting(): boolean {
    return this.pending !== undefined;
  }
}
