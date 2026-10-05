#!/usr/bin/env node
// Condenses one Claude Code session's transcript + subagent logs into a single
// JSON summary: per-agent token totals, launch order/parallelism, timing,
// tool-call tallies, touched files, error excerpts, and each agent's final
// hand-back message. Never writes anything — prints JSON to stdout.
//
// Usage: node extract_workflow_metrics.mjs <session-uuid>

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const FILE_ARG_KEYS = ["file_path", "path", "notebook_path"];
const MAX_FINAL_MESSAGE_CHARS = 8000;
const MAX_ERROR_EXCERPTS_PER_AGENT = 6;

function fail(message) {
  console.log(JSON.stringify({ error: message }));
  process.exit(0);
}

function readJsonlLines(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // partial/corrupt line — skip, never abort the whole parse over one bad row
    }
  }
  return out;
}

function findSession(uuid) {
  const projectsRoot = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(projectsRoot)) {
    fail(`no ~/.claude/projects directory found at ${projectsRoot}`);
  }
  for (const slug of fs.readdirSync(projectsRoot)) {
    const candidate = path.join(projectsRoot, slug, `${uuid}.jsonl`);
    if (fs.existsSync(candidate)) {
      return { mainJsonlPath: candidate, sessionDir: path.join(projectsRoot, slug, uuid) };
    }
  }
  fail(
    `no session transcript named ${uuid}.jsonl found under any project folder in ${projectsRoot} ` +
      `(project-slug casing can differ between launches — this search already ignores that, so a miss means the uuid is wrong)`,
  );
}

function extractAgentLaunches(mainJsonlPath) {
  // Maps each Agent tool_use id -> { orderIndex, batchMsgId, launchedAt }
  const launches = new Map();
  let orderIndex = 0;
  for (const entry of readJsonlLines(mainJsonlPath)) {
    if (entry.type !== "assistant" || !entry.message?.content) continue;
    for (const block of entry.message.content) {
      if (block.type === "tool_use" && block.name === "Agent") {
        launches.set(block.id, {
          orderIndex: orderIndex++,
          batchMsgId: entry.message.id,
          launchedAt: entry.timestamp,
          requestedDescription: block.input?.description ?? null,
        });
      }
    }
  }
  return launches;
}

function extractFilePath(toolName, input) {
  if (!input) return null;
  for (const key of FILE_ARG_KEYS) {
    if (typeof input[key] === "string") return input[key];
  }
  if (toolName === "Grep" || toolName === "Glob") {
    return input.path ?? (typeof input.pattern === "string" ? `glob:${input.pattern}` : null);
  }
  return null;
}

function summarizeAgentTranscript(jsonlPath) {
  const lines = readJsonlLines(jsonlPath);

  const seenMessageIds = new Set();
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const toolTally = {};
  const filesTouched = new Set();
  const errorExcerpts = [];
  let turnCount = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let finalAssistantText = "";

  // tool_use id -> tool name, so later tool_result lines can report which tool errored
  const toolNameById = new Map();

  for (const entry of lines) {
    if (entry.timestamp) {
      if (!firstTimestamp) firstTimestamp = entry.timestamp;
      lastTimestamp = entry.timestamp;
    }

    if (entry.type === "assistant" && entry.message) {
      const msgId = entry.message.id;
      if (msgId && !seenMessageIds.has(msgId)) {
        seenMessageIds.add(msgId);
        turnCount++;
        const u = entry.message.usage;
        if (u) {
          tokens.input += u.input_tokens ?? 0;
          tokens.output += u.output_tokens ?? 0;
          tokens.cacheWrite += u.cache_creation_input_tokens ?? 0;
          tokens.cacheRead += u.cache_read_input_tokens ?? 0;
        }
      }

      for (const block of entry.message.content ?? []) {
        if (block.type === "tool_use") {
          toolTally[block.name] = (toolTally[block.name] ?? 0) + 1;
          toolNameById.set(block.id, block.name);
          const fp = extractFilePath(block.name, block.input);
          if (fp) filesTouched.add(fp);
        }
        if (block.type === "text" && typeof block.text === "string") {
          finalAssistantText = block.text; // last one wins — the hand-back is the final text block
        }
      }
    }

    if (entry.type === "user" && entry.message?.content) {
      for (const block of entry.message.content) {
        if (block.type === "tool_result" && block.is_error) {
          if (errorExcerpts.length < MAX_ERROR_EXCERPTS_PER_AGENT) {
            const rawContent = Array.isArray(block.content)
              ? block.content.map((c) => c.text ?? "").join(" ")
              : String(block.content ?? "");
            errorExcerpts.push({
              tool: toolNameById.get(block.tool_use_id) ?? "unknown",
              excerpt: rawContent.slice(0, 300),
            });
          }
        }
      }
    }
  }

  if (finalAssistantText.length > MAX_FINAL_MESSAGE_CHARS) {
    finalAssistantText =
      finalAssistantText.slice(0, MAX_FINAL_MESSAGE_CHARS) +
      `\n…[truncated, ${finalAssistantText.length} chars total]`;
  }

  return {
    tokens,
    tokensTotal: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
    turnCount,
    firstTimestamp,
    lastTimestamp,
    toolTally,
    filesTouched: [...filesTouched].sort(),
    errorCount: errorExcerpts.length,
    errorExcerpts,
    finalMessage: finalAssistantText,
  };
}

