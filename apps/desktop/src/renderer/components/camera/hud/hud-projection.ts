/**
 * The fighter HUD's SVG projection geometry, extracted so both FighterHud and
 * the module host API (host.hud) share one source of truth. A `cameraOverlay`
 * module draws its own SVG in this same viewBox (with preserveAspectRatio
 * 'xMidYMid meet' and the `scale` group) so its symbology lines up with the
 * pitch ladder.
 */

export const HUD_VIEWBOX_W = 1600;
export const HUD_VIEWBOX_H = 900;
export const HUD_CENTER_X = HUD_VIEWBOX_W / 2;
export const HUD_CENTER_Y = HUD_VIEWBOX_H / 2;

const PITCH_HALF_SPAN = 18;
const PITCH_BAND = 250;
/** viewBox units per degree of pitch / azimuth. */
export const HUD_PX_PER_DEG = PITCH_BAND / PITCH_HALF_SPAN;
