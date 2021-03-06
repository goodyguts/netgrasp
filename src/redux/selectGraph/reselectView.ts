import { createSelector } from "@reduxjs/toolkit";
import focusViewGetSubgraph from "./focusView";
import {
  getLinksWithinNodeSet,
  getNodesLinksDirectlyConnectedToNodeSet,
} from "./networkOperations";
import type { RootState } from "../reduxStore";
import type { ReduxLink, ReduxNode } from "../slices/fullGraphSlice";
import type { Path } from "../slices/pathsSlice";
import { NodePin } from "../slices/pinGroupsSlice";
import { NodeGroup } from "../slices/nodeGroupsSlice";

//
// Basic selectors
//
const selectFullGraph = (state: RootState) => state.fullGraph;
const selectFullGraphLinks = (state: RootState) => state.fullGraph.links;
const selectFullGraphNodes = (state: RootState) => state.fullGraph.nodes;
const selectView = (state: RootState) => state.view;
const selectFadingLinks = (state: RootState) => state.view.fadingLinks;
const selectCombineLogical = (state: RootState) => state.view.combineLogical;
const selectFocusViewDistance = (state: RootState) =>
  state.view.focusViewDistance;
const selectPathView = (state: RootState) => state.pathView;
export const selectSelectedPathId = (state: RootState) => state.selectedPath;
const selectPaths = (state: RootState) => state.paths;
export const selectOngoingEdit = (state: RootState) => state.ongoingEdit;
export const selectHighlightedNodeId = (state: RootState) =>
  state.highlighted?.hNode || null;
const selectPinGroups = (state: RootState) => state.pinGroups;
const selectNodeGroups = (state: RootState) => state.nodeGroups;

export const selectSearchedNodes = createSelector(
  selectFullGraphNodes,
  (state: any, { searchString }: { searchString: string }) => searchString,
  (nodes, searchString) => {
    if (!searchString) return nodes;

    const searchStringTerms = searchString.toLowerCase().trim().split(" ");

    return nodes.filter((node) =>
      searchStringTerms.every((searchTerm) =>
        node.name.toLowerCase().includes(searchTerm)
      )
    );
  }
);

const selectBeingEditedPinGroup = createSelector(
  selectPinGroups,
  selectOngoingEdit,
  (pinGroups, ongoingEdit) =>
    ongoingEdit?.editType !== "toggleNodesInPinGroup"
      ? null
      : pinGroups.default.id === ongoingEdit.pinGroupId
      ? pinGroups.default
      : pinGroups.other.find(
          (pinGroup) => pinGroup.id === ongoingEdit.pinGroupId
        ) || null
);

const selectPinGroupsArray = createSelector(selectPinGroups, (pinGroups) => [
  pinGroups.default,
  ...pinGroups.other,
]);

export const selectPinGroupsInOngoingEditOrder = createSelector(
  selectPinGroupsArray,
  selectBeingEditedPinGroup,
  (pinGroups, beingEditedPinGroup) => {
    if (!beingEditedPinGroup) return pinGroups;

    return [
      beingEditedPinGroup,
      ...pinGroups.filter((pinGroup) => pinGroup.id !== beingEditedPinGroup.id),
    ];
  }
);

const selectBeingEditedPinGroupPins = createSelector(
  selectBeingEditedPinGroup,
  (beingEditedPinGroup) => beingEditedPinGroup?.pins || null
);

//
// Getting the highlighted node & associated properties
//
export const selectHighlightedNode = createSelector(
  selectFullGraph,
  selectHighlightedNodeId,
  (fullGraph, highlightedNodeId) =>
    fullGraph.nodes.find((node) => node.id === highlightedNodeId) || null
);
export const createSelectHighlightedNodeProperty =
  (property: keyof ReduxNode) => (state: RootState) => {
    const highlightedNode = selectHighlightedNode(state);
    return highlightedNode?.[property] || null;
  };

export const selectLogicalChildrenOfNode = (
  nodeId: string | null,
  nodes: ReduxNode[]
) =>
  (nodeId &&
    nodes
      .filter((node) => node.logicalParent === nodeId)
      .map((node) => node.id)) ||
  [];

export const selectHighlightedNodeLogicalChildren = createSelector(
  selectHighlightedNodeId,
  selectFullGraphNodes,
  selectLogicalChildrenOfNode
);

