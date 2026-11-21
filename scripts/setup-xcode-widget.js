#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sPath = path.join(src, entry.name);
    const dPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sPath, dPath);
    } else {
      fs.copyFileSync(sPath, dPath);
    }
  }
}

const projectRoot = process.cwd();
const iosAppDir = path.join(projectRoot, 'ios', 'App');
const pbxprojPath = path.join(iosAppDir, 'App.xcodeproj', 'project.pbxproj');

if (!fs.existsSync(pbxprojPath)) {
  console.error('Error: project.pbxproj not found at', pbxprojPath);
  process.exit(1);
}

copyDirRecursive(
  path.join(projectRoot, 'widget-sources', 'MasareefWidget'),
  path.join(iosAppDir, 'MasareefWidget')
);
copyDirRecursive(
  path.join(projectRoot, 'widget-sources', 'App', 'Assets.xcassets'),
  path.join(iosAppDir, 'App', 'Assets.xcassets')
);
if (fs.existsSync(path.join(projectRoot, 'widget-sources', 'App', 'App.entitlements'))) {
  fs.copyFileSync(
    path.join(projectRoot, 'widget-sources', 'App', 'App.entitlements'),
    path.join(iosAppDir, 'App', 'App.entitlements')
  );
}

const proj = xcode.project(pbxprojPath);
proj.parseSync();

const appBundleId = process.env.BUNDLE_ID || 'com.alhawari.masareef';
const widgetBundleId = process.env.WIDGET_BUNDLE_ID || 'com.alhawari.masareef.widget';

proj.updateBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', appBundleId);
proj.updateBuildProperty('CODE_SIGN_ENTITLEMENTS', 'App/App.entitlements');
proj.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', '16.0');

const existingTargets = proj.hash.project.objects.PBXNativeTarget || {};
const alreadyHasWidget = Object.values(existingTargets).some(
  (t) => t && (t.name === 'MasareefWidget' || t.name === '"MasareefWidget"')
);

if (!alreadyHasWidget && fs.existsSync(path.join(iosAppDir, 'MasareefWidget', 'MasareefWidget.swift'))) {
  const widgetTarget = proj.addTarget(
    'MasareefWidget',
    'app_extension',
    'MasareefWidget',
    widgetBundleId
  );

  if (widgetTarget && widgetTarget.uuid) {
    try {
      proj.addSourceFile('MasareefWidget/MasareefWidget.swift', { target: widgetTarget.uuid });
    } catch (e) {}

    const configs = proj.pbxXCBuildConfigurationSection();
    for (const key in configs) {
      const cfg = configs[key];
      if (!cfg || typeof cfg !== 'object' || !cfg.buildSettings) continue;
      if (
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === widgetBundleId ||
        cfg.buildSettings.INFOPLIST_FILE === 'MasareefWidget/Info.plist'
      ) {
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = 'MasareefWidget/MasareefWidget.entitlements';
        cfg.buildSettings.INFOPLIST_FILE = 'MasareefWidget/Info.plist';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
        cfg.buildSettings.SWIFT_VERSION = '5.0';
        cfg.buildSettings.CODE_SIGN_STYLE = 'Manual';
      }
    }
  }
}

fs.writeFileSync(pbxprojPath, proj.writeSync(), 'utf8');
console.log('Xcode project configured successfully.');
