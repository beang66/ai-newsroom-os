const readEntryFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

const readDirectoryEntries = async (entry) => {
  const reader = entry.createReader();
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return entries;
    entries.push(...batch);
  }
};

const walkEntry = async (entry, parentPath = "") => {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    try {
      Object.defineProperty(file, "dropRelativePath", { configurable: true, value: path });
    } catch {}
    return [file];
  }
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry);
  return (await Promise.all(children.map((child) => walkEntry(child, path)))).flat();
};

export const hasDroppedFiles = (event) =>
  Array.from(event.dataTransfer?.types || []).includes("Files") || Boolean(event.dataTransfer?.files?.length);

export async function droppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) return (await Promise.all(entries.map((entry) => walkEntry(entry)))).flat();
  return Array.from(dataTransfer?.files || []);
}