export const selectHighlightedNodeLogicalGroup = createSelector(
  selectHighlightedNode,
  selectHighlightedNodeLogicalChildren,
  selectFullGraphNodes,
  (highlightedNode, children, nodes) => {
    if (
      !highlightedNode ||
      (!highlightedNode.logicalParent && children.length === 0)
    ) {
      return null;
    }

    if (highlightedNode.logicalParent) {
      return {
        parent: highlightedNode.logicalParent,
        children: [
          // Make the highlighted node the first in the list of children
          highlightedNode.id,
          ...selectLogicalChildrenOfNode(
            highlightedNode.logicalParent,
            nodes
          ).filter((nodeId) => nodeId !== highlightedNode.id),
        ],
      };
    }

    return {
      parent: highlightedNode.id,
      children,
    };
  }
);

//
// Miscellaneous useful elements for later
//

const selectBeingEditedNodeGroupNodes = createSelector(
  selectNodeGroups,
  selectOngoingEdit,
  (nodeGroups, ongoingEdit) =>
    ongoingEdit?.editType === "toggleNodesInNodeGroup"
      ? nodeGroups.find((nodeGroup) => nodeGroup.id === ongoingEdit.nodeGroupId)
          ?.members || null
      : null
);

// => combining the active pin groups
const selectCombinedPinMap = createSelector(
  selectPinGroupsInOngoingEditOrder,
  (pinGroups) =>
    (pinGroups || [])
      .filter((pinGroup) => pinGroup.active)
      .map((pinGroup) => {
        // Get the pins from the pin group
        // Add details about which pin group the pin info comes from
        const pinEntries = Object.entries(pinGroup.pins);

        const newPinEntries = pinEntries.map(
          ([nodeId, pin]): [string, NodePin & { pinSourceGroupId: string }] => [
            nodeId,
            {
              ...pin,
              pinSourceGroupId: pinGroup.id,
            },
          ]
        );

        return Object.fromEntries(newPinEntries);
      })
      .reduce((prev, current) => ({ ...current, ...prev }), {})
);

//
// Section that deals with logical combining
//

// => Combine logical mappings
export const selectCombineLogicalChildDeviceMap = createSelector(
  selectFullGraphNodes,
  selectCombineLogical,
  (nodes, combineLogical) => {
    if (!combineLogical) return null;

    const out: { [k: string]: string } = {};
    nodes.forEach((node) => {
      if (node.logicalParent) {
        out[node.id] = node.logicalParent;
      }
    });
    return out;
  }
);

interface ReduxNodeWithCombineLogicalInfo extends ReduxNode {
  logicalChildren: string[];
  hasCombinedChildren: boolean;
}

export const selectFullGraphLogicalCombinedNodes = createSelector(
  selectFullGraphNodes,
  selectCombineLogical,
  (nodes, combineLogical): ReduxNodeWithCombineLogicalInfo[] => {
    const logicalChildrenByNodeId: { [parentNodeId: string]: string[] } =
      Object.fromEntries(nodes.map((node) => [node.id, []]));

    const uncombinedNodes: ReduxNode[] = [];

    nodes.forEach((node) => {
      if (!node.logicalParent) {
        uncombinedNodes.push(node);
        return;
      }

      logicalChildrenByNodeId[node.logicalParent].push(node.id);
    });

    const uncombinedNodesWithCombineInfo: ReduxNodeWithCombineLogicalInfo[] = (
      combineLogical ? uncombinedNodes : nodes
    ) // If combine logical send only nodes that aren't a child of another
      .map((node) => ({
        ...node,
        logicalChildren: logicalChildrenByNodeId[node.id],
        hasCombinedChildren:
          combineLogical && !!logicalChildrenByNodeId[node.id]?.length,
      }));

    return uncombinedNodesWithCombineInfo;
  }
);

//
// Section that deals with logical excluding
//

export const selectNodesToExclude = createSelector(
  selectNodeGroups,
  (nodeGroups) => {
    const excludeSet = new Set<string>();
    (nodeGroups || [])
      .filter((nodeGroup) => nodeGroup.exclude)
      .forEach((nodeGroup) => {
        excludeSet.add(nodeGroup.id);
        nodeGroup.members.forEach((nodeId) => excludeSet.add(nodeId));
      });
    return excludeSet;
  }
);

export const selectExcludeGraphNodes = createSelector(
  selectFullGraphLogicalCombinedNodes,
  selectNodesToExclude,
  (nodes, exclusionSet) => nodes.filter((node) => !exclusionSet.has(node.id))
);

//
// Node Groups
//

