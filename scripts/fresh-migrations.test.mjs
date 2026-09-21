import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMigrationArguments } from './test-fresh-migrations.mjs';

test('migration probe imports without running and defaults to a fresh schema', () => {
  assert.deepEqual(parseMigrationArguments([]), { artifactArgument: null, fromVersion: null });
  assert.deepEqual(parseMigrationArguments(['/tmp/validated.jar']), { artifactArgument: '/tmp/validated.jar', fromVersion: null });
});

test('preserved V6/V7 and V8 baselines accept either argument order', () => {
  for (const version of [6, 7, 8]) {
    const flag = `--upgrade-from-v${version}`;
    const expected = { artifactArgument: '/tmp/validated.jar', fromVersion: version };
    assert.deepEqual(parseMigrationArguments([flag, '/tmp/validated.jar']), expected);
    assert.deepEqual(parseMigrationArguments(['/tmp/validated.jar', flag]), expected);
    assert.deepEqual(parseMigrationArguments([flag]), { artifactArgument: null, fromVersion: version });
  }
});

test('migration probe rejects duplicate, conflicting and unsupported baselines', () => {
  for (const options of [
    ['--upgrade-from-v6', '--upgrade-from-v7'],
    ['--upgrade-from-v6', '--upgrade-from-v6'],
    ['--upgrade-from-v7', '--upgrade-from-v7'],
    ['--upgrade-from-v8', '--upgrade-from-v8'],
    ['--upgrade-from-v7', '--upgrade-from-v8'],
    ['--upgrade-from-v9'], ['--skip-cleanup'], ['--help'],
    ['one.jar', 'two.jar'],
  ]) assert.throws(() => parseMigrationArguments(options));
});

test('V9 adds empty authorization tables and does not publish content or rewrite previews', () => {
  const checker = readFileSync(new URL('./java/FreshMigrationCheck.java', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../database/migration/V9__local_product_authorizations.sql', import.meta.url), 'utf8');
  const tables = [...migration.matchAll(/^CREATE TABLE (\w+)/gm)].map(match => match[1]);
  assert.deepEqual(tables, ['mp_local_task_release', 'mp_run_product_adoption']);
  assert.doesNotMatch(migration, /^\s*(INSERT|UPDATE|DELETE|REPLACE)\s/mi);
  for (const table of tables) assert.ok(checker.includes(`'${table}'`));
  for (const constraint of [...migration.matchAll(/CONSTRAINT (\w+)/g)].map(match => match[1])) assert.ok(checker.includes(`'${constraint}'`), constraint);
  assert.match(checker, /require\(releases==0&&adoptions==0\)/);
  assert.match(checker, /originalTask\.equals\(taskSnapshot\(connection\)\)/);
  assert.match(checker, /originalPreview\.equals\(previewSnapshot\(connection\)\)/);
  assert.match(checker, /'CLOSED','REVIEW_PREVIEW'/);
  assert.match(checker, /'migration-sentinel','REVIEW'/);
  assert.match(checker, /from\.equals\("8"\)/);
});

test('standalone P7 checker names all five frozen tables and checks actual owner enforcement', () => {
  const checker = readFileSync(new URL('./java/FreshMigrationCheck.java', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../database/migration/V8__operations_privacy_and_retention.sql', import.meta.url), 'utf8');
  const tables = [...migration.matchAll(/^CREATE TABLE (\w+)/gm)].map(match => match[1]);
  assert.equal(tables.length, 5);
  for (const table of tables) assert.ok(checker.includes(`'${table}'`), table);
  assert.match(checker, /constraint_name='ck_job_type_owner'.*enforced='YES'/);
  assert.match(checker, /invalid\.getErrorCode\(\)==3819/);
  assert.match(checker, /accepted==8&&rejected==28/);
  assert.match(checker, /finally \{connection\.rollback\(\);connection\.setAutoCommit\(true\);\}/);
  assert.match(checker, /originalStudent\.equals\(studentSnapshot\(connection\)\)/);
  assert.match(checker, /originalJob\.equals\(jobSnapshot\(connection\)\)/);
  assert.match(checker, /originalRoleGrants\.equals\(roleGrantSnapshot\(connection\)\)/);
});

test('migration checks cover every new menu without granting roles', () => {
  const checker = readFileSync(new URL('./java/FreshMigrationCheck.java', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../database/migration/V8__operations_privacy_and_retention.sql', import.meta.url), 'utf8');
  const menuIds = [...migration.matchAll(/^ \((70\d\d),/gm)].map(match => match[1]);
  assert.equal(menuIds.length, 16);
  assert.ok(checker.includes(`String menuIds="${menuIds.join(',')}"`));
  assert.ok(checker.includes('require(scalar(connection,"SELECT COUNT(*) FROM sys_role_menu WHERE menu_id IN ("+menuIds+")")==0)'));
  const permissions = [...migration.matchAll(/'(majorpilot:[a-z:]+)'/g)].map(match => match[1]);
  assert.equal(permissions.length, 15);
  for (const permission of permissions) assert.ok(checker.includes(`"${permission}"`));
});
