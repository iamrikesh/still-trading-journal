const { withAndroidManifest } = require('expo/config-plugins');

// A no-clean prebuild can retain tools:node="remove" from the former
// blockedPermissions entry. Update this one permission without regenerating
// native folders or altering the remaining storage/overlay permission blocks.
module.exports = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  const permissions = manifest['uses-permission'] ??= [];
  const name = 'android.permission.RECORD_AUDIO';
  let permission = permissions.find(item => item.$['android:name'] === name);
  if (!permission) { permission = { $: { 'android:name': name } }; permissions.push(permission); }
  delete permission.$['tools:node'];
  return config;
});