export const selectNodeGroupDeviceMap = createSelector(
  selectNodeGroups,
  (nodeGroups) => {
    const activeNodeGroups = (nodeGroups || []).filter(
      (nodeGroup) => nodeGroup.active
    );

    const nodeIdToNodeGroup: { [nodeId: string]: string } =
      activeNodeGroups.reduce(
        (prev, nodeGroup) => ({
          ...Object.fromEntries(
            nodeGroup.members.map((memberNodeId) => [
              memberNodeId,
              nodeGroup.id,
            ])
          ),
          // Putting prev after means earlier node groups get preference
          ...prev,
        }),
        {} as { [nodeId: string]: string }
      );

    return nodeIdToNodeGroup;
  }
);

const applyMapToObjectValues = (
  objectToTransform: { [k: string]: string },
  mapToUse: { [k: string]: string }
) => {
  const out: { [k: string]: string } = {};

  for (const key of Object.keys(objectToTransform)) {
    out[key] = mapToUse[objectToTransform[key]] || objectToTransform[key];
  }

  return out;
};

export const selectAllCombinesNodeIdMap = createSelector(
  selectNodeGroupDeviceMap,
  selectCombineLogicalChildDeviceMap,
  (nodeGroupCombineMap, logicalCombineMap) => ({
    ...nodeGroupCombineMap,
    // Logical combines take priority
    // but if the logical parent was node group combined
    // then the children will be node group combined
    ...applyMapToObjectValues(logicalCombineMap || {}, nodeGroupCombineMap),
  })
);

const selectNodeGroupsById = createSelector(selectNodeGroups, (nodeGroups) =>
  Object.fromEntries(
    (nodeGroups || []).map((nodeGroup) => [nodeGroup.id, nodeGroup])
  )
);

const selectCombineGraphNodesNodeGroups = createSelector(
  selectExcludeGraphNodes,
  selectAllCombinesNodeIdMap,
  selectNodeGroupsById,
  (nodes, combinesMap, nodeGroupsById) => {
    const outNodeGroupsSet = new Set<NodeGroup>();
    const outNodes: ReduxNodeWithCombineLogicalInfo[] = [];

    nodes.forEach((node) => {
      const combineDestination = combinesMap[node.id];

      if (combineDestination === undefined) {
        outNodes.push(node);
      } else {
        // If a node ends up in this section it must be being combined into a node group
        // All logically combined node children would have been removed before this point
        outNodeGroupsSet.add(nodeGroupsById[combineDestination]);
      }
    });

    return {
      nodes: outNodes,
      nodeGroups: Array.from(outNodeGroupsSet),
    };
  }
);

const selectFullViewNodeGroups = createSelector(
  selectCombineGraphNodesNodeGroups,
  ({ nodeGroups }) => nodeGroups
);

//
// End of combine stage
//

export const selectCombinedGraphNodes = createSelector(
  selectCombineGraphNodesNodeGroups,
  ({ nodes }) => nodes
);

export const selectCombinedGraphLinks = createSelector(
  selectFullGraphLinks,
  selectAllCombinesNodeIdMap,
  selectNodesToExclude,
  (links, logicalMap, excludeNodes): ReduxLink[] =>
    links
      .map(({ source, target }) => ({
        source: logicalMap[source] || source,
        target: logicalMap[target] || target,
      }))
      .filter(
        ({ source, target }) =>
          source !== target &&
          !excludeNodes.has(source) &&
          !excludeNodes.has(target)
      )
);

const selectCombinedGraphNodesById = createSelector(
  selectCombinedGraphNodes,
  (nodes) => Object.fromEntries(nodes.map((node) => [node.id, node]))
);

//
// After combine other stuff
//

const selectBeingViewedNodeGroupCombinedNodeIds = createSelector(
  selectNodeGroups,
  selectView,
  selectAllCombinesNodeIdMap,
  (nodeGroups, view, combinesMap) => {
    if (view.viewStyle !== "nodeGroup") return null;

    const nodeIds =
      nodeGroups.find((subsetView) => subsetView.id === view.nodeGroupId)
        ?.members || [];

    const nodeIdsAfterMerge = nodeIds.map(
      (nodeId) => combinesMap[nodeId] || nodeId
    );

    // Get rid of duplicates
    return Array.from(new Set(nodeIdsAfterMerge));
  }
);