function main() {
  const uuid = process.argv[2];
  if (!uuid) fail("usage: node extract_workflow_metrics.mjs <session-uuid>");

  const { mainJsonlPath, sessionDir } = findSession(uuid);
  const subagentsDir = path.join(sessionDir, "subagents");

  if (!fs.existsSync(subagentsDir)) {
    fail(`no subagents directory for session ${uuid} — no multi-agent work has run in this session yet`);
  }

  const metaFiles = fs.readdirSync(subagentsDir).filter((f) => f.endsWith(".meta.json"));
  if (metaFiles.length === 0) {
    fail(`subagents directory exists but holds no agent runs for session ${uuid}`);
  }

  const launches = extractAgentLaunches(mainJsonlPath);

  const agents = metaFiles.map((metaFile) => {
    const meta = JSON.parse(fs.readFileSync(path.join(subagentsDir, metaFile), "utf8"));
    const agentJsonlName = metaFile.replace(/\.meta\.json$/, ".jsonl");
    const agentJsonlPath = path.join(subagentsDir, agentJsonlName);
    const summary = fs.existsSync(agentJsonlPath)
      ? summarizeAgentTranscript(agentJsonlPath)
      : { error: `missing transcript file ${agentJsonlName}` };
    const launch = launches.get(meta.toolUseId) ?? null;

    return {
      agentType: meta.agentType ?? null,
      description: meta.description ?? null,
      spawnDepth: meta.spawnDepth ?? null,
      toolUseId: meta.toolUseId ?? null,
      orderIndex: launch?.orderIndex ?? null,
      batchMsgId: launch?.batchMsgId ?? null,
      launchedAt: launch?.launchedAt ?? null,
      ...summary,
    };
  });

  agents.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  // Parallel-batch grouping: consecutive agents (in launch order) sharing the same batchMsgId
  // were requested in the same assistant turn, i.e. launched in parallel.
  let batchNumber = 0;
  let prevBatchMsgId = null;
  for (const agent of agents) {
    if (agent.batchMsgId !== prevBatchMsgId) {
      batchNumber++;
      prevBatchMsgId = agent.batchMsgId;
    }
    agent.launchBatch = batchNumber;
  }

  // Cross-agent duplicate-file detection
  const fileToAgents = new Map();
  for (const agent of agents) {
    for (const f of agent.filesTouched ?? []) {
      if (!fileToAgents.has(f)) fileToAgents.set(f, []);
      fileToAgents.get(f).push(agent.agentType);
    }
  }
  const duplicateFiles = [...fileToAgents.entries()]
    .filter(([, agentTypes]) => new Set(agentTypes).size > 1)
    .map(([file, agentTypes]) => ({ file, agents: agentTypes }));

  const allTimestamps = agents.flatMap((a) => [a.firstTimestamp, a.lastTimestamp]).filter(Boolean);
  const grandTotal = agents.reduce(
    (acc, a) => ({
      input: acc.input + (a.tokens?.input ?? 0),
      output: acc.output + (a.tokens?.output ?? 0),
      cacheWrite: acc.cacheWrite + (a.tokens?.cacheWrite ?? 0),
      cacheRead: acc.cacheRead + (a.tokens?.cacheRead ?? 0),
    }),
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  );

  console.log(
    JSON.stringify(
      {
        sessionUuid: uuid,
        agentCount: agents.length,
        runSpan: {
          start: allTimestamps.length ? allTimestamps.sort()[0] : null,
          end: allTimestamps.length ? allTimestamps.sort().at(-1) : null,
        },
        tokenGrandTotal: grandTotal,
        tokenGrandTotalSum: grandTotal.input + grandTotal.output + grandTotal.cacheWrite + grandTotal.cacheRead,
        duplicateFiles,
        agents,
      },
      null,
      2,
    ),
  );
}

main();
