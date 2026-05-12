/**
 * lib/langgraph/graph.ts
 *
 * Assembles the AtheneState StateGraph and compiles it with the
 * Postgres checkpointer.
 *
 * Node topology (mirrors ATH-21 spec):
 *
 *   START → supervisor ─┬→ retrieval_agent    ─┐
 *                        ├→ cross_dept_agent   ─┤→ supervisor (loop)
 *                        ├→ email_agent        ─┤
 *                        ├→ calendar_agent     ─┤
 *                        ├→ report_agent       ─┤
 *                        ├→ data_index_agent   ─┤
 *                        └→ FINISH ────────────┼→ synthesis_agent → END
 *
 *  Write-action path (HITL):
 *   supervisor → approval_node  ← graph interrupted here
 *              → action_executor → synthesis_agent → END
 *
 * IMPORTANT — node registration order:
 *   LangGraph requires every node to be registered with addNode() BEFORE
 *   any addEdge() / addConditionalEdges() call that references it.
 *   All addNode() calls are therefore grouped first; all addEdge() calls follow.
 *
 * Lazy singleton:
 *   getAgentGraph() is safe to call on every request — compilation only
 *   happens once per process lifetime. A _compilingPromise guard prevents
 *   parallel compilation races on cold start.
 */

import { StateGraph, START, END, type CompiledStateGraph } from "@langchain/langgraph";
import { AtheneState } from "./state";
import { getCheckpointer } from "./checkpointer";

// ── Node imports ─────────────────────────────────────────────────────────────────────
import { supervisor }              from "./nodes/supervisor";
import { retrievalAgent }          from "./nodes/retrieval-agent";
import { crossDeptRetrievalAgent } from "./nodes/cross-dept-retrieval";
import { synthesisAgent }          from "./nodes/synthesis-agent";
import { approvalNode }            from "./nodes/async-tool-node";
import { actionExecutorNode }      from "./nodes/action-executor";
import { emailAgentNode }          from "../agents/email-agent";
import { calendarAgent }           from "../agents/calendar-agent";
import { reportAgent }             from "../agents/report-agent";
import { dataIndexAgent }          from "../agents/data-index-agent";

// ── Compiled graph singleton ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AtheneGraph = CompiledStateGraph<typeof AtheneState.State, Partial<typeof AtheneState.State>, any>;

let _compiledGraph: AtheneGraph | null = null;
let _compilingPromise: Promise<AtheneGraph> | null = null;

/**
 * Returns the lazily-compiled agent graph.
 * Concurrent calls during cold start share one compilation promise.
 */
export async function getAgentGraph(): Promise<AtheneGraph> {
  if (_compiledGraph)     return _compiledGraph;
  if (_compilingPromise)  return _compilingPromise;

  _compilingPromise = (async (): Promise<AtheneGraph> => {
    const checkpointer = await getCheckpointer();

    const workflow = new StateGraph(AtheneState);

    // ── Step 1: Register ALL nodes before any edges ───────────────────
    // LangGraph validates edge targets against registered nodes at
    // addEdge/addConditionalEdges time — registration must come first.

    workflow.addNode("supervisor",          supervisor);
    workflow.addNode("retrieval_agent",     retrievalAgent);
    workflow.addNode("cross_dept_agent",    crossDeptRetrievalAgent);
    workflow.addNode("email_agent",         emailAgentNode);
    workflow.addNode("calendar_agent",      calendarAgent);
    workflow.addNode("report_agent",        reportAgent);
    workflow.addNode("data_index_agent",    dataIndexAgent);
    // approval_node: graph is interrupted BEFORE this node executes (HITL gate)
    workflow.addNode("approval_node",       approvalNode);
    workflow.addNode("action_executor",     actionExecutorNode);
    workflow.addNode("synthesis_agent",     synthesisAgent);

    // ── Step 2: Wire edges ────────────────────────────────────────────
    // Cast to any: LangGraph 1.x accumulates the node-name union type via
    // the *return value* of addNode(), but the mutation-style calls above
    // discard those values, leaving N unresolved for addEdge/addConditionalEdges.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wf = workflow as any;

    wf.addEdge(START, "supervisor");

    // Supervisor routes to a worker, the HITL path, or terminal synthesis.
    wf.addConditionalEdges(
      "supervisor",
      (state: typeof AtheneState.State) => state.next || "FINISH",
      {
        retrieval_agent:  "retrieval_agent",
        cross_dept_agent: "cross_dept_agent",
        email_agent:      "email_agent",
        calendar_agent:   "calendar_agent",
        report_agent:     "report_agent",
        data_index_agent: "data_index_agent",
        // Supervisor routes write-actions to the HITL gate
        action_executor:  "approval_node",
        FINISH:           "synthesis_agent",
      }
    );

    // All worker agents loop back to supervisor for re-routing.
    for (const node of [
      "retrieval_agent",
      "cross_dept_agent",
      "email_agent",
      "calendar_agent",
      "report_agent",
      "data_index_agent",
    ]) {
      wf.addEdge(node, "supervisor");
    }

    // HITL path: approval_node → action_executor → synthesis_agent
    wf.addEdge("approval_node",   "action_executor");
    wf.addEdge("action_executor", "synthesis_agent");

    // Synthesis is always the terminal node
    wf.addEdge("synthesis_agent", END);

    // ── Step 3: Compile ───────────────────────────────────────────────
    const compiled = wf.compile({
      checkpointer,
      // Pause BEFORE approval_node; /api/agent/approve resumes the thread.
      interruptBefore: ["approval_node"],
    }) as AtheneGraph;

    _compiledGraph    = compiled;
    _compilingPromise = null;
    return compiled;
  })();

  return _compilingPromise;
}

/**
 * Reset the singleton — **test use only**.
 * @internal
 */
export function _resetCompiledGraph(): void {
  _compiledGraph    = null;
  _compilingPromise = null;
}