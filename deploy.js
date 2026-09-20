const fs = require("fs");
const { execSync } = require("child_process");

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();

// Generate CalVer stamp: v.yy.mmdd.hh.mm
const yy = String(now.getFullYear()).slice(-2);
const mm = pad(now.getMonth() + 1);
const dd = pad(now.getDate());
const hh = pad(now.getHours());
const min = pad(now.getMinutes());
const version = `v.${yy}.${mm}${dd}.${hh}.${min}`;

console.log(`\n========================================`);
console.log(`🚀 AUTOMATED RELEASE: ${version}`);
console.log(`========================================\n`);

// 1. Update index.html
const indexPath = "index.html";
let indexContent = fs.readFileSync(indexPath, "utf8");
indexContent = indexContent.replace(
  /<span class="version-tag">.*?<\/span>/,
  `<span class="version-tag">${version}<\/span>`
);
fs.writeFileSync(indexPath, indexContent, "utf8");
console.log(`✅ Updated ${indexPath} -> ${version}`);

// 2. Update README.md
const readmePath = "README.md";
let readmeContent = fs.readFileSync(readmePath, "utf8");
readmeContent = readmeContent.replace(
  /versión-v\.[0-9.]+-yellow\.svg/,
  `versión-${version}-yellow.svg`
);
readmeContent = readmeContent.replace(
  /\*\*Versión actual\*\*: `v\.[0-9.]+`/,
  `**Versión actual**: \`${version}\``
);
fs.writeFileSync(readmePath, readmeContent, "utf8");
console.log(`✅ Updated ${readmePath} -> ${version}`);

// 3. Git commit & push
console.log("\n📦 Committing changes to Git...");
execSync("git add .", { stdio: "inherit" });

try {
  execSync(`git commit -m "chore: release ${version}"`, { stdio: "inherit" });
  console.log(`✅ Committed: chore: release ${version}`);
} catch {
  console.log("ℹ️ No uncommitted changes detected.");
}

console.log("\n⬆️ Pushing to GitHub (origin/main)...");
execSync("git push origin main", { stdio: "inherit" });
console.log("✅ Pushed successfully to GitHub.");

// 4. Deploy to Surge
console.log("\n🌐 Deploying to Surge (hora-web.surge.sh)...");
execSync("surge . --domain hora-web.surge.sh", { stdio: "inherit" });
console.log(`\n🎉 Deployed successfully! Available at: https://hora-web.surge.sh\n`);
