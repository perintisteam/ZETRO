import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const URL = `file://${path.join(ROOT, "index.html")}`;

async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#settingsBtn", { state: "visible" });

  await shot(page, "record-idle");

  await page.evaluate(() => {
    document.getElementById("idleOverlay")?.classList.add("hidden");
    const zoomBar = document.getElementById("zoomBar");
    zoomBar?.classList.remove("hidden");
    zoomBar?.classList.add("flex");
    const badge = document.getElementById("previewBadge");
    badge?.classList.remove("hidden");
    badge?.classList.add("flex");
    document.getElementById("selectScreenBtn")?.classList.add("hidden");
    const confirm = document.getElementById("confirmRecordBtn");
    confirm?.classList.remove("hidden");
    confirm && (confirm.disabled = false);
    document.getElementById("cancelPreviewBtn")?.classList.remove("hidden");
    const wrap = document.getElementById("previewWrap");
    if (wrap) wrap.style.background = "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)";
  });
  await shot(page, "record-preview");

  await page.evaluate(() => {
    const record = document.getElementById("recordView");
    const library = document.getElementById("libraryView");
    record?.classList.add("hidden");
    record?.classList.remove("flex");
    library?.classList.remove("hidden");
    library?.classList.add("flex");
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      const isLib = btn.id === "navLibraryBtn" || btn.classList.contains("nav-to-library");
      btn.classList.toggle("nav-tab-active", isLib);
      btn.classList.toggle("text-gpt-muted", !isLib);
    });
    const list = document.getElementById("recordingsList");
    if (!list) return;
    const items = [
      { name: "zetro-2026-05-19-14-30.mp4", date: "19 May 2026, 14:30", size: "12.4 MB" },
      { name: "zetro-2026-05-18-09-15.mp4", date: "18 May 2026, 09:15", size: "8.1 MB" },
      { name: "zetro-2026-05-17-21-02.mp4", date: "17 May 2026, 21:02", size: "24.7 MB" },
    ];
    list.innerHTML = items
      .map(
        (item) => `
      <article class="gpt-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <p class="truncate text-sm font-medium">${item.name}</p>
          <p class="text-xs text-gpt-muted">${item.date} · ${item.size}</p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs">Play</button>
          <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs">Open</button>
          <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs">Folder</button>
        </div>
      </article>`
      )
      .join("");
  });
  await shot(page, "library");

  await page.evaluate(() => {
    const settings = document.getElementById("settingsView");
    const btn = document.getElementById("settingsBtn");
    settings?.classList.remove("hidden");
    settings?.classList.add("flex");
    btn?.classList.add("hidden");
  });
  await shot(page, "settings");

  await page.evaluate(() => {
    const settings = document.getElementById("settingsView");
    const btn = document.getElementById("settingsBtn");
    settings?.classList.add("hidden");
    settings?.classList.remove("flex");
    btn?.classList.remove("hidden");
    const record = document.getElementById("recordView");
    const library = document.getElementById("libraryView");
    library?.classList.add("hidden");
    library?.classList.remove("flex");
    record?.classList.remove("hidden");
    record?.classList.add("flex");
    document.getElementById("idleOverlay")?.classList.remove("hidden");
    document.getElementById("zoomBar")?.classList.add("hidden");
    document.getElementById("previewBadge")?.classList.add("hidden");
    document.documentElement.classList.add("dark");
  });
  await shot(page, "record-dark");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
