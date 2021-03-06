import store from "../redux/reduxStore";
import {
  selectGraphToView,
  selectHighlightedNodeId,
  FullGraphSelectedToView,
  selectSelectedPathNodeIdStepsToView,
} from "../redux/selectGraph/reselectView";
import { ReduxLink } from "../redux/slices/fullGraphSlice";
import { Textbox } from "../redux/slices/textboxesSlice";
import showEverythingHasBrokenError from "../showEverythingHasBrokenError";
import type NodeSimulation from "./nodeSimulation";

const isNodeRefreshNeeded = (
  oldNodes: { id: string }[],
  newNodes: { id: string }[]
) =>
  oldNodes.length !== newNodes.length ||
  oldNodes.some(({ id }, i) => id !== newNodes[i].id);

const isLinkRefreshNeeded = (oldLinks: ReduxLink[], newLinks: ReduxLink[]) =>
  oldLinks.length !== newLinks.length ||
  oldLinks.some(
    ({ source, target }, i) =>
      source !== newLinks[i].source || target !== newLinks[i].target
  );

const isNodeJigNeeded = (
  oldNodes: { fx: number | null; fy: number | null }[],
  newNodes: { fx: number | null; fy: number | null }[]
) =>
  oldNodes.some(
    (node, i) => node.fx !== newNodes[i].fx || node.fy !== newNodes[i].fy
  );

const reduxSubscribe = (simulation: NodeSimulation) => {
  // Section 1 - Track redux store changes to only refresh on necessary updates
  let currentViewGraph: FullGraphSelectedToView;
  let currentHighlightedNodeId: string | null;
  let currentSelectedPathNodeIdSteps: string[] | null;
  let currentTextboxes: Textbox[] | null;

  function handleStoreEvent() {
    try {
      const previousViewGraph = currentViewGraph;
      const previousHighlightedNodeId = currentHighlightedNodeId;
      const previousSelectedPathNodeIdSteps = currentSelectedPathNodeIdSteps;
      const previousTextboxes = currentTextboxes;

      const state = store.getState();

      currentViewGraph = selectGraphToView(state);
      currentHighlightedNodeId = selectHighlightedNodeId(state);
      currentSelectedPathNodeIdSteps =
        selectSelectedPathNodeIdStepsToView(state);
      currentTextboxes = state.textboxes;

      if (
        // Triggers that change the nodes or links present on the svg
        // This will need to cause a full rerender and a change of the simulation, etc
        previousViewGraph === undefined ||
        isNodeRefreshNeeded(previousViewGraph.nodes, currentViewGraph.nodes) ||
        isNodeRefreshNeeded(
          previousViewGraph.fadingNodes,
          currentViewGraph.fadingNodes
        ) ||
        isNodeRefreshNeeded(
          previousViewGraph.nodeGroups,
          currentViewGraph.nodeGroups
        ) ||
        isNodeRefreshNeeded(
          previousViewGraph.fadingNodeGroups,
          currentViewGraph.fadingNodeGroups
        ) ||
        isLinkRefreshNeeded(previousViewGraph.links, currentViewGraph.links) ||
        isLinkRefreshNeeded(
          previousViewGraph.fadingLinks,
          currentViewGraph.fadingLinks
        )
      ) {
        simulation.updateVisibleGraph(currentViewGraph);
        // If the visible graph is updated
        // Highlighted and path need to be changed as well
        // To bind their SVG elements to the new simulation
        simulation.updateHighlighted(currentHighlightedNodeId);
        simulation.updatePath(currentSelectedPathNodeIdSteps);
      } else {
        if (previousViewGraph !== currentViewGraph) {
          simulation.updateNodeInfo(currentViewGraph);
          if (
            simulation.simulation.alpha() < 0.1 &&
            (isNodeJigNeeded(previousViewGraph.nodes, currentViewGraph.nodes) ||
              isNodeJigNeeded(
                previousViewGraph.fadingNodes,
                currentViewGraph.fadingNodes
              ) ||
              isNodeJigNeeded(
                previousViewGraph.nodeGroups,
                currentViewGraph.nodeGroups
              ) ||
              isNodeJigNeeded(
                previousViewGraph.fadingNodeGroups,
                currentViewGraph.fadingNodeGroups
              ))
          ) {
            simulation.jigSimulation();
          }
        }
        if (previousHighlightedNodeId !== currentHighlightedNodeId) {
          simulation.updateHighlighted(currentHighlightedNodeId);
        }
        if (
          previousSelectedPathNodeIdSteps !== currentSelectedPathNodeIdSteps
        ) {
          simulation.updatePath(currentSelectedPathNodeIdSteps);
        }
      }

      if (previousTextboxes !== currentTextboxes) {
        simulation.updateTextboxes(
          currentTextboxes.filter((textbox) => textbox.visible)
        );
      }
    } catch (e) {
      console.error(e);
      showEverythingHasBrokenError();
    }
  }

  // Section 3 - Actually subscribe, and run the update once!
  store.subscribe(handleStoreEvent);
  handleStoreEvent();
};

export default reduxSubscribe;
