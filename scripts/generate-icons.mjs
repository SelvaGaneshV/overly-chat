import { execSync } from "node:child_process";
import fs from "node:fs";

const input = process.argv[2] || "apps/desktop/assets/overly.png";
if (!fs.existsSync(input)) {
  console.error(`Input image not found: ${input}`);
  process.exit(1);
}

console.log(`[icons] Converting icon from: ${input}`);

// 1. Generate Windows ICO and macOS ICNS using png2icons
console.log("[icons] Generating Windows ICO and macOS ICNS with png2icons...");
execSync(`pnpm dlx png2icons "${input}" "apps/desktop/assets/icons/win/icon" -icowe -bc`, {
  stdio: "inherit",
});
execSync(`pnpm dlx png2icons "${input}" "apps/desktop/assets/icons/mac/icon" -icns -bc`, {
  stdio: "inherit",
});

// 2. Generate Web Favicon
if (!fs.existsSync("apps/web/public")) {
  fs.mkdirSync("apps/web/public", { recursive: true });
}
execSync(`pnpm dlx png2icons "${input}" "apps/web/public/favicon" -ico -bc`, { stdio: "inherit" });

// 3. Generate PNG resolutions using sharp
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
console.log("[icons] Generating PNG resolutions with sharp...");
for (const size of sizes) {
  const out = `apps/desktop/assets/icons/png/${size}x${size}.png`;
  execSync(`pnpm dlx sharp-cli -i "${input}" -o "${out}" resize ${size} ${size}`, {
    stdio: "inherit",
  });
}

// 4. Generate Web Bubble Logo
execSync(`pnpm dlx sharp-cli -i "${input}" -o "apps/web/src/assets/bubble-logo.png" resize 64 64`, {
  stdio: "inherit",
});

console.log("[icons] All icons generated successfully!");