//
// Getting the selected path & associated properties
//
export const selectSelectedPath = createSelector(
  selectSelectedPathId,
  selectPaths,
  (selectedPathId, paths) =>
    (selectedPathId && paths.find((path) => path.id === selectedPathId)) || null
);
export const createSelectSelectedPathProperty =
  (property: keyof Path) => (state: RootState) => {
    const selectedPath = selectSelectedPath(state);
    return selectedPath?.[property] || null;
  };

// => Getting derived path properties
export const selectSelectedPathNodeIdSteps = createSelector(
  selectSelectedPath,
  (selectedPath) => selectedPath?.steps.map((step) => step.nodeId) || null
);
const selectSelectedPathNodeIdStepsCombined = createSelector(
  selectSelectedPathNodeIdSteps,
  selectAllCombinesNodeIdMap,
  (nodeIdSteps, combinesMap): string[] | null => {
    if (!nodeIdSteps || !combinesMap) return nodeIdSteps;

    return nodeIdSteps.map((nodeId) => combinesMap[nodeId] || nodeId);
  }
);
export const selectSelectedPathNodeIdStepsLimited = createSelector(
  selectSelectedPathNodeIdStepsCombined,
  selectPathView,
  (pathNodeIdSteps, pathView) => {
    if (!pathNodeIdSteps || pathView.showFull) return pathNodeIdSteps;

    return pathNodeIdSteps.slice(0, pathView.limit);
  }
);
export const selectSelectedPathNodeIdStepsToView =
  selectSelectedPathNodeIdStepsLimited;

//
// Getting the base nodes in each different view
// E.G: The neighbors of a focussed node
//
const selectBeingViewedPathNodeIdsLinks = createSelector(
  selectView,
  selectSelectedPathNodeIdStepsCombined,
  selectCombinedGraphLinks,
  (view, pathSteps, fullGraphLinks) => {
    if (view.viewStyle !== "path") return null;

    const nodeIdSet = new Set(pathSteps);
    const { linksWithin, remainingLinksAfter: remainingLinks } =
      getLinksWithinNodeSet(nodeIdSet, fullGraphLinks);
    const {
      directlyConnectedNodes: fadingNodeIdsSet,
      directlyConnectedLinks: fadingLinks,
    } = getNodesLinksDirectlyConnectedToNodeSet(nodeIdSet, remainingLinks);

    return {
      nodeIds: Array.from(nodeIdSet),
      links: linksWithin,
      fadingNodeIds: Array.from(fadingNodeIdsSet),
      fadingLinks,
    };
  }
);
const selectBeingViewedNodeGroupNodeIdsLinks = createSelector(
  selectBeingViewedNodeGroupCombinedNodeIds,
  selectCombinedGraphLinks,
  (nodeGroupNodeIds, fullGraphLinks) => {
    if (!nodeGroupNodeIds) return null;

    const nodeIdSet = new Set(nodeGroupNodeIds);
    const { linksWithin, remainingLinksAfter: remainingLinks } =
      getLinksWithinNodeSet(nodeIdSet, fullGraphLinks);
    const {
      directlyConnectedNodes: fadingNodeIdsSet,
      directlyConnectedLinks: fadingLinks,
    } = getNodesLinksDirectlyConnectedToNodeSet(nodeIdSet, remainingLinks);

    return {
      nodeIds: nodeGroupNodeIds,
      links: linksWithin,
      fadingNodeIds: Array.from(fadingNodeIdsSet),
      fadingLinks,
    };
  }
);
const selectBeingViewedFocussedNodeIdsLinks = createSelector(
  selectView,
  selectCombinedGraphLinks,
  selectAllCombinesNodeIdMap,
  selectFocusViewDistance,
  (view, fullGraphLinks, combinesMap, focusViewDistance) => {
    if (view.viewStyle !== "focus") return null;

    let { focusNodeId } = view;
    focusNodeId = combinesMap[focusNodeId] || focusNodeId;

    return focusViewGetSubgraph(
      fullGraphLinks,
      focusNodeId,
      focusViewDistance || 1
    );
  }
);

//
// Non-full graph transformation section
// This section has the transformations that are done *before* you add the full graph to the mix
//

// => Choose between the view selectors
const selectNodeIdsLinksForViewing = createSelector(
  selectView,
  selectBeingViewedPathNodeIdsLinks,
  selectBeingViewedNodeGroupNodeIdsLinks,
  selectBeingViewedFocussedNodeIdsLinks,
  (view, pathInfo, nodeGroupInfo, focusInfo) => {
    switch (view.viewStyle) {
      case "path":
        return pathInfo;
      case "nodeGroup":
        return nodeGroupInfo;
      case "focus":
        return focusInfo;
      case "full":
        return null;
      default:
        // This section should only be reached in error
        // eslint-disable-next-line no-console
        console.error(
          `unrecognised view style "${(view as any).viewStyle}" in reselectView`
        );
        return null;
    }
  }
);

