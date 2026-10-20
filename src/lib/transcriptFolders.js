const parentOf = (folder) => folder?.parentId || null;

export function canMoveTranscriptFolder(folders, folderId, targetFolderId) {
  if (!folderId || folderId === targetFolderId) return false;
  if (!targetFolderId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (!byId.has(folderId) || !byId.has(targetFolderId)) return false;
  const visited = new Set();
  let cursor = targetFolderId;
  while (cursor) {
    if (cursor === folderId || visited.has(cursor)) return false;
    visited.add(cursor);
    cursor = parentOf(byId.get(cursor));
  }
  return true;
}

export function moveTranscriptFolder(folders, folderId, targetFolderId = null) {
  if (targetFolderId && !canMoveTranscriptFolder(folders, folderId, targetFolderId)) return folders;
  if (!targetFolderId && !folders.some((folder) => folder.id === folderId)) return folders;
  return folders.map((folder) => {
    if (folder.id !== folderId) return folder;
    if (!targetFolderId) {
      const rootFolder = { ...folder };
      delete rootFolder.parentId;
      return rootFolder;
    }
    return { ...folder, parentId: targetFolderId };
  });
}

export function removeTranscriptFolder(folders, fileFolderMap, folderId) {
  const removed = folders.find((folder) => folder.id === folderId);
  if (!removed) return { folders, fileFolderMap };
  const parentId = parentOf(removed);
  const nextFolders = folders
    .filter((folder) => folder.id !== folderId)
    .map((folder) => {
      if (parentOf(folder) !== folderId) return folder;
      if (!parentId) {
        const rootFolder = { ...folder };
        delete rootFolder.parentId;
        return rootFolder;
      }
      return { ...folder, parentId };
    });
  const nextMap = { ...fileFolderMap };
  Object.keys(nextMap).forEach((fileId) => {
    if (nextMap[fileId] === folderId) delete nextMap[fileId];
  });
  return { folders: nextFolders, fileFolderMap: nextMap };
}

export function transcriptFolderChildren(folders, parentId = null) {
  return folders.filter((folder) => parentOf(folder) === parentId);
}
