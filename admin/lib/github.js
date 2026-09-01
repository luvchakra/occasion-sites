// Thin wrapper around the GitHub REST + Git Data APIs. On Vercel there is
// no persistent local disk and no local `git` — so everything that must
// PERSIST or be visible immediately after a write (customer/invoice data,
// uploaded photos, templates, published sites) goes through here.

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
// Overridable only for local testing against a mock server — never set
// this in production.
const API = process.env.GITHUB_API_BASE || 'https://api.github.com';

function assertConfigured() {
  if (!TOKEN || !OWNER || !REPO) {
    throw new Error(
      'GitHub is not configured — set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO as environment variables.'
    );
  }
}

async function gh(path, opts = {}) {
  assertConfigured();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub API ${opts.method || 'GET'} ${path} -> ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Returns { content: string (utf8), sha } or null if the file doesn't exist.
async function getFile(path) {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`);
    if (Array.isArray(data)) throw new Error(`${path} is a directory, not a file`);
    return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function getFileBuffer(path) {
  const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`);
  return Buffer.from(data.content, 'base64');
}

// Lists files (name + sha) directly inside a directory. Returns [] if the
// directory doesn't exist.
async function listDir(dirPath) {
  try {
    const data = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(dirPath).replace(/%2F/g, '/')}?ref=${BRANCH}`);
    return Array.isArray(data) ? data.filter((d) => d.type === 'file') : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

// Creates or updates a single file. Pass `sha` (from a prior getFile) when
// updating an existing file.
async function putFile(path, contentBuffer, message, sha) {
  return gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: contentBuffer.toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
}

async function deleteFile(path, sha, message) {
  return gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: BRANCH })
  });
}

async function deleteDir(dirPath, message) {
  const files = await listDir(dirPath);
  for (const f of files) {
    await deleteFile(`${dirPath}/${f.name}`, f.sha, message);
  }
}

// Full recursive listing of every blob in the repo at the current branch
// HEAD — [{path, sha, type}]. One call, cheap enough for a repo this size;
// used to find template files/assets by path prefix without a request per
// subfolder.
async function getTree() {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${ref.object.sha}`);
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree;
}

// Commits multiple files in ONE atomic commit via the Git Data API. Each
// entry is either { path, sha } to reuse an existing blob already in the
// repo (cheap — no re-upload), or { path, content: Buffer } to upload new
// bytes.
async function commitFiles(files, message) {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const parentSha = ref.object.sha;
  const parentCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);

  const entries = [];
  for (const f of files) {
    let sha = f.sha;
    if (!sha) {
      const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content.toString('base64'), encoding: 'base64' })
      });
      sha = blob.sha;
    }
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha });
  }

  const newTree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: entries })
  });

  const newCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] })
  });

  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha })
  });

  return newCommit.sha;
}

module.exports = { getFile, getFileBuffer, listDir, putFile, deleteFile, deleteDir, getTree, commitFiles, OWNER, REPO, BRANCH };