// => Taking the nodeIds from the earlier calculations and mapping them to actual nodes
const selectNodesLinksForViewing = createSelector(
  selectNodeIdsLinksForViewing,
  selectCombinedGraphNodesById,
  selectNodeGroupsById,
  (nodeIdsLinksForViewing, nodesById, nodeGroupsById) => {
    if (nodeIdsLinksForViewing === null) return null;

    const { nodeIds, fadingNodeIds, ...linksRest } = nodeIdsLinksForViewing;
    return {
      ...linksRest,

      nodes: nodeIds
        .map((nodeId) => nodesById[nodeId])
        .filter((node) => !!node),

      fadingNodes: fadingNodeIds
        .map((nodeId) => nodesById[nodeId])
        .filter((node) => !!node),

      nodeGroups: nodeIds
        .map((nodeId) => nodeGroupsById[nodeId])
        .filter((node) => !!node),

      fadingNodeGroups: fadingNodeIds
        .map((nodeId) => nodeGroupsById[nodeId])
        .filter((node) => !!node),
    };
  }
);

const emptyFadingNodes: ReduxNodeWithCombineLogicalInfo[] = [];
const emptyFadingNodeGroups: NodeGroup[] = [];
const emptyFadingLinks: ReduxLink[] = [];

// => Remove fading links if the view so demands
const selectNodesLinksRemoveFadingLinks = createSelector(
  selectNodesLinksForViewing,
  selectFadingLinks,
  (nodesLinksForViewing, fadingLinks) => {
    if (nodesLinksForViewing === null) return null;

    if (fadingLinks) return nodesLinksForViewing;

    return {
      ...nodesLinksForViewing,
      fadingNodes: emptyFadingNodes,
      fadingNodeGroups: emptyFadingNodeGroups,
      fadingLinks: emptyFadingLinks,
    };
  }
);

//
// Add in the full graph
//
const selectNodesLinksIncludingFullGraph = createSelector(
  selectNodesLinksRemoveFadingLinks,
  selectCombinedGraphNodes,
  selectCombinedGraphLinks,
  selectFullViewNodeGroups,
  (nodesLinksForViewing, nodes, links, fullGraphNodeGroups) => {
    if (nodesLinksForViewing) return nodesLinksForViewing;

    return {
      nodes,
      links,
      fadingNodes: emptyFadingNodes,
      fadingLinks: emptyFadingLinks,
      nodeGroups: fullGraphNodeGroups,
      fadingNodeGroups: emptyFadingNodeGroups,
    };
  }
);

//
// Graph to be viewed transformations
// Any graph view comes through these transformations, including full graph
//

interface ExtraNodeInfo {
  fx: number | null;
  fy: number | null;
  pinSourceGroupId: string | null;
}
interface ReduxNodeWithExtraPinInfo
  extends ReduxNodeWithCombineLogicalInfo,
    ExtraNodeInfo {}
interface NodeGroupWithExtraPinInfo extends NodeGroup, ExtraNodeInfo {}

const addPinInformation = <T extends { id: string }>(
  itemList: T[],
  pinMap: { [id: string]: ExtraNodeInfo }
): (T & ExtraNodeInfo)[] =>
  itemList.map((item) => ({
    ...item,
    ...(pinMap[item.id] || { fx: null, fy: null, pinSourceGroupId: null }),
  }));

const selectNodesLinksPinned = createSelector(
  selectNodesLinksIncludingFullGraph,
  selectCombinedPinMap,
  (
    viewGraph,
    pinMap
  ): {
    nodes: ReduxNodeWithExtraPinInfo[];
    fadingNodes: ReduxNodeWithExtraPinInfo[];
    links: ReduxLink[];
    fadingLinks: ReduxLink[];
    nodeGroups: NodeGroupWithExtraPinInfo[];
    fadingNodeGroups: NodeGroupWithExtraPinInfo[];
  } => ({
    ...viewGraph,
    nodes: addPinInformation(viewGraph.nodes, pinMap),
    fadingNodes: addPinInformation(viewGraph.fadingNodes, pinMap),
    nodeGroups: addPinInformation(viewGraph.nodeGroups, pinMap),
    fadingNodeGroups: addPinInformation(viewGraph.fadingNodeGroups, pinMap),
  })
);

