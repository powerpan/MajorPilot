import { constants, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './local-config.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Copy a completed build; never run a Spring Boot nested jar from mutable target/. */
export function materializeBackendArtifact({
  source = path.join(ROOT, 'backend/ruoyi-admin/target/ruoyi-admin.jar'),
  runtimeDirectory = path.join(ROOT, 'data/runtime'),
} = {}) {
  const sourceStat = lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('Backend build must be a regular file');
  const bytes = readFileSync(source);
  const sha256 = digest(bytes);
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  const directoryStat = lstatSync(runtimeDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Runtime artifact directory must be a regular directory');
  const artifactPath = path.join(runtimeDirectory, `ruoyi-admin-${sha256}.jar`);
  const validateExisting = () => {
    const stat = lstatSync(artifactPath);
    if (!stat.isFile() || stat.isSymbolicLink() || digest(readFileSync(artifactPath)) !== sha256) {
      throw new Error('Runtime artifact integrity check failed; refusing to overwrite or launch it');
    }
  };
  if (existsSync(artifactPath)) { validateExisting(); return { path: artifactPath, sha256, reused: true }; }
  const temporaryPath = path.join(runtimeDirectory, `.pending-${randomUUID()}.jar`);
  try {
    // Independent bytes, not a hardlink to target/. Publish the completed read-only
    // file atomically without replacing an existing content-addressed artifact.
    writeFileSync(temporaryPath, bytes, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode: 0o400 });
    try { linkSync(temporaryPath, artifactPath); }
    catch (error) { if (error.code !== 'EEXIST') throw error; validateExisting(); }
    validateExisting();
    return { path: artifactPath, sha256, reused: false };
  } finally { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); }
}
