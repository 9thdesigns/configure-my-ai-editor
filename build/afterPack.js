// Ad-hoc code-sign the packaged .app when there is no real Developer ID
// certificate.
//
// Apple Silicon refuses to launch a binary carrying NO signature at all —
// macOS reports it as "'Configure My AI' is damaged and can't be opened" and
// won't index it for Spotlight. An ad-hoc signature (identity "-") satisfies
// that kernel requirement, so the app launches once the download quarantine
// is cleared (right-click → Open, System Settings → Privacy & Security →
// Open Anyway, or `xattr -dr com.apple.quarantine "<app>"`) and shows up in
// search like any other app.
//
// This runs ONLY for unsigned builds: when CSC_LINK is set, electron-builder's
// own signing step produces a real Developer ID signature and this hook stands
// aside so it doesn't stomp on it.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK) return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`  • ad-hoc signing (no certificate present)  file=${appPath}`)
  // --deep so the nested Electron Framework and helpers are signed too;
  // identity "-" is the ad-hoc pseudo-identity.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