interface OngoingEditTransparency {
  ongoingEditIsTransparent: boolean;
}
interface ReduxNodeWithOngoingEditTransparency
  extends ReduxNodeWithExtraPinInfo,
    OngoingEditTransparency {}
interface NodeGroupWithOngoingEditTransparency
  extends NodeGroupWithExtraPinInfo,
    OngoingEditTransparency {}

const selectNodesLinksIncludingPinGroupTransparency = createSelector(
  selectNodesLinksPinned,
  selectBeingEditedPinGroupPins,
  (
    nodesLinksForViewing,
    pins
  ): {
    nodes: ReduxNodeWithOngoingEditTransparency[];
    fadingNodes: ReduxNodeWithExtraPinInfo[];
    links: ReduxLink[];
    fadingLinks: ReduxLink[];
    nodeGroups: NodeGroupWithOngoingEditTransparency[];
    fadingNodeGroups: NodeGroupWithExtraPinInfo[];
  } => ({
    ...nodesLinksForViewing,
    nodes: nodesLinksForViewing.nodes.map((node) => ({
      ...node,
      ongoingEditIsTransparent: pins ? !(node.id in pins) : false,
    })),
    nodeGroups: nodesLinksForViewing.nodeGroups.map((nodeGroup) => ({
      ...nodeGroup,
      ongoingEditIsTransparent: pins ? !(nodeGroup.id in pins) : false,
    })),
  })
);

interface ReduxNodeWithAlreadyInLogicalGroupWarning
  extends ReduxNodeWithOngoingEditTransparency {
  alreadyInLogicalGroupWarning: boolean;
}

const selectNodesLinksIncludingLogicalGroupTransparency = createSelector(
  selectNodesLinksIncludingPinGroupTransparency,
  selectOngoingEdit,
  (
    nodesLinksForViewing,
    ongoingEdit
  ): {
    nodes: ReduxNodeWithAlreadyInLogicalGroupWarning[];
    fadingNodes: ReduxNodeWithExtraPinInfo[];
    links: ReduxLink[];
    fadingLinks: ReduxLink[];
    nodeGroups: NodeGroupWithOngoingEditTransparency[];
    fadingNodeGroups: NodeGroupWithExtraPinInfo[];
  } => {
    if (ongoingEdit?.editType !== "toggleNodesInLogicalGroup") {
      return {
        ...nodesLinksForViewing,
        nodes: nodesLinksForViewing.nodes.map((node) => ({
          ...node,
          alreadyInLogicalGroupWarning: false,
        })),
      };
    }

    return {
      ...nodesLinksForViewing,
      nodes: nodesLinksForViewing.nodes.map((node) => {
        const nodeIsInBeingEditedLogicalGroup =
          node.logicalParent === ongoingEdit.parentNodeId ||
          node.id === ongoingEdit.parentNodeId;
        const nodeIsInALogicalGroup =
          !!node.logicalParent || !!node.logicalChildren.length;
        return {
          ...node,
          ongoingEditIsTransparent: !nodeIsInBeingEditedLogicalGroup,
          alreadyInLogicalGroupWarning:
            nodeIsInALogicalGroup && !nodeIsInBeingEditedLogicalGroup,
        };
      }),
    };
  }
);

const selectNodesLinksIncludingEditNodeGroupTransparency = createSelector(
  selectNodesLinksIncludingLogicalGroupTransparency,
  selectBeingEditedNodeGroupNodes,
  (nodesLinksForViewing, beingEditedGroupNodes) => ({
    ...nodesLinksForViewing,
    nodes: nodesLinksForViewing.nodes.map((node) => ({
      ...node,
      ongoingEditIsTransparent: beingEditedGroupNodes
        ? beingEditedGroupNodes.every(
            (nodeInGroupId) => node.id !== nodeInGroupId
          )
        : node.ongoingEditIsTransparent,
    })),
  })
);

export const selectGraphToView =
  selectNodesLinksIncludingEditNodeGroupTransparency;
export type FullGraphSelectedToView = ReturnType<typeof selectGraphToView>;
export type ReduxNodeSelectedToView = FullGraphSelectedToView["nodes"][0];
export type ReduxFadingNodeSelectedToView =
  FullGraphSelectedToView["fadingNodes"][0];
export type NodeGroupSelectedToView = FullGraphSelectedToView["nodeGroups"][0];
export type FadingNodeGroupSelectedToView =
  FullGraphSelectedToView["fadingNodeGroups"][0];
