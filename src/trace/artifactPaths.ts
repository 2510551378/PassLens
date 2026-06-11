import * as path from 'node:path';

export interface ArtifactPathResolution {
  ok: boolean;
  resolvedPath?: string;
  message?: string;
}

export function resolveArtifactPathWithinTraceRoot(traceDir: string, artifactPath: string): ArtifactPathResolution {
  const trimmed = artifactPath.trim();
  if (trimmed.length === 0) {
    return reject('Artifact path is empty.');
  }

  if (path.isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
    return reject('Absolute artifact paths are not allowed; use a path relative to trace.json.');
  }

  const root = path.resolve(traceDir);
  const resolvedPath = path.resolve(root, trimmed);
  const relative = path.relative(root, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return reject('Artifact path escapes the trace directory.');
  }

  return {
    ok: true,
    resolvedPath: path.normalize(resolvedPath)
  };
}

function reject(message: string): ArtifactPathResolution {
  return {
    ok: false,
    message
  };
}
