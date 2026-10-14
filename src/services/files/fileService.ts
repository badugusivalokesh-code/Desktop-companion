import { invoke } from "@tauri-apps/api/core";

export interface ApprovedFolder {
  path: string;
}

export interface FileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  sizeBytes: number;
}

export interface FileListResult {
  directory: string;
  entries: FileEntry[];
  truncated: boolean;
}

export interface FileReadResult {
  path: string;
  content: string;
  truncated: boolean;
}

export interface FilenameMatch {
  path: string;
  kind: string;
}

export interface TextMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

/** The bounded result returned by both backend search commands. */
export interface FileSearchResult<TMatch> {
  matches: TMatch[];
  truncated: boolean;
  skipped: number;
  scannedFiles: number;
  accessedFiles: string[];
}

export type FilenameSearchResult = FileSearchResult<FilenameMatch>;
export type TextSearchResult = FileSearchResult<TextMatch>;

export interface FileService {
  selectFolder(): Promise<ApprovedFolder | null>;
  revokeFolder(): Promise<void>;
  getApprovedFolder(): Promise<ApprovedFolder | null>;
  list(relativePath?: string): Promise<FileListResult>;
  read(relativePath: string): Promise<FileReadResult>;
  searchFilenames(query: string): Promise<FilenameSearchResult>;
  searchText(query: string): Promise<TextSearchResult>;
}

class TauriFileService implements FileService {
  /** The native picker is owned by the backend; no browser/plugin dialog is used. */
  selectFolder(): Promise<ApprovedFolder | null> {
    return invoke<ApprovedFolder | null>("file_select_folder");
  }

  revokeFolder(): Promise<void> {
    return invoke("file_revoke_folder");
  }

  getApprovedFolder(): Promise<ApprovedFolder | null> {
    return invoke<ApprovedFolder | null>("file_get_approved_folder");
  }

  list(relativePath = ""): Promise<FileListResult> {
    return invoke<FileListResult>("file_list", { relativePath });
  }

  read(relativePath: string): Promise<FileReadResult> {
    return invoke<FileReadResult>("file_read", { relativePath });
  }

  searchFilenames(query: string): Promise<FilenameSearchResult> {
    return invoke<FilenameSearchResult>("file_search_filenames", { query });
  }

  searchText(query: string): Promise<TextSearchResult> {
    return invoke<TextSearchResult>("file_search_text", { query });
  }
}

export const fileService: FileService = new TauriFileService();
