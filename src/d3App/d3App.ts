import * as d3 from "d3";
import { createBaseSvgs } from "./svgElements/svgSvg";
import NodeSimulation from "./nodeSimulation";
import reduxSubscribe from "./reduxSubscriber";
import PositionManager from "./positionManager";
import { createGoToHighlightedNodeButton } from "./svgElements/svgPositioningButtons";
import centerViewOnHighlightedNode from "./centerViewOnHighlightedNode";

window.d3 = d3;

const d3AppInit = () => {
  const { baseSvg, contentSvg, controlsSvg } = createBaseSvgs();

  const goToHighlightedNodeButton =
    createGoToHighlightedNodeButton(controlsSvg);

  const simulation = new NodeSimulation(
    contentSvg,
    controlsSvg,
    goToHighlightedNodeButton
  );

  reduxSubscribe(simulation);

  const positionManager = new PositionManager(baseSvg, contentSvg, controlsSvg);

  const boundCenterViewOnHighlightedNode = () =>
    centerViewOnHighlightedNode(simulation, positionManager);

  goToHighlightedNodeButton.on("click", boundCenterViewOnHighlightedNode);

  const { getSimulatedNodeById } = simulation;

  return { boundCenterViewOnHighlightedNode, getSimulatedNodeById };
};

export default d3AppInit;
