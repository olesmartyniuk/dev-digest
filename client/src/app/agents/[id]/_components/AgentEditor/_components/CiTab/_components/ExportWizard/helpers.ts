import { strToU8, zipSync } from "fflate";
import type { CiPreviewFile } from "@devdigest/shared";
import { ZIP_FILE_NAME } from "./constants";

/** Overlay the user's workflow edit on the (single) editable file. */
export function applyDraft(files: CiPreviewFile[], draft: string | null): CiPreviewFile[] {
  if (draft == null) return files;
  return files.map((f) => (f.editable ? { ...f, contents: draft } : f));
}

/** Zip exactly the given files (path → contents). */
export function zipFiles(files: { path: string; contents: string }[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.contents)])));
}

export function buildZip(files: { path: string; contents: string }[]): Blob {
  return new Blob([zipFiles(files) as BlobPart], { type: "application/zip" });
}

/** Trigger a browser download of the zip (object URL + temporary anchor, revoked after click). */
export function downloadZip(files: { path: string; contents: string }[], fileName = ZIP_FILE_NAME): void {
  const url = URL.createObjectURL(buildZip(files));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
