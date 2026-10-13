import { Composition, Still } from "remotion";
import { Demo, Thumbnail } from "./Demo";
import timeline from "./timeline.json";
import { PITCH_H, PITCH_SECONDS, PITCH_W, Pitch } from "./Pitch";

const W = 1920;
const H = 1080;

export const Root = () => (
  <>
    <Composition id="MainDemo" component={Demo} width={W} height={H} fps={timeline.main.fps} durationInFrames={timeline.main.frames} defaultProps={{ video: "main" as const, captions: true }} />
    <Composition id="MainDemoClean" component={Demo} width={W} height={H} fps={timeline.main.fps} durationInFrames={timeline.main.frames} defaultProps={{ video: "main" as const, captions: false }} />
    <Composition id="PerplDemo" component={Demo} width={W} height={H} fps={timeline.perpl.fps} durationInFrames={timeline.perpl.frames} defaultProps={{ video: "perpl" as const, captions: true }} />
    <Composition id="PerplDemoClean" component={Demo} width={W} height={H} fps={timeline.perpl.fps} durationInFrames={timeline.perpl.frames} defaultProps={{ video: "perpl" as const, captions: false }} />
    <Composition id="Pitch" component={Pitch} width={PITCH_W} height={PITCH_H} fps={30} durationInFrames={Math.round(PITCH_SECONDS * 30)} defaultProps={{ showCaptions: true }} />
    <Still id="MainThumb" component={Thumbnail} width={1280} height={720} defaultProps={{ video: "main" as const }} />
    <Still id="PerplThumb" component={Thumbnail} width={1280} height={720} defaultProps={{ video: "perpl" as const }} />
  </>
);
