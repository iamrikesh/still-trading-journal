import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// Check the packaged artifact, not just Gradle's dependency declarations.
// Run after a native build with JAVA_HOME configured (see Lesson 2).
const apk = resolve(process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk');
const executable = process.platform === 'win32' ? 'jar.exe' : 'jar';
const jar = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', executable) : executable;
const entries = new Set(execFileSync(jar, ['tf', apk], { encoding: 'utf8' }).split(/\r?\n/));
const abis = [...entries]
  .filter(name => /^lib\/[^/]+\/libexpo-sqlite\.so$/.test(name))
  .map(name => name.split('/')[1]);
assert.ok(abis.length > 0, 'APK is missing native Expo SQLite.');
for (const abi of abis) {
  assert.ok(entries.has(`lib/${abi}/libcrypto.so`), `APK is missing SQLCipher runtime libcrypto.so for ${abi}.`);
}
console.log(`SQLCipher packaging check passed for: ${abis.join(', ')}. Device runtime verification is still required.`);
