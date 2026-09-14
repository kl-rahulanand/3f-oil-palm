import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ResponseClass, type AskResponse, type AuthUser, type Selection } from "@3f/contract";
import { loadConfig } from "../config";
import { BedrockLlmProvider } from "../llm/bedrock.provider";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { SelectionExecutor } from "./selectionExecutor";

test("a client disconnect stops frame writes aborts the model call and records no backend error", async () => {
  let signal: AbortSignal | undefined;
  const recordedResponseClasses: ResponseClass[] = [];
  const response = new FakeResponse();
  const service = new ChatService(
    new SemanticLayer(),
    {} as never,
    {
      async writeRequestEvent() {},
      async writeResultEvent(result: { responseClass: ResponseClass }) {
        recordedResponseClasses.push(result.responseClass);
      },
    } as never,
    {
      async values() {
        return [];
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async select(_input: unknown, abortSignal?: AbortSignal) {
        signal = abortSignal;
        return new Promise<never>((_, reject) =>
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true }),
        );
      },
    },
  );
  const controller = new ChatController(service);

  const streaming = controller.stream(governedUser, "session", { question: "Show Actual" }, response as never);
  await new Promise((resolve) => setImmediate(resolve));
  const framesBeforeClose = response.frames.length;
  response.abandon();
  await streaming;

  assert.equal(signal?.aborted, true);
  assert.equal(response.frames.length, framesBeforeClose);
  assert.equal(
    response.frames.some((frame) => frame.includes(ResponseClass.BackendError)),
    false,
  );
  assert.deepEqual(recordedResponseClasses, []);

  const queryAbort = new AbortController();
  let executeCalls = 0;
  const domain = new SemanticLayer().domain("governed-financial");
  assert.ok(domain);
  const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), {
    async explain() {
      queryAbort.abort();
    },
    async execute() {
      executeCalls += 1;
      return { columns: [], rows: [] };
    },
  } as never);
  await assert.rejects(
    executor.run(governedUser, domain, financialSelection, { signal: queryAbort.signal }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(executeCalls, 0);
});

test("a normal completion does not abort while a premature close aborts and reaches the send call", async () => {
  const normalProvider = providerWithSend(async (_command, options) => {
    assert.equal(options?.abortSignal?.aborted, false);
    return toolResponse("mark_unsupported", { reason: "Outside the vocabulary" });
  });
  let normalSignal: AbortSignal | undefined;
  const normalResponse = new FakeResponse();
  const normalController = new ChatController({
    ask: async (...args: unknown[]) => {
      normalSignal = args[7] as AbortSignal | undefined;
      await normalProvider.select(selectionInput(), normalSignal);
      return informationalResponse();
    },
  } as never);
  await normalController.stream(user, "session", { question: "Show Actual" }, normalResponse as never);
  assert.equal(normalSignal?.aborted, false);

  let transportSignal: AbortSignal | undefined;
  const abandonedProvider = providerWithSend(
    (_command, options) =>
      new Promise((_, reject) => {
        transportSignal = options?.abortSignal;
        options?.abortSignal?.addEventListener("abort", () => reject(options.abortSignal?.reason), {
          once: true,
        });
      }),
  );
  const abandonedResponse = new FakeResponse();
  const abandonedController = new ChatController({
    ask: async (...args: unknown[]) => {
      await abandonedProvider.select(selectionInput(), args[7] as AbortSignal | undefined);
      return informationalResponse();
    },
  } as never);
  const streaming = abandonedController.stream(
    user,
    "session",
    { question: "Show Actual" },
    abandonedResponse as never,
  );
  await new Promise((resolve) => setImmediate(resolve));
  abandonedResponse.abandon();
  await streaming;

  assert.equal(transportSignal?.aborted, true);
  assert.equal(abandonedResponse.frames.length, 0);
});

class FakeResponse extends EventEmitter {
  readonly frames: string[] = [];
  writableEnded = false;
  destroyed = false;

  status() {
    return this;
  }
  setHeader() {}
  flushHeaders() {}
  write(frame: string) {
    this.frames.push(frame);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.emit("finish");
    this.emit("close");
  }
  abandon() {
    this.destroyed = true;
    this.emit("close");
  }
}

type SendOptions = { abortSignal?: AbortSignal };
type ToolResponse = {
  output: { message: { content: Array<{ toolUse: { name: string; input: unknown } }> } };
};

function providerWithSend(
  send: (command: unknown, options?: SendOptions) => Promise<ToolResponse>,
): BedrockLlmProvider {
  class ConverseCommand {
    constructor(readonly input: unknown) {}
  }
  const provider = Object.create(BedrockLlmProvider.prototype) as BedrockLlmProvider;
  Reflect.set(provider, "cfg", {
    ...loadConfig(),
    bedrock: { region: "ap-south-1", modelId: "test-model" },
  });
  Reflect.set(provider, "ConverseCommand", ConverseCommand);
  Reflect.set(provider, "client", { send });
  return provider;
}

function selectionInput() {
  return {
    question: "Show Actual",
    allowedDomains: [
      {
        name: "governed-financial",
        label: "Governed financial",
        goldObject: "actual_by_gl_month",
        routingHints: [],
        measures: [],
        dimensions: [],
      },
    ],
  };
}

function toolResponse(name: string, input: unknown): ToolResponse {
  return { output: { message: { content: [{ toolUse: { name, input } }] } } };
}

function informationalResponse(): AskResponse {
  return {
    responseClass: ResponseClass.Informational,
    kind: "informational",
    title: "Help",
    definition: "Ask a governed data question.",
    usedPriorContext: false,
    sessionId: "session",
    latencyMs: 0,
    viewInReport: { available: false, reason: "Informational response." },
  };
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { actions: ["report"], domains: [], measureIds: [], dimensionIds: [] },
  scope: [],
};

const financialSelection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["gl_code"],
  filters: [],
};

const governedUser: AuthUser = {
  ...user,
  permissions: {
    actions: ["report"],
    domains: [financialSelection.domain],
    measureIds: financialSelection.measureIds,
    dimensionIds: financialSelection.dimensionIds,
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
