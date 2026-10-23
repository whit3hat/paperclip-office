// Override of upstream Character.ts: registers/unregisters each live sprite so
// src/ui/agentLabels.ts can read its world position every frame (nameplates,
// issue tags and state rings must follow the character as it walks), and routes
// its thought cloud through the bubble budget so a busy floor shows a few
// readable clouds instead of a pile.
import { Character as UpstreamCharacter } from "../../vendor/munder-difflin/src/renderer/src/scene/office/Character.js";
import { registerCharacter, unregisterCharacter } from "../ui/agentLabels.js";
import { registerBubbleHolder, unregisterBubbleHolder, type BubbleHolder } from "../ui/bubbleBudget.js";
import { t } from "../adapters/i18n.js";

const QUIET = () => new Set([t("office.activity.idle"), t("office.activity.waiting")]);

export { paintCup } from "../../vendor/munder-difflin/src/renderer/src/scene/office/Character.js";

export class Character extends UpstreamCharacter implements BubbleHolder {
  /** What upstream last asked this character to think, whether or not it is on screen. */
  private want: { text: string; tool?: string } | null = null;
  private shown = false;

  constructor(...args: ConstructorParameters<typeof UpstreamCharacter>) {
    super(...args);
    registerCharacter(this.agentId, this);
    registerBubbleHolder(this.agentId, this);
  }

  override showThought(text: string, tool?: string): void {
    if (QUIET().has(text.trim())) {
      this.hideThought();
      return;
    }
    this.want = { text, tool };
    // Already on screen: swap the text in place. Otherwise the budget decides, next frame.
    if (this.shown) super.showThought(text, tool);
  }

  override hideThought(): void {
    this.want = null;
    this.shown = false;
    super.hideThought();
  }

  wantsBubble(): boolean {
    return this.want !== null;
  }

  /** Where this character's cloud would hang. Feeds the budget's rect pass so two characters
   *  standing on the same spot — the walk-in, the roamers, the one pacing by the door — do not
   *  hang two clouds on top of each other. */
  bubbleAnchor(): { x: number; y: number } | null {
    const pos = this.getPixelPosition();
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  bubbleText(): string {
    return this.want?.text ?? "";
  }

  /** Driven by src/ui/bubbleBudget.ts: show the pending thought, or step aside for a louder one. */
  allowBubble(on: boolean): void {
    if (on === this.shown) return;
    if (!on) {
      this.shown = false;
      super.hideThought();
      return;
    }
    if (!this.want) return;
    this.shown = true;
    super.showThought(this.want.text, this.want.tool);
  }

  override destroy(): void {
    unregisterCharacter(this.agentId);
    unregisterBubbleHolder(this.agentId);
    super.destroy();
  }
}
