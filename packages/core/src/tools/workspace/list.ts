// src/agent/tools/workspace/list.ts

import { Type } from "@sinclair/typebox";
import { readdirSync, lstatSync, mkdirSync } from "fs";
import { join } from "path";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import {
  validateDirectory,
  WORKSPACE_ROOT,
  WorkspaceSecurityError,
} from "../../workspace/index.js";
import { getErrorMessage } from "../../utils/errors.js";

interface WorkspaceListParams {
  path?: string;
  recursive?: boolean;
  filter?: "all" | "files" | "directories";
}

export const workspaceListTool: Tool = {
  name: "workspace_list",
  description: "List files and directories in the workspace.",
  category: "data-bearing",
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({
        description: "Subdirectory to list (relative to workspace root). Leave empty for root.",
      })
    ),
    recursive: Type.Optional(
      Type.Boolean({
        description: "List files recursively (default: false)",
      })
    ),
    filter: Type.Optional(
      Type.String({
        description: "Filter by type: 'all' (default), 'files', or 'directories'",
        enum: ["all", "files", "directories"],
      })
    ),
  }),
};

interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
}

function listDir(dirPath: string, recursive: boolean, filter: string, rootPath?: string): FileInfo[] {
  const results: FileInfo[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stats = lstatSync(fullPath);
      const isDir = stats.isDirectory();

      // Apply filter
      if (filter === "files" && isDir) continue;
      if (filter === "directories" && !isDir) continue;

      const relativePath = fullPath.replace((rootPath ?? WORKSPACE_ROOT) + "/", "");

      results.push({
        name: entry,
        path: relativePath,
        type: isDir ? "directory" : "file",
        size: isDir ? undefined : stats.size,
        modified: stats.mtime.toISOString(),
      });

      // Recursive listing
      if (recursive && isDir) {
        results.push(...listDir(fullPath, recursive, filter, rootPath));
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

export const workspaceListExecutor: ToolExecutor<WorkspaceListParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  try {
    const { path = "", recursive = false, filter = "all" } = params;

    // Validate the path
    const tenantId = (_context as Record<string, unknown>)["tenantId"] as string
    const validated = validateDirectory(path || "", tenantId);

    if (!validated.exists) {
      // Auto-create workspace directory so subsequent writes work
      try { mkdirSync(validated.absolutePath, { recursive: true }) } catch {}
      return {
        success: true,
        data: {
          path: validated.relativePath || "/",
          files: [],
          count: 0,
          message: "Your workspace is empty.",
        },
      };
    }

    const workspaceRoot = validated.absolutePath
    const files = listDir(workspaceRoot, recursive, filter, workspaceRoot);

    return {
      success: true,
      data: {
        path: validated.relativePath || "/",
        files,
        count: files.length,
      },
    };
  } catch (error) {
    if (error instanceof WorkspaceSecurityError) {
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
