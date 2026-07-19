// Host metadata for O-UI-005 host pinning (evidence-requirements: host_image_id,
// chromium_version, viewport). Comparisons are admitted only between captures
// from the same host image (system font rasterization is host-dependent).
import { createHash } from "node:crypto";
import os from "node:os";

export async function hostMetadata(browser, page) {
  const chromium_version = await browser.version();
  // font rasterization probe: measure + rasterize probe glyphs under a monospace stack
  const fontProbe = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 32;
    const ctx = cv.getContext("2d");
    ctx.font = '16px ui-monospace, "Cascadia Mono", Menlo, monospace';
    const w = [ctx.measureText("i").width, ctx.measureText("m").width, ctx.measureText("imw").width];
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = "#000"; ctx.textBaseline = "top";
    ctx.fillText("imwgy", 0, 0);
    return { widths: w, raster: cv.toDataURL() };
  });
  const host_image_id = "sha256:" + createHash("sha256").update(JSON.stringify({
    chromium_version, platform: process.platform, arch: process.arch,
    os_release: os.release(), fontProbe,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  })).digest("hex");
  return {
    runtime: process.version,
    operating_system: `${process.platform}/${process.arch} ${os.release()}`,
    chromium_version,
    host_image_id,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  };
}
