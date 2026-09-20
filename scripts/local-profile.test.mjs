import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLocalProfile, requireMatchingProfile } from './local-profile.mjs';
test('normal startup chooses the product local profile, synthetic P0 is explicit', () => {
  assert.equal(selectLocalProfile([]), 'local'); assert.equal(selectLocalProfile(['--infra-only']), 'local');
  assert.equal(selectLocalProfile(['--profile=p0']), 'p0'); assert.equal(selectLocalProfile(['--profile=local']), 'local');
});
test('unsupported, ambiguous and malformed profiles are rejected before process operations', () => {
  for (const args of [['--profile=production'], ['--profile=p0', '--profile=local'], ['--profile'], ['--profiles=local']]) assert.throws(() => selectLocalProfile(args));
});
test('an existing backend from another profile cannot silently satisfy startup', () => {
  assert.doesNotThrow(() => requireMatchingProfile(null, 'local'));
  assert.doesNotThrow(() => requireMatchingProfile({ identity: 'java -jar fixture.jar --spring.profiles.active=local' }, 'local'));
  assert.throws(() => requireMatchingProfile({ identity: 'java -jar fixture.jar --spring.profiles.active=p0' }, 'local'));
  assert.throws(() => requireMatchingProfile({ identity: 'java -jar fixture.jar --spring.profiles.active=p00' }, 'p0'));
});
