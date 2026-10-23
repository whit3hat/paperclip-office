import { createRoot } from "react-dom/client";
import { OfficePage, OfficeWidget } from "../src/ui/index.js";
import { useStore } from "../src/adapters/store.js";
import { sceneSnapshot } from "../src/ui/agentLabels.js";
import { LAYOUT_PRESETS } from "../src/layout/presets.js";
import { COMPANY_ID, COMPANY_PREFIX, OFFICE_DATA } from "./fixtures.js";

// Lets scripts/screenshots.mjs wait for the characters to finish walking in before it shoots.
(window as unknown as { __officeScene?: typeof sceneSnapshot }).__officeScene = sceneSnapshot;

const params = new URLSearchParams(window.location.search);

const layoutParam = params.get("layout");
if (layoutParam) {
  const preset = LAYOUT_PRESETS.find((p) => p.id === layoutParam);
  if (preset && OFFICE_DATA.layout) {
    OFFICE_DATA.layout.preset = preset.id;
    OFFICE_DATA.layout.spec = preset.spec;
  }
}
const context = {
  companyId: COMPANY_ID,
  companyPrefix: COMPANY_PREFIX,
  projectId: null,
  entityId: null,
  entityType: null,
  userId: "demo-user",
};

if (params.get("open") === "decisions") useStore.setState({ decisionBoxOpen: true });
const agentParam = params.get("agent");
if (agentParam) useStore.setState({ selectedId: agentParam });

const root = createRoot(document.getElementById("root")!);
if (params.get("widget") === "1") {
  root.render(<OfficeWidget context={context} />);
} else {
  root.render(<OfficePage context={context} />);
}
